import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "pt": "Portuguese", "ja": "Japanese", "ko": "Korean",
    "zh": "Chinese", "ru": "Russian", "ar": "Arabic", "hi": "Hindi",
}

# LRC formatting limits for karaoke readability
MAX_CHARS_PER_LINE = 45
MAX_LINE_DURATION_SEC = 8.0
MAX_GAP_BEFORE_BREAK = 1.4
MIN_GAP_AFTER_PUNCTUATION = 0.7


def _energy_vad(audio: np.ndarray, sr: int, threshold: float = 0.015, min_dur: float = 0.3) -> list[tuple[float, float]]:
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


def _silero_vad(audio_path: str) -> list[tuple[float, float]]:
    """Silero VAD: neural-network based speech detection, much better than energy VAD."""
    try:
        import torch
        torch.set_num_threads(1)

        model, utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
        )
        (get_speech_timestamps, _, _, _, _) = utils

        wav = _read_audio_for_silero(audio_path)
        if wav is None:
            return []

        speech_timestamps = get_speech_timestamps(wav, model, sampling_rate=16000)
        return [(float(ts["start"]) / 16000, float(ts["end"]) / 16000) for ts in speech_timestamps]
    except Exception as e:
        logger.debug(f"Silero VAD unavailable, using energy VAD: {e}")
        return []


def _read_audio_for_silero(audio_path: str):
    try:
        import librosa
        data, sr = librosa.load(str(audio_path), sr=16000, mono=True)
        return data.astype(np.float32)
    except Exception:
        return None


def _isolate_vocals_demucs(audio_path: str) -> str:
    """Run Demucs to isolate vocals, return path to vocals.wav."""
    try:
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
        import torch
        import scipy.io.wavfile as wav

        model = get_model("htdemucs")
        model.to("cpu")
        model.eval()

        import librosa
        data, sr = librosa.load(str(audio_path), sr=44100, mono=False)
        if data.ndim == 1:
            data = np.stack([data, data], axis=0)

        wav_tensor = torch.from_numpy(data).unsqueeze(0)
        with torch.no_grad():
            sources = apply_model(model, wav_tensor, device="cpu", shifts=1, split=True, overlap=0.25)[0]

        stem_names = model.sources
        vocals_idx = stem_names.index("vocals") if "vocals" in stem_names else 3
        vocals = sources[vocals_idx].numpy()

        if vocals.ndim > 1:
            vocals = np.mean(vocals, axis=0)

        peak = np.max(np.abs(vocals))
        if peak > 0:
            vocals = vocals / peak * 0.95

        output_dir = Path("output/lyrics")
        output_dir.mkdir(parents=True, exist_ok=True)
        vocals_path = str(output_dir / f"vocals_isolated_{hash(audio_path) & 0xFFFF}.wav")
        wav.write(vocals_path, 44100, (vocals * 32767).astype(np.int16))

        logger.info(f"Demucs vocals isolated to {vocals_path}")
        return vocals_path
    except Exception as e:
        logger.warning(f"Demucs vocal isolation failed: {e}")
        return audio_path


def transcribe_lyrics(audio_path: str, language: str = "auto", isolate_vocals: bool = False) -> dict:
    """Full pipeline: optional Demucs isolation → VAD → faster-whisper large-v3 → structured output."""
    import librosa

    # Stage 0: Optional Demucs vocal isolation
    transcribe_path = audio_path
    if isolate_vocals:
        logger.info("Isolating vocals with Demucs before transcription...")
        transcribe_path = _isolate_vocals_demucs(audio_path)

    data, sr = librosa.load(str(transcribe_path), sr=None, mono=True)
    data = data.astype(np.float32)
    if np.max(np.abs(data)) > 1e-6:
        data = data / np.max(np.abs(data))

    duration = len(data) / sr

    # Stage 1: VAD — try Silero first, fallback to energy
    speech_segments = _silero_vad(transcribe_path)
    if not speech_segments:
        speech_segments = _energy_vad(data, sr, threshold=0.02, min_dur=0.5)
    logger.info(f"VAD found {len(speech_segments)} speech segments (method={'silero' if _silero_vad else 'energy'})")

    # Stage 2: faster-whisper large-v3 transcription
    all_words: list[dict] = []
    detected_lang = "en"
    model_info = ""

    model, model_info = _get_whisper_model()

    for seg_idx, (seg_start, seg_end) in enumerate(speech_segments):
        i_start = int(seg_start * sr)
        i_end = int(seg_end * sr)
        seg_audio = data[i_start:i_end]

        if len(seg_audio) < sr * 0.5:
            continue

        seg_words = _whisper_transcribe(seg_audio, sr, language, model)
        if seg_words:
            for w in seg_words:
                w["start"] = round(w["start"] + seg_start, 3)
                w["end"] = round(w["end"] + seg_start, 3)

        all_words.extend(seg_words)
        detected_lang = seg_words[0].get("language", "en") if seg_words else detected_lang

    if not all_words:
        logger.info("VAD found no speech, transcribing full file")
        all_words = _whisper_transcribe(data, sr, language, model)
        detected_lang = all_words[0].get("language", "en") if all_words else "en"

    # Stage 3: Music-aware line grouping
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

    logger.info(f"Lyrics: {len(lines)} lines, {len(all_words)} words, lang={detected_lang}, model={model_info}")

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


