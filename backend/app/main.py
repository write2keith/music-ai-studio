import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .config import get_settings
from .routers import generate, edit, tracks, llm, auth, billing
from .routers import settings as settings_router
from .routers import tools as tools_router
from .middleware.auth import AuthMiddleware
from .queue.tasks import setup_tasks
from .queue.worker import queue, JobStatus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Music AI Studio backend...")
    setup_tasks()

    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.EDITS_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.STEMS_DIR).mkdir(parents=True, exist_ok=True)

    yield

    logger.info("Shutting down...")


app = FastAPI(
    title="Music AI Studio API",
    version="2.0.0",
    description="AI-powered music generation, stem separation, and audio editing",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*" if settings.ENVIRONMENT == "development" else None,
    allow_origins=[] if settings.ENVIRONMENT == "development" else settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.add_middleware(AuthMiddleware)

app.include_router(generate.router)
app.include_router(edit.router)
app.include_router(tracks.router)
app.include_router(llm.router)
app.include_router(auth.router)
app.include_router(billing.router)
app.include_router(settings_router.router)
app.include_router(tools_router.router)


@app.get("/api/health")
async def health():
    try:
        from .services.generator import get_model_info
        from .services.separator import get_separator_info
        model_info = get_model_info()
        sep_info = get_separator_info()
        return {
            "status": "ok",
            "service": "Music AI Studio",
            "generation_mode": model_info.get("mode", "unknown"),
            "gpu_available": model_info["gpu_available"],
            "gpu_name": model_info["gpu_name"],
            "cloud_available": model_info.get("cloud_available", False),
            "local_available": model_info.get("local_available", False),
            "demucs_available": sep_info.get("demucs_available", False),
            "ffmpeg_available": sep_info.get("ffmpeg_available", False),
            "environment": settings.ENVIRONMENT,
        }
    except Exception:
        return {
            "status": "degraded",
            "service": "Music AI Studio",
            "gpu_available": False,
            "environment": settings.ENVIRONMENT,
        }


@app.get("/api/model-info")
async def model_info():
    from .services.generator import get_model_info
    return get_model_info()


@app.get("/api/audio/{filename}")
async def serve_audio(filename: str):
    filepath = Path(settings.UPLOAD_DIR) / filename
    if filepath.exists():
        ext = filepath.suffix.lower()
        media_types = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".flac": "audio/flac"}
        return FileResponse(filepath, media_type=media_types.get(ext, "audio/wav"))
    raise HTTPException(status_code=404, detail="Audio file not found")


@app.get("/api/audio/stems/{model}/{source}/{filename}")
async def serve_stem(model: str, source: str, filename: str):
    filepath = Path(settings.STEMS_DIR) / model / source / filename
    if filepath.exists():
        ext = filepath.suffix.lower()
        mime_map = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".ogg": "audio/ogg", ".m4a": "audio/mp4"}
        return FileResponse(filepath, media_type=mime_map.get(ext, "audio/wav"))
    raise HTTPException(status_code=404, detail="Stem file not found")


@app.get("/api/audio/midi/{filename}")
async def serve_midi(filename: str):
    filepath = Path(settings.UPLOAD_DIR) / filename
    if filepath.exists():
        return FileResponse(filepath, media_type="audio/midi")
    raise HTTPException(status_code=404, detail="MIDI file not found")


@app.get("/api/audio/edits/{filename}")
async def serve_edit(filename: str):
    filepath = Path(settings.EDITS_DIR) / filename
    if filepath.exists():
        return FileResponse(filepath, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="Edit file not found")


FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend"
if FRONTEND_DIR.exists():
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str = ""):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        if full_path and (FRONTEND_DIR / full_path).exists():
            return FileResponse(FRONTEND_DIR / full_path)
        return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
        reload_excludes=["output/*", ".tox/*", ".git/*", "__pycache__/*"],
    )
