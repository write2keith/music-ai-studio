import logging
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
    try:
        import whisper
    except ImportError:
        import openai_whisper as whisper
    from pathlib import Path

    audio_path = params["audio_path"]
    lang = params.get("language", "auto")

    logger.info(f"Lyric transcribe: separating vocals from {audio_path}...")
    try:
        stem_result = separate_stems(audio_path=audio_path, model_name="htdemucs")
        vocals_path = stem_result["stems"].get("vocals")
        if not vocals_path:
            logger.warning("No vocals stem produced, falling back to original audio")
            vocals_path = audio_path
        else:
            logger.info(f"Vocals separated: {vocals_path}")
    except Exception as e:
        logger.warning(f"Vocal separation failed ({e}), using original audio")
        vocals_path = audio_path

    whisper_lang = None if lang == "auto" else lang

    model = whisper.load_model("base")
    result = model.transcribe(
        str(vocals_path),
        language=whisper_lang,
        verbose=False,
        word_timestamps=True,
        condition_on_previous_text=False,
    )

    segments = result.get("segments", [])
    lyrics = []
    for seg in segments:
        try:
            lyrics.append({
                "start": round(float(seg.get("start", 0)), 2),
                "end": round(float(seg.get("end", 0)), 2),
                "text": str(seg.get("text", "")).strip(),
                "confidence": round(float(seg.get("confidence", 0.0)), 2),
            })
        except Exception as parse_err:
            logger.warning(f"Skipping lyric segment: {parse_err}")

    full_text = str(result.get("text", "")).strip()
    detected_lang = str(result.get("language", "en"))

    logger.info(f"Lyric transcription: {len(lyrics)} segments, lang={detected_lang}")

    lyrics_dir = Path("output/lyrics")
    lyrics_dir.mkdir(parents=True, exist_ok=True)
    audio_stem = Path(audio_path).stem
    txt_path = lyrics_dir / f"{audio_stem}_lyrics.txt"
    lrc_path = lyrics_dir / f"{audio_stem}_lyrics.lrc"
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(full_text + "\n")
    with open(lrc_path, "w", encoding="utf-8") as f:
        for seg in lyrics:
            start_m = int(seg["start"] // 60)
            start_s = seg["start"] % 60
            f.write(f"[{start_m:02d}:{start_s:05.2f}] {seg['text']}\n")
    logger.info(f"Lyrics saved: {txt_path}, {lrc_path}")

    return {
        "lyrics": lyrics,
        "full_text": full_text,
        "language": detected_lang,
        "txt_path": str(txt_path),
        "lrc_path": str(lrc_path),
    }
