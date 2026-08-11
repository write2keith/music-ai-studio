import json
import ssl
import urllib.request
import urllib.parse
import base64
import time
import hashlib
import os
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any

try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CONTEXT = ssl.create_default_context()


class BaseImageProvider(ABC):
    @abstractmethod
    def get_artist_image(self, artist_name: str) -> Optional[str]:
        pass

    @abstractmethod
    def get_song_image(self, song_title: str, artist_name: Optional[str] = None) -> Optional[str]:
        pass


class DeezerImageProvider(BaseImageProvider):
    def __init__(self):
        self.base_url = "https://api.deezer.com"

    def _request(self, path: str, params: Dict[str, str]) -> Optional[Dict[str, Any]]:
        query_string = urllib.parse.urlencode(params)
        url = f"{self.base_url}/{path}?{query_string}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MusicAIStudio/1.0"})
            with urllib.request.urlopen(req, context=_SSL_CONTEXT, timeout=5) as response:
                if response.status == 200:
                    return json.loads(response.read().decode("utf-8"))
        except Exception:
            pass
        return None

    def get_artist_image(self, artist_name: str) -> Optional[str]:
        data = self._request("search/artist", {"q": artist_name, "limit": "1"})
        if data and "data" in data and len(data["data"]) > 0:
            artist = data["data"][0]
            return artist.get("picture_xl") or artist.get("picture_big") or artist.get("picture_medium")
        return None

    def get_song_image(self, song_title: str, artist_name: Optional[str] = None) -> Optional[str]:
        query = f"{artist_name} {song_title}" if artist_name else song_title
        data = self._request("search", {"q": query, "limit": "1"})
        if data and "data" in data and len(data["data"]) > 0:
            track = data["data"][0]
            album = track.get("album", {})
            return album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium")
        return None


class SpotifyImageProvider(BaseImageProvider):
    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token: Optional[str] = None
        self.token_expiry: float = 0.0

    def _get_access_token(self) -> bool:
        if self.access_token and time.time() < self.token_expiry:
            return True
        url = "https://accounts.spotify.com/api/token"
        headers = {
            "Authorization": "Basic " + base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode(),
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, context=_SSL_CONTEXT, timeout=5) as response:
                if response.status == 200:
                    res_data = json.loads(response.read().decode("utf-8"))
                    self.access_token = res_data["access_token"]
                    self.token_expiry = time.time() + res_data["expires_in"] - 60
                    return True
        except Exception:
            pass
        return False

    def _request(self, endpoint: str, params: Dict[str, str]) -> Optional[Dict[str, Any]]:
        if not self._get_access_token():
            return None
        query_string = urllib.parse.urlencode(params)
        url = f"https://api.spotify.com/v1/{endpoint}?{query_string}"
        headers = {"Authorization": f"Bearer {self.access_token}"}
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=_SSL_CONTEXT, timeout=5) as response:
                if response.status == 200:
                    return json.loads(response.read().decode("utf-8"))
        except Exception:
            pass
        return None

    def get_artist_image(self, artist_name: str) -> Optional[str]:
        data = self._request("search", {"q": artist_name, "type": "artist", "limit": "1"})
        if data and "artists" in data and "items" in data["artists"] and len(data["artists"]["items"]) > 0:
            artist = data["artists"]["items"][0]
            images = artist.get("images", [])
            if images:
                return images[0].get("url")
        return None

    def get_song_image(self, song_title: str, artist_name: Optional[str] = None) -> Optional[str]:
        query = f'artist:"{artist_name}" track:"{song_title}"' if artist_name else f'track:"{song_title}"'
        data = self._request("search", {"q": query, "type": "track", "limit": "1"})
        if not (data and "tracks" in data and "items" in data["tracks"] and len(data["tracks"]["items"]) > 0) and artist_name:
            data = self._request("search", {"q": f"{artist_name} {song_title}", "type": "track", "limit": "1"})
        if data and "tracks" in data and "items" in data["tracks"] and len(data["tracks"]["items"]) > 0:
            track = data["tracks"]["items"][0]
            album = track.get("album", {})
            images = album.get("images", [])
            if images:
                return images[0].get("url")
        return None


class CachedImageProvider(BaseImageProvider):
    def __init__(self, provider: BaseImageProvider, cache_dir: str):
        self.provider = provider
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)
        self.metadata_path = os.path.join(self.cache_dir, "cache_metadata.json")
        self.metadata = self._load_metadata()

    def _load_metadata(self) -> Dict[str, str]:
        if os.path.exists(self.metadata_path):
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_metadata(self):
        try:
            with open(self.metadata_path, "w", encoding="utf-8") as f:
                json.dump(self.metadata, f, indent=4)
        except Exception:
            pass

    def _get_cache_key(self, prefix: str, name: str) -> str:
        return f"{prefix}_{hashlib.md5(name.lower().encode('utf-8')).hexdigest()}"

    def _download_and_cache(self, key: str, url: Optional[str]) -> Optional[str]:
        if not url:
            return None
        ext = ".jpg"
        for candidate in [".png", ".jpg", ".jpeg", ".webp"]:
            if candidate in url.lower():
                ext = candidate
                break
        filename = f"{key}{ext}"
        local_path = os.path.join(self.cache_dir, filename)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MusicAIStudio/1.0"})
            with urllib.request.urlopen(req, context=_SSL_CONTEXT, timeout=10) as response:
                with open(local_path, "wb") as f:
                    f.write(response.read())
            local_url = f"/api/tools/image-cache/{filename}"
            self.metadata[key] = local_url
            self._save_metadata()
            return local_url
        except Exception:
            pass
        return url

    def get_artist_image(self, artist_name: str) -> Optional[str]:
        key = self._get_cache_key("artist", artist_name)
        if key in self.metadata:
            return self.metadata[key]
        remote_url = self.provider.get_artist_image(artist_name)
        return self._download_and_cache(key, remote_url)

    def get_song_image(self, song_title: str, artist_name: Optional[str] = None) -> Optional[str]:
        query = f"{artist_name or ''}_{song_title}"
        key = self._get_cache_key("song", query)
        if key in self.metadata:
            return self.metadata[key]
        remote_url = self.provider.get_song_image(song_title, artist_name)
        return self._download_and_cache(key, remote_url)


_provider_instance: Optional[BaseImageProvider] = None
_cache_dir: Optional[str] = None

IMAGE_CACHE_DIR = os.path.join("output", "image_cache")


def _get_image_provider() -> BaseImageProvider:
    global _provider_instance, _cache_dir
    if _provider_instance is not None and _cache_dir == IMAGE_CACHE_DIR:
        return _provider_instance

    spotify_id = os.environ.get("SPOTIFY_CLIENT_ID")
    spotify_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
    genius_token = os.environ.get("GENIUS_ACCESS_TOKEN")

    if spotify_id and spotify_secret:
        base = SpotifyImageProvider(spotify_id, spotify_secret)
    else:
        base = DeezerImageProvider()

    _cache_dir = IMAGE_CACHE_DIR
    _provider_instance = CachedImageProvider(base, _cache_dir)
    return _provider_instance


def get_image_urls(artist: str = "", title: str = "") -> dict:
    provider = _get_image_provider()
    result: dict = {"artist_image": "", "song_image": ""}
    if artist:
        result["artist_image"] = provider.get_artist_image(artist) or ""
    if title:
        result["song_image"] = provider.get_song_image(title, artist) or ""
    return result
