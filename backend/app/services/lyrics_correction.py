import json
import logging
import ssl
import urllib.request
import urllib.parse
from typing import Optional, Dict, Any

try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CONTEXT = ssl.create_default_context()

logger = logging.getLogger(__name__)


def _http_get(url: str, headers: Optional[dict] = None, timeout: int = 5) -> Optional[Dict[str, Any]]:
    hdrs = headers or {}
    hdrs.setdefault("User-Agent", "MusicAIStudio/1.0")
    try:
        req = urllib.request.Request(url, headers=hdrs)
        with urllib.request.urlopen(req, context=_SSL_CONTEXT, timeout=timeout) as response:
            if response.status == 200:
                return json.loads(response.read().decode("utf-8"))
    except Exception:
        pass
    return None


# ── Genius ─────────────────────────────────────────────────────


def _search_genius(query: str, access_token: Optional[str] = None) -> list[dict]:
    if not access_token:
        access_token = _get_env("GENIUS_ACCESS_TOKEN")
    if not access_token:
        logger.debug("No Genius access token configured")
        return []

    params = urllib.parse.urlencode({"q": query})
    url = f"https://api.genius.com/search?{params}"
    data = _http_get(url, {"Authorization": f"Bearer {access_token}"})

    results: list[dict] = []
    if data and "response" in data and "hits" in data["response"]:
        for hit in data["response"]["hits"]:
            result = hit.get("result", {})
            title = result.get("title", "")
            artist = result.get("primary_artist", {}).get("name", "")
            url_val = result.get("url", "")
            if title and artist:
                results.append({"title": title, "artist": artist, "url": url_val, "source": "genius"})
    return results[:5]


def _fetch_genius_lyrics(song_url: str, access_token: Optional[str] = None) -> str:
    """Fetch raw lyrics from Genius song page. Uses simple HTML scraping fallback."""
    if not access_token:
        access_token = _get_env("GENIUS_ACCESS_TOKEN")
    hdrs = {"User-Agent": "Mozilla/5.0 (compatible; MusicAIStudio/1.0)"}
    if access_token:
        hdrs["Authorization"] = f"Bearer {access_token}"
    try:
        req = urllib.request.Request(song_url, headers=hdrs)
        with urllib.request.urlopen(req, context=_SSL_CONTEXT, timeout=10) as response:
            html = response.read().decode("utf-8", errors="replace")
    except Exception:
        return ""

    import re
    # Genius stores lyrics in a div with data-lyrics-container
    pattern = r'<div[^>]*data-lyrics-container[^>]*>(.*?)</div>'
    matches = re.findall(pattern, html, re.DOTALL)
    if not matches:
        return ""

    text = " ".join(matches)
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace("\\n", "\n").replace("\\'", "'").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    return "\n".join(lines)


# ── Spotify ────────────────────────────────────────────────────


def _spotify_token(client_id: str, client_secret: str) -> Optional[str]:
    import base64
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=data,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, context=_SSL_CONTEXT, timeout=5) as response:
            if response.status == 200:
                return json.loads(response.read().decode("utf-8")).get("access_token")
    except Exception:
        pass
    return None


def _search_spotify(query: str) -> list[dict]:
    cid = _get_env("SPOTIFY_CLIENT_ID")
    csec = _get_env("SPOTIFY_CLIENT_SECRET")
    if not cid or not csec:
        return []

    token = _spotify_token(cid, csec)
    if not token:
        return []

    params = urllib.parse.urlencode({"q": query, "type": "track", "limit": "5"})
    url = f"https://api.spotify.com/v1/search?{params}"
    data = _http_get(url, {"Authorization": f"Bearer {token}"})

    results: list[dict] = []
    if data and "tracks" in data and "items" in data["tracks"]:
        for item in data["tracks"]["items"]:
            title = item.get("name", "")
            artist = ", ".join(a.get("name", "") for a in item.get("artists", []))
            if title:
                results.append({"title": title, "artist": artist, "url": item.get("external_urls", {}).get("spotify", ""), "source": "spotify"})
    return results


# ── Musixmatch (via rapidapi) ──────────────────────────────────


