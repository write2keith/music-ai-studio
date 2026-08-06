from threading import Thread
from .worker import queue
from ..services.generator import generate as generate_music
from ..services.separator import separate as separate_stems


def setup_tasks():
    queue.register("generate", _run_generate)
    queue.register("separate", _run_separate)


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
