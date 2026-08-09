import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "pt": "Portuguese", "ja": "Japanese", "ko": "Korean",
    "zh": "Chinese", "ru": "Russian", "ar": "Arabic", "hi": "Hindi",
}


def _energy_vad(audio: np.ndarray, sr: int, threshold: float = 0.015, min_dur: float = 0.3) -> list[tuple[float, float]]:
    """Simple energy-based voice activity detection. Returns list of (start_sec, end_sec)."""
    frame_len = int(sr * 0.025)
    hop = frame_len // 2
    n_frames = max(1, (len(audio) - frame_len) // hop + 1)

    rms = np.zeros(n_frames)
    for i in range(n_frames):
        start = i * hop
        frame = audio[start:start + frame_len]
        rms[i] = float(np.sqrt(np.mean(frame ** 2)))

    rms_max = float(np.max(rms))
    if rms_max < 1e-8:
        return [(0.0, len(audio) / sr)]

    rms = rms / rms_max
    active = rms > threshold

    segments: list[tuple[float, float]] = []
    i = 0
    while i < n_frames:
        if active[i]:
            j = i
            while j < n_frames and active[j]:
                j += 1
            start_sec = i * hop / sr
            end_sec = min((j - 1) * hop / sr + frame_len / sr, len(audio) / sr)
            if end_sec - start_sec >= min_dur:
                segments.append((start_sec, end_sec))
            i = j
        else:
            i += 1

    if not segments:
        return [(0.0, len(audio) / sr)]
    return segments


def transcribe_lyrics(audio_path: str, language: str = "auto") -> dict:
    """Full pipeline: VAD → Whisper → word-level timestamps → structured output."""
    import scipy.io.wavfile as wav

    sr, data = wav.read(str(audio_path))
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    if np.max(np.abs(data)) > 1e-6:
        data = data / np.max(np.abs(data))

    duration = len(data) / sr

    # Stage 1: VAD
    speech_segments = _energy_vad(data, sr, threshold=0.02, min_dur=0.5)
    logger.info(f"VAD found {len(speech_segments)} speech segments")

    # Concatenate speech segments with small gaps
    all_words: list[dict] = []
    detected_lang = "en"

    for seg_idx, (seg_start, seg_end) in enumerate(speech_segments):
        i_start = int(seg_start * sr)
        i_end = int(seg_end * sr)
        seg_audio = data[i_start:i_end]

        if len(seg_audio) < sr * 0.5:
            continue

        # Stage 2: Whisper transcription with word timestamps
        seg_words = _whisper_transcribe(seg_audio, sr, language)
        if seg_words:
            # Adjust timestamps to absolute time
            for w in seg_words:
                w["start"] = round(w["start"] + seg_start, 3)
                w["end"] = round(w["end"] + seg_start, 3)

        all_words.extend(seg_words)
        detected_lang = seg_words[0].get("language", "en") if seg_words else detected_lang

    if not all_words:
        # Fallback: transcribe entire file
        logger.info("VAD found no speech, transcribing full file")
        all_words = _whisper_transcribe(data, sr, language)
        detected_lang = all_words[0].get("language", "en") if all_words else "en"

    # Stage 3: Group words into lines
    lines = _group_words_into_lines(all_words)

    full_text = " ".join(w["word"] for w in all_words)

    # Save files
    output_dir = Path("output/lyrics")
    output_dir.mkdir(parents=True, exist_ok=True)

    base_name = Path(audio_path).stem
    txt_path = output_dir / f"{base_name}_lyrics.txt"
    lrc_path = output_dir / f"{base_name}_lyrics.lrc"

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(full_text + "\n")

    with open(lrc_path, "w", encoding="utf-8") as f:
        for line in lines:
            start_m = int(line["start"] // 60)
            start_s = line["start"] % 60
            line_text = " ".join(w["word"] for w in line["words"])
            f.write(f"[{start_m:02d}:{start_s:05.2f}] {line_text}\n")

    legacy_lines = [
        {"start": ln["start"], "end": ln["end"], "text": " ".join(w["word"] for w in ln["words"]), "confidence": 0.85}
        for ln in lines
    ]

    logger.info(f"Lyrics: {len(lines)} lines, {len(all_words)} words, lang={detected_lang}")

    return {
        "lines": lines,
        "lyrics": legacy_lines,
        "full_text": full_text,
        "language": LANGUAGE_NAMES.get(detected_lang, detected_lang),
        "lang_code": detected_lang,
        "txt_path": str(txt_path),
        "lrc_path": str(lrc_path),
        "word_count": len(all_words),
        "duration_secs": round(duration, 2),
    }


def _whisper_transcribe(audio: np.ndarray, sr: int, language: str) -> list[dict]:
    """Transcribe audio segment with Whisper, returning word-level timestamps."""
    import tempfile
    import scipy.io.wavfile as wav

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        wav.write(tf.name, sr, audio)
        tmp_path = tf.name

    try:
        model = _get_whisper_model()
        lang_arg = None if language == "auto" else language

        result = model.transcribe(
            tmp_path,
            language=lang_arg,
            word_timestamps=True,
            condition_on_previous_text=False,
            verbose=False,
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    words: list[dict] = []
    for seg in result.get("segments", []):
        seg_words = seg.get("words", [])
        for w in seg_words:
            try:
                word_text = str(w.get("word", "")).strip()
                if word_text and not word_text.startswith("[") and not word_text.startswith("("):
                    words.append({
                        "word": word_text,
                        "start": round(float(w.get("start", 0)), 3),
                        "end": round(float(w.get("end", 0)), 3),
                        "confidence": round(float(w.get("confidence", seg.get("confidence", 0.5))), 2),
                        "language": str(result.get("language", "en")),
                    })
            except (ValueError, TypeError):
                continue

    return words


_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    try:
        import whisper
        _whisper_model = whisper.load_model("small")
        logger.info("Loaded openai-whisper small model")
        return _whisper_model
    except ImportError:
        pass

    try:
        import openai_whisper as whisper
        _whisper_model = whisper.load_model("small")
        logger.info("Loaded openai_whisper small model")
        return _whisper_model
    except ImportError:
        pass

    try:
        from faster_whisper import WhisperModel
        class _FasterWrapper:
            def __init__(self):
                self._model = WhisperModel("small", device="cpu", compute_type="int8")

            def transcribe(self, audio_path, language=None, word_timestamps=True, **kw):
                segments, info = self._model.transcribe(audio_path, language=language, word_timestamps=word_timestamps)
                result_segments = []
                all_words = []
                detected_lang = info.language
                for seg in segments:
                    words = []
                    if seg.words:
                        for w in seg.words:
                            words.append({"word": w.word, "start": w.start, "end": w.end, "confidence": w.probability})
                    result_segments.append({
                        "start": seg.start, "end": seg.end,
                        "text": seg.text, "confidence": seg.no_speech_prob,
                        "words": words,
                    })
                    all_words.extend(words)
                return {"segments": result_segments, "language": detected_lang}

        _whisper_model = _FasterWrapper()
        logger.info("Loaded faster-whisper small model")
        return _whisper_model
    except ImportError:
        pass

    raise RuntimeError(
        "No Whisper implementation found. "
        "Install openai-whisper, faster-whisper, or openai_whisper."
    )


def _group_words_into_lines(words: list[dict]) -> list[dict]:
    """Group word-level timestamps into semantic lines based on pauses."""
    if not words:
        return []

    lines: list[dict] = []
    current_line: list[dict] = [words[0]]

    for i in range(1, len(words)):
        gap = words[i]["start"] - words[i - 1]["end"]
        prev_word = words[i - 1]["word"].strip()
        curr_word = words[i]["word"].strip()

        should_break = (
            gap > 1.2 or
            len(current_line) >= 10 or
            (gap > 0.5 and (prev_word.endswith(".") or prev_word.endswith("!") or prev_word.endswith("?"))) or
            (gap > 0.5 and prev_word.endswith(",") and len(current_line) >= 6)
        )

        if should_break:
            lines.append({
                "start": current_line[0]["start"],
                "end": current_line[-1]["end"],
                "words": [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in current_line],
            })
            current_line = [words[i]]
        else:
            current_line.append(words[i])

    if current_line:
        lines.append({
            "start": current_line[0]["start"],
            "end": current_line[-1]["end"],
            "words": [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in current_line],
        })

    return lines
