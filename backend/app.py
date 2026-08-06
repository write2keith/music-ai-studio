import os
import uuid
import logging
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Music AI Studio", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)
UPLOAD_DIR = OUTPUT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
EDITS_DIR = OUTPUT_DIR / "edits"
EDITS_DIR.mkdir(exist_ok=True)


def _save_upload(file: UploadFile) -> Path:
    ext = Path(file.filename).suffix or ".wav"
    upload_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    upload_path.write_bytes(file.file.read())
    return upload_path


def _edit_url(filepath: str) -> str:
    return f"/api/audio/edits/{Path(filepath).name}"


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Music AI Studio"}


@app.get("/api/model-info")
async def model_info():
    try:
        from generator import get_model_info
        return get_model_info()
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/generate")
async def generate(prompt: str = Form(...), duration: int = Form(10)):
    try:
        from generator import generate_music
        filepath = generate_music(prompt, duration=duration)
        filename = Path(filepath).name
        return {"filename": filename, "url": f"/api/audio/{filename}"}
    except Exception as e:
        logger.exception("Generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/separate")
async def separate(file: UploadFile = File(...), model: str = Form("htdemucs")):
    try:
        ext = Path(file.filename).suffix or ".wav"
        upload_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
        content = await file.read()
        upload_path.write_bytes(content)

        from separator import separate_stems
        result = separate_stems(str(upload_path), model_name=model)

        stem_urls = {}
        for name, path in result["stems"].items():
            stem_name = Path(path).name
            stem_urls[name] = f"/api/audio/stems/{result['model']}/{Path(result['source']).stem}/{stem_name}"

        return {
            "model": result["model"],
            "stems": stem_urls,
        }
    except Exception as e:
        logger.exception("Separation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/edit/trim")
async def edit_trim(file: UploadFile = File(...), start_sec: float = Form(0), end_sec: float = Form(0)):
    try:
        upload_path = _save_upload(file)
        from editor import trim
        result_path = trim(str(upload_path), start_sec, end_sec)
        return {"url": _edit_url(result_path)}
    except Exception as e:
        logger.exception("Trim failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/edit/fade")
async def edit_fade(file: UploadFile = File(...), fade_in: float = Form(0), fade_out: float = Form(0)):
    try:
        upload_path = _save_upload(file)
        from editor import fade
        result_path = fade(str(upload_path), fade_in, fade_out)
        return {"url": _edit_url(result_path)}
    except Exception as e:
        logger.exception("Fade failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/edit/volume")
async def edit_volume(file: UploadFile = File(...), gain_db: float = Form(0)):
    try:
        upload_path = _save_upload(file)
        from editor import adjust_volume
        result_path = adjust_volume(str(upload_path), gain_db)
        return {"url": _edit_url(result_path)}
    except Exception as e:
        logger.exception("Volume failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/edit/normalize")
async def edit_normalize(file: UploadFile = File(...), target_db: float = Form(-1.0)):
    try:
        upload_path = _save_upload(file)
        from editor import normalize
        result_path = normalize(str(upload_path), target_db)
        return {"url": _edit_url(result_path)}
    except Exception as e:
        logger.exception("Normalize failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/edit/speed")
async def edit_speed(file: UploadFile = File(...), factor: float = Form(1.0)):
    try:
        upload_path = _save_upload(file)
        from editor import speed
        result_path = speed(str(upload_path), factor)
        return {"url": _edit_url(result_path)}
    except Exception as e:
        logger.exception("Speed failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/edit/merge")
async def edit_merge(files: list[UploadFile] = File(...)):
    try:
        paths = []
        for f in files:
            ext = Path(f.filename).suffix or ".wav"
            up = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
            up.write_bytes(await f.read())
            paths.append(str(up))
        from editor import merge_stems
        result_path = merge_stems(paths)
        return {"url": _edit_url(result_path)}
    except Exception as e:
        logger.exception("Merge failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/edit/effects")
async def edit_effects(
    file: UploadFile = File(...),
    reverb_room_size: float = Form(0.0),
    reverb_wet: float = Form(0.0),
    delay_seconds: float = Form(0.0),
    delay_feedback: float = Form(0.0),
    delay_mix: float = Form(0.0),
    eq_low_gain: float = Form(0.0),
    eq_mid_gain: float = Form(0.0),
    eq_high_gain: float = Form(0.0),
    compressor_threshold: float = Form(0.0),
    compressor_ratio: float = Form(4.0),
    gain_db: float = Form(0.0),
    speed_factor: float = Form(1.0),
):
    try:
        upload_path = _save_upload(file)
        from editor import apply_effects
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
        return {"url": _edit_url(result_path)}
    except Exception as e:
        logger.exception("Effects failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/audio/edits/{filename}")
async def serve_edit(filename: str):
    filepath = EDITS_DIR / filename
    if filepath.exists():
        return FileResponse(filepath, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="Edit file not found")


async def serve_audio(filename: str):
    filepath = OUTPUT_DIR / filename
    if filepath.exists():
        return FileResponse(filepath, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="Audio file not found")


@app.get("/api/audio/stems/{model}/{source}/{filename}")
async def serve_stem(model: str, source: str, filename: str):
    filepath = OUTPUT_DIR / "stems" / model / source / filename
    if filepath.exists():
        return FileResponse(filepath, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="Stem file not found")


FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
