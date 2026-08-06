import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])
settings = get_settings()


class YouTubeRequest(BaseModel):
    url: str


class YouTubeResponse(BaseModel):
    ok: bool = True
    title: str = ""
    artist: str = ""
    filename: str = ""
    url: str = ""
    duration_secs: float = 0
    thumbnail: str = ""


@router.post("/youtube", response_model=YouTubeResponse)
async def download_youtube(body: YouTubeRequest):
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    import yt_dlp

    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    file_id = uuid.uuid4().hex[:12]
    output_template = str(output_dir / f"yt_{file_id}.%(ext)s")

    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
        title = info.get("title", "Unknown")
        uploader = info.get("uploader", "Unknown Artist")
        duration = info.get("duration", 0) or 0
        thumbnail = info.get("thumbnail", "")

        candidates = list(output_dir.glob(f"yt_{file_id}.*"))
        if not candidates:
            raise HTTPException(status_code=500, detail="Download produced no file")

        filename = candidates[0].name
        logger.info(f"YouTube: '{title}' by {uploader} -> {filename}")

        return YouTubeResponse(
            ok=True,
            title=title,
            artist=uploader,
            filename=filename,
            url=f"/api/audio/{filename}",
            duration_secs=float(duration),
            thumbnail=thumbnail or "",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"YouTube download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)[:200]}")
