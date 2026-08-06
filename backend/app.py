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


@app.get("/api/audio/{filename}")
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
