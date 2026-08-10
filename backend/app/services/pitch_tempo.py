import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

# Crispness: 0 = normal (1024 window), 1 = crisp (512 window), 2 = very crisp (256 window)
# Smaller windows preserve transients better at the cost of slightly more phase artifacts
CRISPNESS_WINDOWS = {0: 2048, 1: 1024, 2: 512}


def process_pitch_tempo(
    audio_path: str,
    pitch_semitones: float = 0.0,
    tempo_factor: float = 1.0,
    formant_preserved: bool = True,
    transient_preservation: int = 0,
    output_dir: str = "uploads",
) -> dict:
    """High-quality pitch shifting and time stretching using librosa phase vocoder.

    Unlike pydub's sample-rate tricks (which shift pitch and tempo together causing
    formant distortion), this uses independent frequency-domain operations:
    - Pitch shift: librosa.effects.pitch_shift with soxr_hq resampling
    - Time stretch: librosa.effects.time_stretch (phase vocoder)

    Args:
        audio_path: Path to the input audio file
        pitch_semitones: Pitch shift amount (-12 to +12 semitones)
        tempo_factor: Tempo multiplier (0.5 to 2.0)
        formant_preserved: If True, uses librosa phase vocoder (natural timbre).
                          If False, falls back to pydub (classic chipmunk effect).
        transient_preservation: 0=normal, 1=crisp, 2=very crisp. Smaller STFT
                                windows preserve drum hits/transients at extreme settings.
        output_dir: Directory for the output WAV file

    Returns:
        dict with ok, filename, url, duration_secs, original_bpm, adjusted_bpm, engine
    """
    import librosa
    import soundfile as sf
    import uuid
    import numpy as np

    tmp = Path(audio_path)

    if not formant_preserved:
        return _fallback_pydub(tmp, pitch_semitones, tempo_factor, output_dir)

    # Load audio
    data, sr = librosa.load(str(tmp), sr=None, mono=True)
    duration_original = len(data) / sr

    # Clamp parameters
    pitch_semitones = max(-12.0, min(12.0, pitch_semitones))
    tempo_factor = max(0.5, min(2.0, tempo_factor))
    crispness = max(0, min(2, transient_preservation))
    n_fft = CRISPNESS_WINDOWS.get(crispness, 2048)

    original_bpm = _estimate_bpm(data, sr)

    # Process: pitch shift first, then time stretch (order matters for quality)
    processed = data.astype(np.float32)

    if pitch_semitones != 0:
        logger.info(f"Pitch shifting by {pitch_semitones} semitones (n_fft={n_fft})")
        try:
            processed = librosa.effects.pitch_shift(
                y=processed,
                sr=sr,
                n_steps=pitch_semitones,
                n_fft=n_fft,
                hop_length=n_fft // 4,
                res_type="soxr_hq",
            )
        except Exception:
            # Fallback to default resampling if soxr_hq fails
            processed = librosa.effects.pitch_shift(
                y=processed,
                sr=sr,
                n_steps=pitch_semitones,
                n_fft=n_fft,
                hop_length=n_fft // 4,
            )

    if tempo_factor != 1.0:
        logger.info(f"Time stretching by factor {tempo_factor} (n_fft={n_fft})")
        processed = librosa.effects.time_stretch(
            y=processed,
            rate=tempo_factor,
            n_fft=n_fft,
            hop_length=n_fft // 4,
        )

    # Normalize
    peak = np.max(np.abs(processed))
    if peak > 0:
        processed = processed / peak * 0.95

    duration_processed = len(processed) / sr
    adjusted_bpm = original_bpm * tempo_factor if original_bpm > 0 else 0.0

    # Write output
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_filename = f"adjusted_{uuid.uuid4().hex[:12]}.wav"
    out_path = out_dir / out_filename
    sf.write(str(out_path), processed, sr, subtype="PCM_16")

    engine_label = "librosa-phase-vocoder"
    if transient_preservation > 0:
        engine_label += f"-crisp{transient_preservation}"

    return {
        "ok": True,
        "filename": out_filename,
        "url": f"/api/audio/{out_filename}",
        "duration_secs": round(duration_processed, 1),
        "original_bpm": round(original_bpm if original_bpm > 0 else 120.0, 1),
        "adjusted_bpm": round(adjusted_bpm, 1),
        "engine": engine_label,
        "formant_preserved": True,
    }


def _fallback_pydub(tmp_path: Path, pitch_semitones: float, tempo_factor: float, output_dir: str) -> dict:
    """Legacy pydub-based processing (chipmunk effect). Kept as fallback."""
    from pydub import AudioSegment
    import uuid

    audio = AudioSegment.from_file(str(tmp_path))

    original_bpm = 120.0

    if tempo_factor != 1.0:
        try:
            audio = audio.speedup(playback_speed=tempo_factor)
        except Exception:
            try:
                new_frame_rate = int(audio.frame_rate * tempo_factor)
                audio = audio._spawn(audio.raw_data, overrides={"frame_rate": new_frame_rate})
                audio = audio.set_frame_rate(audio.frame_rate)
            except Exception:
                pass

    if pitch_semitones != 0:
        new_sample_rate = int(audio.frame_rate * (2.0 ** (-pitch_semitones / 12.0)))
        try:
            pitched = audio._spawn(audio.raw_data, overrides={"frame_rate": new_sample_rate})
            pitched = pitched.set_frame_rate(audio.frame_rate)
            audio = pitched
        except Exception:
            pass

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_filename = f"adjusted_{uuid.uuid4().hex[:12]}.wav"
    out_path = out_dir / out_filename
    audio.export(str(out_path), format="wav")

    adjusted_bpm = original_bpm * tempo_factor if original_bpm > 0 else 0.0

    return {
        "ok": True,
        "filename": out_filename,
        "url": f"/api/audio/{out_filename}",
        "duration_secs": round(len(audio) / 1000.0, 1),
        "original_bpm": round(original_bpm if original_bpm > 0 else 120.0, 1),
        "adjusted_bpm": round(adjusted_bpm, 1),
        "engine": "pydub-legacy",
        "formant_preserved": False,
    }


def _estimate_bpm(y: np.ndarray, sr: int) -> float:
    """Estimate BPM using onset strength + autocorrelation."""
    try:
        import librosa
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        if hasattr(tempo, "item"):
            tempo = float(tempo.item())
        return max(30.0, min(300.0, float(tempo)))
    except Exception:
        return 120.0