def _whisper_transcribe(audio: np.ndarray, sr: int, language: str, model) -> list[dict]:
    """Transcribe audio segment with Whisper model, returning word-level timestamps."""
    import tempfile
    import scipy.io.wavfile as wav

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        wav.write(tf.name, sr, audio)
        tmp_path = tf.name

    try:
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
_whisper_model_info = ""


def _get_whisper_model():
    """Load best available Whisper model. Priority: faster-whisper large-v3 > distil-large-v3 > small > openai-whisper."""
    global _whisper_model, _whisper_model_info
    if _whisper_model is not None:
        return _whisper_model, _whisper_model_info

    # Try faster-whisper large-v3 (best accuracy, CTranslate2-optimized)
    for model_name in ["large-v3", "distil-large-v3", "small"]:
        try:
            from faster_whisper import WhisperModel

            class _FasterWrapper:
                def __init__(self, name):
                    self._model = WhisperModel(name, device="cpu", compute_type="int8")

                def transcribe(self, audio_path, language=None, word_timestamps=True, **kw):
                    segments, info = self._model.transcribe(
                        audio_path, language=language, word_timestamps=word_timestamps,
                    )
                    result_segments = []
                    all_words = []
                    detected_lang = info.language
                    for seg in segments:
                        words = []
                        if seg.words:
                            for w in seg.words:
                                words.append({
                                    "word": w.word,
                                    "start": w.start,
                                    "end": w.end,
                                    "confidence": w.probability,
                                })
                        result_segments.append({
                            "start": seg.start, "end": seg.end,
                            "text": seg.text, "confidence": seg.no_speech_prob,
                            "words": words,
                        })
                        all_words.extend(words)
                    return {"segments": result_segments, "language": detected_lang}

            _whisper_model = _FasterWrapper(model_name)
            _whisper_model_info = f"faster-whisper-{model_name}"
            logger.info(f"Loaded {_whisper_model_info}")
            return _whisper_model, _whisper_model_info
        except Exception:
            continue

    # Fallback: openai-whisper small
    for whisper_pkg in ["whisper", "openai_whisper"]:
        try:
            import importlib
            whisper = importlib.import_module(whisper_pkg)
            _whisper_model = whisper.load_model("small")
            _whisper_model_info = f"openai-whisper-small"
            logger.info(f"Loaded {_whisper_model_info}")
            return _whisper_model, _whisper_model_info
        except Exception:
            continue

    raise RuntimeError(
        "No Whisper implementation found. "
        "Install faster-whisper (pip install faster-whisper) for best results."
    )


def _group_words_into_lines(words: list[dict]) -> list[dict]:
    """Music-aware line grouping: enforces max chars, max duration, gap-based breaks,
    and detects chorus/verse patterns for better karaoke formatting."""
    if not words:
        return []

    lines: list[dict] = []
    current_line: list[dict] = [words[0]]

    def line_char_count(line_words):
        return sum(len(w["word"]) for w in line_words) + len(line_words) - 1

    def line_duration(line_words):
        return line_words[-1]["end"] - line_words[0]["start"]

    for i in range(1, len(words)):
        gap = words[i]["start"] - words[i - 1]["end"]
        prev_word = words[i - 1]["word"].strip()

        current_chars = line_char_count(current_line)
        current_dur = line_duration(current_line)
        next_word_len = len(words[i]["word"])

        has_sentence_end = prev_word.endswith(".") or prev_word.endswith("!") or prev_word.endswith("?")
        has_comma = prev_word.endswith(",")

        should_break = (
            gap > MAX_GAP_BEFORE_BREAK
            or current_chars + next_word_len + 1 > MAX_CHARS_PER_LINE
            or current_dur > MAX_LINE_DURATION_SEC
            or len(current_line) >= 12
            or (gap > MIN_GAP_AFTER_PUNCTUATION and has_sentence_end)
            or (gap > 0.6 and has_comma and current_chars > 20)
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

    # Post-process: insert blank lines at large gaps (indicating verse/chorus boundary)
    final_lines = []
    for i, line in enumerate(lines):
        final_lines.append(line)
        if i < len(lines) - 1:
            gap_to_next = lines[i + 1]["start"] - line["end"]
            if gap_to_next > 3.0:
                final_lines.append({
                    "start": line["end"],
                    "end": line["end"],
                    "words": [],
                })

    return final_lines
