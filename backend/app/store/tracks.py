import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class Track:
    def __init__(
        self,
        prompt: str,
        duration: int,
        filepath: str,
        filename: str,
        user_id: Optional[str] = None,
        genre: Optional[str] = None,
        mood: Optional[str] = None,
        key: Optional[str] = None,
        bpm: Optional[int] = None,
        structure: Optional[str] = None,
    ):
        self.id = uuid.uuid4().hex[:12]
        self.title = f"Track {self.id[:6]}"
        self.artist = "You"
        self.user_id = user_id
        self.prompt = prompt
        self.duration_secs = duration
        self.filepath = filepath
        self.filename = filename
        self.url = f"/api/audio/{filename}"
        self.genre = genre or "Untagged"
        self.mood = mood or "Untagged"
        self.key = key or "?"
        self.bpm = bpm or 120
        self.structure = structure
        self.status = "processing"
        self.is_published = False
        self.has_stems = False
        self.play_count = 0
        self.likes = 0
        self.exports: list[str] = []
        self.created_at = datetime.now(timezone.utc)
        self.updated_at: Optional[datetime] = None

    def complete(self):
        self.status = "completed"
        self.exports = ["mp3"]
        self.updated_at = datetime.now(timezone.utc)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "user_id": self.user_id,
            "prompt": self.prompt,
            "duration": self.duration_secs,
            "url": self.url,
            "filename": self.filename,
            "genre": self.genre,
            "mood": self.mood,
            "key": self.key,
            "bpm": self.bpm,
            "structure": self.structure,
            "status": self.status,
            "is_published": self.is_published,
            "has_stems": self.has_stems,
            "play_count": self.play_count,
            "likes": self.likes,
            "exports": self.exports,
            "created_at": self.created_at.isoformat(),
        }


class InMemoryTrackStore:
    def __init__(self):
        self._tracks: dict[str, Track] = {}
        self._community: list[dict] = []
        self._seed_community()

    def _seed_community(self):
        seed_data = [
            {
                "prompt": "A lo-fi hip hop beat for late night studying with soft piano and vinyl crackle",
                "genre": "Lo-Fi",
                "mood": "Chill",
                "bpm": 85,
                "key": "Am",
            },
            {
                "prompt": "Dark synthwave with heavy bass, arpeggiated leads, cyberpunk atmosphere",
                "genre": "Synthwave",
                "mood": "Dark",
                "bpm": 110,
                "key": "Dm",
            },
            {
                "prompt": "Uplifting summer house track with funky bassline, piano chords, and sax solo",
                "genre": "House",
                "mood": "Energetic",
                "bpm": 126,
                "key": "F",
            },
            {
                "prompt": "Aggressive trap beat with 808 slides, spooky melody, and heavy hi-hats",
                "genre": "Trap",
                "mood": "Aggressive",
                "bpm": 140,
                "key": "Cm",
            },
            {
                "prompt": "Dreamy ambient texture with evolving pads and subtle field recordings",
                "genre": "Ambient",
                "mood": "Dreamy",
                "bpm": 70,
                "key": "Gm",
            },
            {
                "prompt": "Jazzy R&B instrumental with warm Rhodes chords, soft drums, and walking bass",
                "genre": "R&B",
                "mood": "Chill",
                "bpm": 92,
                "key": "Eb",
            },
        ]
        artists = ["SynthWizard", "NeonDreams", "BeachVibes", "ShadowBeats", "CloudWalker", "JazzCat"]
        for i, s in enumerate(seed_data):
            track_id = uuid.uuid4().hex[:12]
            self._community.append({
                "id": track_id,
                "title": f"{s['genre']} Vibe #{i+1}",
                "artist": artists[i],
                "artist_avatar": artists[i][:2],
                "prompt": s["prompt"],
                "genre": s["genre"],
                "mood": s["mood"],
                "bpm": s["bpm"],
                "key": s["key"],
                "duration": 180 + i * 20,
                "url": f"/api/audio/track_{track_id}.wav",
                "likes": 100 + i * 50,
                "forks": 20 + i * 10,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    def create_from_generation(
        self,
        job_id: str,
        prompt: str,
        duration: int,
        filepath: str,
        filename: str,
        user_id: Optional[str] = None,
        genre: Optional[str] = None,
        mood: Optional[str] = None,
        key: Optional[str] = None,
        bpm: Optional[int] = None,
        structure: Optional[str] = None,
    ) -> Track:
        track = Track(
            prompt=prompt,
            duration=duration,
            filepath=filepath,
            filename=filename,
            user_id=user_id,
            genre=genre,
            mood=mood,
            key=key,
            bpm=bpm,
            structure=structure,
        )
        track.id = job_id
        self._tracks[job_id] = track
        logger.info(f"Track created: {track.id} ({track.title})")
        return track

    def complete(self, track_id: str, filepath: str = None, filename: str = None) -> Optional[Track]:
        track = self._tracks.get(track_id)
        if track:
            track.complete()
            if filepath:
                track.filepath = filepath
            if filename:
                track.filename = filename
                track.url = f"/api/audio/{filename}"
            logger.info(f"Track completed: {track_id}")
        return track

    def get(self, track_id: str) -> Optional[Track]:
        return self._tracks.get(track_id)

    def list_user_tracks(self, user_id: Optional[str] = None) -> list[dict]:
        tracks = self._tracks.values()
        if user_id:
            tracks = [t for t in tracks if t.user_id == user_id]
        return sorted(
            [t.to_dict() for t in tracks],
            key=lambda t: t["created_at"],
            reverse=True,
        )

    def list_community(self) -> list[dict]:
        return sorted(
            self._community,
            key=lambda t: t["created_at"],
            reverse=True,
        )

    def update(self, track_id: str, **kwargs):
        track = self._tracks.get(track_id)
        if track:
            for k, v in kwargs.items():
                if hasattr(track, k):
                    setattr(track, k, v)
            track.updated_at = datetime.now(timezone.utc)

    def fork(self, track_id: str, user_id: str) -> Optional[Track]:
        source = self._tracks.get(track_id)
        if source:
            forked = Track(
                prompt=source.prompt,
                duration=source.duration_secs,
                filepath=source.filepath,
                filename=source.filename,
                user_id=user_id,
                genre=source.genre,
                mood=source.mood,
                key=source.key,
                bpm=source.bpm,
                structure=source.structure,
            )
            forked.title = f"Fork of {source.title}"
            forked.status = source.status
            self._tracks[forked.id] = forked
            logger.info(f"Track forked: {track_id} -> {forked.id} by user {user_id}")
            return forked

        community = next((p for p in self._community if p["id"] == track_id), None)
        if community:
            community["forks"] = community.get("forks", 0) + 1
            forked = Track(
                prompt=community["prompt"],
                duration=community["duration"],
                filepath="",
                filename=f"track_{track_id}.wav",
                user_id=user_id,
                genre=community["genre"],
                mood=community["mood"],
                key=community["key"],
                bpm=community["bpm"],
            )
            forked.title = f"Fork of {community['title']}"
            forked.status = "completed"
            forked.url = community["url"]
            forked.artist = community["artist"]
            self._tracks[forked.id] = forked
            logger.info(f"Community track forked: {track_id} -> {forked.id} by user {user_id}")
            return forked

        return None


track_store = InMemoryTrackStore()
