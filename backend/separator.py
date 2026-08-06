import os
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


def separate_stems(audio_path: str, model_name: str = "htdemucs") -> dict:
    from demucs import separate

    logger.info(f"Separating stems for: {audio_path} using model: {model_name}")

    output_base = OUTPUT_DIR / "stems"
    output_base.mkdir(exist_ok=True)

    separate.main([
        "--name", model_name,
        "--out", str(output_base),
        audio_path
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
