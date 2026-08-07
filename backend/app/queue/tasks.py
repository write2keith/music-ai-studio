from threading import Thread
from .worker import queue
from ..services.generator import generate as generate_music
from ..services.separator import separate as separate_stems


def setup_tasks():
    queue.register("generate", _run_generate)
    queue.register("separate", _run_separate)
    queue.register("vocal_prep", _run_vocal_prep)


def _run_generate(params: dict) -> dict:
    filepath, duration = generate_music(
        prompt=params["prompt"],
        duration=params.get("duration", 10),
    )
    return {
        "filepath": filepath,
        "duration": duration,
    }


def _run_separate(params: dict) -> dict:
    result = separate_stems(
        audio_path=params["audio_path"],
        model_name=params.get("model", "htdemucs"),
    )
    return result


def _run_vocal_prep(params: dict) -> dict:
    from ..routers.tools import _extract_pitch_contour
    result = separate_stems(
        audio_path=params["audio_path"],
        model_name=params.get("model", "htdemucs"),
    )
    vocals_path = result["stems"].get("vocals")
    if not vocals_path:
        raise RuntimeError("No vocals stem produced")
    pitch_contour = _extract_pitch_contour(vocals_path)
    return {
        "model": result["model"],
        "stems_dir": result["stems_dir"],
        "vocals_path": vocals_path,
        "pitch_contour": pitch_contour,
    }
