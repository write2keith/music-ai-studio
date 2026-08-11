import logging
import numpy as np
from pathlib import Path
from threading import Thread
from .worker import queue
from ..services.generator import generate as generate_music
from ..services.separator import separate as separate_stems

logger = logging.getLogger(__name__)


def setup_tasks():
    queue.register("generate", _run_generate)
    queue.register("separate", _run_separate)
    queue.register("vocal_prep", _run_vocal_prep)
    queue.register("vocal_remove", _run_vocal_remove)
    queue.register("lyric_transcribe", _run_lyric_transcribe)


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
    import scipy.io.wavfile as wav
    result = separate_stems(
        audio_path=params["audio_path"],
        model_name=params.get("model", "htdemucs"),
    )
    # Convert float32 demucs output to int16 for browser decodeAudioData compatibility
    stems_dir = Path(result["stems_dir"])
    for stem_file in stems_dir.glob("*.wav"):
        sr, data = wav.read(str(stem_file))
        if data.dtype == np.float32:
            converted = (data * 32767).astype(np.int16)
            wav.write(str(stem_file), sr, converted)
    return result


def _run_vocal_prep(params: dict) -> dict:
    import scipy.io.wavfile as wav
    from ..services.vocal_coach import extract_pitch_pyin
    result = separate_stems(
        audio_path=params["audio_path"],
        model_name=params.get("model", "htdemucs"),
    )
    vocals_path = result["stems"].get("vocals")
    if not vocals_path:
        raise RuntimeError("No vocals stem produced")

    # Convert float32 demucs output to int16 for browser decodeAudioData compatibility
    stems_dir = Path(result["stems_dir"])
    for stem_file in stems_dir.glob("*.wav"):
        sr, data = wav.read(str(stem_file))
        if data.dtype == np.float32:
            converted = (data * 32767).astype(np.int16)
            wav.write(str(stem_file), sr, converted)
            logger.debug(f"Converted {stem_file.name} float32 -> int16")

    pyin_result = extract_pitch_pyin(vocals_path)
    pitch_contour = [
        {"time": round(float(pyin_result["times"][i]), 3),
         "midi": int(round(69.0 + 12.0 * np.log2(float(pyin_result["f0"][i]) / 440.0)))
         if pyin_result["voiced_flag"][i] and not np.isnan(pyin_result["f0"][i]) else -1}
        for i in range(0, len(pyin_result["f0"]), 4)
    ]

    backing_paths = {k: v for k, v in result["stems"].items() if k != "vocals"}
    return {
        "model": result["model"],
        "stems_dir": result["stems_dir"],
        "vocals_path": vocals_path,
        "pitch_contour": pitch_contour,
        "backing_stems": backing_paths,
    }


def _run_vocal_remove(params: dict) -> dict:
    import numpy as np
    import scipy.io.wavfile as wav

    result = separate_stems(
        audio_path=params["audio_path"],
        model_name=params.get("model", "htdemucs"),
    )
    stems = result["stems"]
    vocals_path = stems.get("vocals", "")
    non_vocal = {k: v for k, v in stems.items() if k != "vocals" and v}

    # Convert vocals from float32 to int16 for browser compatibility
    if vocals_path:
        v_sr, v_data = wav.read(vocals_path)
        if v_data.dtype == np.float32:
            wav.write(vocals_path, v_sr, (v_data * 32767).astype(np.int16))

    instrumental_path = ""
    if non_vocal:
        stems_list = list(non_vocal.values())
        sr, first = wav.read(stems_list[0])
        mono = first.astype(np.float32)
        if mono.ndim > 1:
            mono = mono.mean(axis=1)
        mixed = np.zeros_like(mono, dtype=np.float32)

        for sp in stems_list:
            _, sd = wav.read(sp)
            sd = sd.astype(np.float32)
            if sd.ndim > 1:
                sd = sd.mean(axis=1)
            mn = min(len(mixed), len(sd))
            mixed[:mn] += sd[:mn]

        peak = np.max(np.abs(mixed))
        if peak > 0:
            mixed = mixed / peak * 0.95
        mixed = (mixed * 32767).astype(np.int16)

        stems_dir = Path(result["stems_dir"])
        instrumental_path = str(stems_dir / "instrumental.wav")
        wav.write(instrumental_path, sr, mixed)
        logger.info(f"Vocal remover: mixed {len(non_vocal)} stems -> {instrumental_path}")

    return {
        "model": result["model"],
        "stems_dir": result["stems_dir"],
        "vocals_path": vocals_path,
        "instrumental_path": instrumental_path,
    }


def _run_lyric_transcribe(params: dict) -> dict:
    from ..services.lyrics import transcribe_lyrics

    audio_path = params["audio_path"]
    lang = params.get("language", "auto")
    isolate_vocals = params.get("isolate_vocals", False)

    logger.info(f"Lyric transcribe: {audio_path}, language={lang}, isolate_vocals={isolate_vocals}")
    return transcribe_lyrics(str(audio_path), language=lang, isolate_vocals=isolate_vocals)
