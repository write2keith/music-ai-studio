import logging
from pathlib import Path
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

FFMPEG_AVAILABLE = False
DEMUCS_AVAILABLE = False

try:
    import subprocess
    subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
    FFMPEG_AVAILABLE = True
except Exception:
    pass

try:
    from demucs import separate as demucs_separate
    DEMUCS_AVAILABLE = True
except ImportError:
    pass


def get_stems_dir() -> Path:
    path = Path(settings.STEMS_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def separate(audio_path: str, model_name: str = "htdemucs") -> dict:
    if not DEMUCS_AVAILABLE:
        raise RuntimeError(
            "demucs is not installed. Install with: pip install demucs\n"
            "This requires torch (~2GB) and a GPU with 8GB+ VRAM.\n"
            "On CPU it will be very slow (~10 min per track)."
        )

    if not FFMPEG_AVAILABLE:
        raise RuntimeError(
            "ffmpeg is not installed. Download from https://ffmpeg.org/download.html\n"
            "Add ffmpeg.exe to your PATH or set FFMPEG_BINARY env var."
        )

    logger.info(f"Separating stems: {audio_path} (model: {model_name})")

    output_base = get_stems_dir()

    if model_name == "htdemucs_ft":
        demucs_separate.main([
            "--name", model_name,
            "--out", str(output_base),
            "--two-stems", "vocals",
            audio_path,
        ])
    else:
        demucs_separate.main([
            "--name", model_name,
            "--out", str(output_base),
            audio_path,
        ])

    audio_stem = Path(audio_path).stem
    stems_dir = output_base / model_name / audio_stem

    stems = {}
    for f in sorted(stems_dir.glob("*.wav")):
        stems[f.stem] = str(f)

    logger.info(f"Separation complete. Stems: {list(stems.keys())}")
    return {
        "model": model_name,
        "source": audio_path,
        "stems": stems,
        "stems_dir": str(stems_dir),
    }


def get_separator_info() -> dict:
    return {
        "demucs_available": DEMUCS_AVAILABLE,
        "ffmpeg_available": FFMPEG_AVAILABLE,
    }