def _search_musixmatch(query: str) -> list[dict]:
    api_key = _get_env("RAPIDAPI_KEY")
    if not api_key:
        return []

    params = urllib.parse.urlencode({"q": query})
    url = f"https://musixmatch.p.rapidapi.com/v1/tracks/search?{params}"
    data = _http_get(url, {"X-RapidAPI-Key": api_key, "X-RapidAPI-Host": "musixmatch.p.rapidapi.com"})

    results: list[dict] = []
    if data and "body" in data and "track_list" in data["body"]:
        for item in data["body"]["track_list"]:
            track = item.get("track", {})
            title = track.get("track_name", "")
            artist = track.get("artist_name", "")
            track_id = track.get("track_id", "")
            if title:
                results.append({"title": title, "artist": artist, "url": f"https://www.musixmatch.com/lyrics/{track_id}", "source": "musixmatch"})
    return results[:5]


# ── Lyrics Correction ──────────────────────────────────────────


def _get_env(key: str) -> str:
    import os
    return os.environ.get(key, "")


def search_lyrics(artist: str, title: str) -> list[dict]:
    query = f"{artist} {title}"
    results: list[dict] = []
    results.extend(_search_genius(query))
    results.extend(_search_spotify(query))
    results.extend(_search_musixmatch(query))
    return results


def _normalize_text(text: str) -> str:
    import re
    text = text.lower().strip()
    text = re.sub(r'[^\w\s\']', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text


def _edit_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        s1, s2 = s2, s1
    if len(s2) == 0:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            cost = 0 if c1 == c2 else 1
            curr.append(min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost))
        prev = curr
    return prev[-1]


def correct_lyrics(whisper_lines: list[dict], reference_lyrics: str) -> list[dict]:
    """Align whisper transcription with reference lyrics and correct errors.

    Uses edit-distance alignment to match whisper lines to reference lines,
    replacing whisper text with reference text where alignment confidence is high.
    """
    if not reference_lyrics.strip():
        return whisper_lines

    ref_lines = [l.strip() for l in reference_lyrics.split("\n") if l.strip() and not l.strip().startswith("[")]
    if not ref_lines:
        return whisper_lines

    corrected_lines: list[dict] = []

    ref_idx = 0
    for line in whisper_lines:
        words = line.get("words", [])
        whisper_text = " ".join(w["word"] for w in words)
        norm_whisper = _normalize_text(whisper_text)

        best_ref = ""
        best_dist = float("inf")
        best_idx = ref_idx

        search_range = min(3, len(ref_lines) - ref_idx)
        for offset in range(search_range):
            ri = ref_idx + offset
            if ri >= len(ref_lines):
                break
            norm_ref = _normalize_text(ref_lines[ri])
            dist = _edit_distance(norm_whisper, norm_ref)
            # Weight by offset to prefer closer lines
            dist += offset * 3
            if dist < best_dist:
                best_dist = dist
                best_ref = ref_lines[ri]
                best_idx = ri

        max_len = max(len(norm_whisper), len(_normalize_text(best_ref)))
        confidence = 1.0 - min(best_dist / max(max_len, 1), 1.0)

        corrected = dict(line)
        if confidence > 0.6 and best_ref:
            ref_words = best_ref.split()
            wisp_words = words

            new_words = []
            for i, rw in enumerate(ref_words):
                if i < len(wisp_words):
                    new_words.append({
                        "word": rw,
                        "start": wisp_words[i]["start"],
                        "end": wisp_words[i]["end"],
                        "confidence": round(confidence, 2),
                    })
                else:
                    if wisp_words:
                        last = wisp_words[-1]
                        new_words.append({
                            "word": rw,
                            "start": last["end"],
                            "end": last["end"] + 0.3,
                            "confidence": round(confidence * 0.8, 2),
                        })

            corrected["words"] = new_words
            corrected["_correction_source"] = "reference_lyrics"
            corrected["_correction_confidence"] = round(confidence, 2)
            ref_idx = best_idx + 1

        corrected_lines.append(corrected)

    return corrected_lines


def fetch_lyrics_text(url: str, source: str) -> str:
    if source == "genius":
        return _fetch_genius_lyrics(url)
    elif source == "spotify":
        return ""
    elif source == "musixmatch":
        return ""
    return _fetch_genius_lyrics(url)
