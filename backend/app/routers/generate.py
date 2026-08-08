import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks, Request
from fastapi.responses import FileResponse

from ..models.schemas import (
    GenerationJobResponse,
    AudioResponse,
    StemResponse,
    ErrorResponse,
    GenerateRequest,
    StemModel,
)
from ..queue.worker import queue, JobStatus
from ..config import get_settings
from ..store.tracks import track_store

router = APIRouter(prefix="/api", tags=["ai"])


@router.post(
    "/generate",
    response_model=GenerationJobResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def generate(
    request: Request,
    prompt: str = Form(..., min_length=1, max_length=1000),
    duration: int = Form(default=10, ge=5, le=30),
    genre: str = Form(default=None),
    mood: str = Form(default=None),
    key: str = Form(default=None),
    bpm: int = Form(default=None),
    structure: str = Form(default=None),
):
    try:
        settings = get_settings()
        job = queue.submit("generate", {
            "prompt": prompt.strip(),
            "duration": duration,
            "genre": genre,
            "mood": mood,
            "key": key,
            "bpm": bpm,
            "structure": structure,
        })

        filename = f"{job.id}.wav"
        filepath = str(Path(settings.UPLOAD_DIR) / filename)
        track_store.create_from_generation(
            job_id=job.id,
            prompt=prompt.strip(),
            duration=duration,
            filepath=filepath,
            filename=filename,
            user_id=getattr(request.state, "user_id", None),
            genre=genre,
            mood=mood,
            key=key,
            bpm=bpm,
            structure=structure,
        )

        return GenerationJobResponse(
            job_id=job.id,
            status=job.status,
            created_at=job.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/generate/{job_id}", response_model=GenerationJobResponse)
async def get_generation_status(job_id: str):
    job = queue.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = GenerationJobResponse(
        job_id=job.id,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        error=job.error,
    )

    if job.status == JobStatus.COMPLETED and job.result:
        filepath = job.result.get("filepath", "")
        filename = Path(filepath).name
        response.result = AudioResponse(
            url=f"/api/audio/{filename}",
            filename=filename,
            duration=job.result.get("duration"),
        )
        track_store.complete(job_id, filepath=str(filepath), filename=filename)

    return response


@router.post(
    "/separate",
    response_model=GenerationJobResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def separate(
    file: UploadFile = File(...),
    model: str = Form(default="htdemucs"),
):
    try:
        settings = get_settings()
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)

        ext = Path(file.filename).suffix or ".wav"
        upload_path = upload_dir / f"{uuid.uuid4().hex}{ext}"
        content = await file.read()
        upload_path.write_bytes(content)

        job = queue.submit("separate", {
            "audio_path": str(upload_path),
            "model": model,
        })

        return GenerationJobResponse(
            job_id=job.id,
            status=job.status,
            created_at=job.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/separate/{job_id}",
    response_model=GenerationJobResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_separation_status(job_id: str):
    job = queue.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = GenerationJobResponse(
        job_id=job.id,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        error=job.error,
    )

    if job.status == JobStatus.COMPLETED and job.result:
        stem_urls = {}
        for name, path in job.result.get("stems", {}).items():
            stem_name = Path(path).name
            stem_urls[name] = (
                f"/api/audio/stems/{job.result['model']}/"
                f"{Path(job.result['source']).stem}/{stem_name}"
            )
        response.result = {"model": job.result["model"], "stems": stem_urls}

        mp3_stems = job.result.get("mp3_stems", {})
        if mp3_stems:
            mp3_urls = {}
            for name, path in mp3_stems.items():
                stem_name = Path(path).name
                mp3_urls[name] = (
                    f"/api/audio/stems/{job.result['model']}/"
                    f"{Path(job.result['source']).stem}/{stem_name}"
                )
            response.result["mp3_stems"] = mp3_urls

    return response
