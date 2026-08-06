import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from ..models.schemas import (
    AudioResponse,
    ErrorResponse,
    TrimRequest,
    FadeRequest,
    VolumeRequest,
    NormalizeRequest,
    SpeedRequest,
    EffectsRequest,
)
from ..config import get_settings

router = APIRouter(prefix="/api/edit", tags=["edit"])


def _save_upload(file: UploadFile) -> Path:
    settings = get_settings()
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix or ".wav"
    path = upload_dir / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(file.file.read())
    return path


def _edit_url(filepath: str) -> str:
    return f"/api/audio/edits/{Path(filepath).name}"


@router.post("/trim", response_model=AudioResponse)
async def edit_trim(
    file: UploadFile = File(...),
    start_sec: float = Form(default=0.0, ge=0),
    end_sec: float = Form(default=0.0, ge=0),
):
    try:
        upload_path = _save_upload(file)
        from ..services.editor import trim
        result_path = trim(str(upload_path), start_sec, end_sec)
        return AudioResponse(url=_edit_url(result_path), filename=Path(result_path).name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fade", response_model=AudioResponse)
async def edit_fade(
    file: UploadFile = File(...),
    fade_in: float = Form(default=0.0, ge=0, le=30),
    fade_out: float = Form(default=0.0, ge=0, le=30),
):
    try:
        upload_path = _save_upload(file)
        from ..services.editor import fade
        result_path = fade(str(upload_path), fade_in, fade_out)
        return AudioResponse(url=_edit_url(result_path), filename=Path(result_path).name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/volume", response_model=AudioResponse)
async def edit_volume(
    file: UploadFile = File(...),
    gain_db: float = Form(default=0.0, ge=-60, le=60),
):
    try:
        upload_path = _save_upload(file)
        from ..services.editor import adjust_volume
        result_path = adjust_volume(str(upload_path), gain_db)
        return AudioResponse(url=_edit_url(result_path), filename=Path(result_path).name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/normalize", response_model=AudioResponse)
async def edit_normalize(
    file: UploadFile = File(...),
    target_db: float = Form(default=-1.0, ge=-24, le=0),
):
    try:
        upload_path = _save_upload(file)
        from ..services.editor import normalize
        result_path = normalize(str(upload_path), target_db)
        return AudioResponse(url=_edit_url(result_path), filename=Path(result_path).name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/speed", response_model=AudioResponse)
async def edit_speed(
    file: UploadFile = File(...),
    factor: float = Form(default=1.0, ge=0.25, le=4.0),
):
    try:
        upload_path = _save_upload(file)
        from ..services.editor import speed
        result_path = speed(str(upload_path), factor)
        return AudioResponse(url=_edit_url(result_path), filename=Path(result_path).name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/merge", response_model=AudioResponse)
async def edit_merge(files: list[UploadFile] = File(...)):
    try:
        paths = []
        settings = get_settings()
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        for f in files:
            ext = Path(f.filename).suffix or ".wav"
            up = upload_dir / f"{uuid.uuid4().hex}{ext}"
            up.write_bytes(await f.read())
            paths.append(str(up))
        from ..services.editor import merge_stems
        result_path = merge_stems(paths)
        return AudioResponse(url=_edit_url(result_path), filename=Path(result_path).name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/effects", response_model=AudioResponse)
async def edit_effects(
    file: UploadFile = File(...),
    reverb_room_size: float = Form(default=0.0, ge=0, le=1.0),
    reverb_wet: float = Form(default=0.0, ge=0, le=1.0),
    delay_seconds: float = Form(default=0.0, ge=0, le=2.0),
    delay_feedback: float = Form(default=0.0, ge=0, le=1.0),
    delay_mix: float = Form(default=0.0, ge=0, le=1.0),
    eq_low_gain: float = Form(default=0.0, ge=-24, le=24),
    eq_mid_gain: float = Form(default=0.0, ge=-24, le=24),
    eq_high_gain: float = Form(default=0.0, ge=-24, le=24),
    compressor_threshold: float = Form(default=0.0, ge=-60, le=0),
    compressor_ratio: float = Form(default=4.0, ge=1.0, le=20.0),
    gain_db: float = Form(default=0.0, ge=-24, le=24),
    speed_factor: float = Form(default=1.0, ge=0.25, le=4.0),
):
    try:
        upload_path = _save_upload(file)
        from ..services.editor import apply_effects
        result_path = apply_effects(
            str(upload_path),
            reverb_room_size=reverb_room_size,
            reverb_wet=reverb_wet,
            delay_seconds=delay_seconds,
            delay_feedback=delay_feedback,
            delay_mix=delay_mix,
            eq_low_gain=eq_low_gain,
            eq_mid_gain=eq_mid_gain,
            eq_high_gain=eq_high_gain,
            compressor_threshold=compressor_threshold,
            compressor_ratio=compressor_ratio,
            gain_db=gain_db,
            speed_factor=speed_factor,
        )
        return AudioResponse(url=_edit_url(result_path), filename=Path(result_path).name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
