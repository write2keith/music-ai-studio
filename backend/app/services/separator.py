import logging
from pathlib import Path
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def get_stems_dir() -> Path:
    path = Path(settings.STEMS_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def separate(audio_path: str, model_name: str = "htdemucs") -> dict:
    from demucs import separate as demucs_separate

    logger.info(f"Separating stems: {audio_path} (model: {model_name})")

    output_base = get_stems_dir()
    demucs_separate.main([
        "--name", model_name,
        "--out", str(output_base),
        "--two-stems", "vocals",
        audio_path,
    ]) if model_name == "htdemucs_ft" else demucs_separate.main([
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
