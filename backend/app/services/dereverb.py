import logging
import numpy as np
import scipy.signal as sig
from pathlib import Path
from ..config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def remove_reverb(
    audio_path: str,
    strength: float = 0.7,
    method: str = "wpe",
) -> dict:
    """Remove reverb/echo using the specified method.

    Args:
        audio_path: Path to input WAV.
        strength: 0.0-1.0 dereverb strength.
        method: "wpe" (WPE blind dereverb), "deepfilternet" (neural),
                or "envelope" (legacy RMS mask).

    WPE (Weighted Prediction Error) is the industry-standard algorithm
    for blind dereverberation. It models room reflections as a linear
    prediction problem in the time-frequency domain, subtracting late
    reverberation while preserving the direct-path speech signal.
    """
    if method == "deepfilternet":
        try:
            return _dereverb_deepfilternet(audio_path, strength)
        except Exception as e:
            logger.warning(f"DeepFilterNet failed ({e}), falling back to WPE")
            method = "wpe"

    if method == "wpe":
        try:
            return _dereverb_wpe(audio_path, strength)
        except Exception as e:
            logger.warning(f"WPE failed ({e}), falling back to envelope")
            method = "envelope"

    return _dereverb_envelope(audio_path, strength)


def _load_audio(audio_path: str) -> tuple[np.ndarray, int]:
    import scipy.io.wavfile as wav
    sr, data = wav.read(audio_path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if np.issubdtype(data.dtype, np.integer):
        data = data.astype(np.float64) / 32767.0
    else:
        data = data.astype(np.float64)
    return data, sr


def _save_wav(audio_path: str, data: np.ndarray, sr: int, prefix: str = "dereverb") -> str:
    import scipy.io.wavfile as wav
    data = data.astype(np.float32)
    peak = np.max(np.abs(data))
    if peak > 0:
        data = data / peak * 0.95
    output_path = str(Path(settings.EDITS_DIR) / f"{prefix}_{Path(audio_path).stem}.wav")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    wav.write(output_path, sr, (data * 32767).astype(np.int16))
    return output_path


def _detect_fundamental_f0(y: np.ndarray, sr: int) -> float:
    """Detect the dominant fundamental frequency of voice for adaptive filtering.
    Returns Hz, clamped to 80-500 Hz (voice range). Falls back to 120 Hz."""
    try:
        import librosa
        f0, voiced, _ = librosa.pyin(
            y.astype(np.float32), fmin=65, fmax=600, sr=sr,
            hop_length=512, fill_na=np.nan,
        )
        voiced_f0 = f0[voiced]
        if len(voiced_f0) > 0:
            return max(80.0, min(500.0, float(np.median(voiced_f0))))
    except Exception:
        pass
    return 120.0


# ── Method 1: WPE Blind Dereverberation ──────────────────────────

def _dereverb_wpe(audio_path: str, strength: float) -> dict:
    """Weighted Prediction Error dereverberation."""
    from nara_wpe.wpe import wpe as _wpe
    from nara_wpe.utils import stft, istft

    audio, sr = _load_audio(audio_path)

    # Resample to 16kHz for WPE (standard speech processing rate)
    target_sr = 16000
    if sr != target_sr:
        import librosa
        audio_resampled = librosa.resample(audio, orig_sr=sr, target_sr=target_sr)
    else:
        audio_resampled = audio.copy()

    sr_use = target_sr

    # STFT parameters
    stft_size = 512
    stft_shift = 128

    # WPE parameters
    taps = max(5, int(strength * 15))
    delay = max(1, int(strength * 4))
    iterations = max(1, int(strength * 5))

    # STFT: returns shape (T, F) — frames × freq_bins
    Y = stft(audio_resampled, size=stft_size, shift=stft_shift)
    # WPE expects (channels, frames, freq_bins) = (1, T, F)
    Y_expanded = Y[np.newaxis, :, :]

    # WPE
    X_hat = _wpe(
        Y_expanded,
        taps=taps,
        delay=delay,
        iterations=iterations,
        statistics_mode='full',
    )

    # X_hat is (1, T, F) — squeeze to (T, F) for istft (same as stft output shape)
    X_for_istft = X_hat[0, :, :]

    # Inverse STFT — expects (T, F) shape
    cleaned = istft(X_for_istft, size=stft_size, shift=stft_shift)
    cleaned = cleaned[:len(audio_resampled)]

    # Resample back to original SR
    if sr != target_sr:
        import librosa
        cleaned = librosa.resample(cleaned, orig_sr=target_sr, target_sr=sr)
    else:
        cleaned = cleaned[:len(audio)]

    # Adaptive highpass: detect voice F0, set cutoff at 0.5x F0
    f0_hz = _detect_fundamental_f0(audio, sr)
    hp_cutoff = max(75.0, min(200.0, f0_hz * 0.5))
    nyq = sr / 2
    b, a = sig.butter(2, hp_cutoff / nyq, btype="high")
    cleaned = sig.lfilter(b, a, cleaned)

    output_path = _save_wav(audio_path, cleaned, sr)

    return {
        "cleaned_path": output_path,
        "sample_rate": sr,
        "duration": len(audio) / sr,
        "strength": strength,
        "method": f"wpe-taps{taps}",
        "hp_cutoff_hz": round(hp_cutoff, 0),
        "detected_f0_hz": round(f0_hz, 0),
    }


# ── Method 2: DeepFilterNet Neural ───────────────────────────────

def _dereverb_deepfilternet(audio_path: str, strength: float) -> dict:
    from df.enhance import enhance, init_df, load_audio, save_audio

    model, df_state, _ = init_df()
    audio, sr = load_audio(audio_path, sr=df_state.sr())

    enhanced = enhance(model, df_state, audio)

    output_path = str(Path(settings.EDITS_DIR) / f"dereverb_{Path(audio_path).stem}.wav")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    save_audio(output_path, enhanced, df_state.sr())

    return {
        "cleaned_path": output_path,
        "sample_rate": df_state.sr(),
        "duration": len(enhanced) / df_state.sr(),
        "strength": strength,
        "method": "deepfilternet",
        "hp_cutoff_hz": 0,
        "detected_f0_hz": 0,
    }


# ── Method 3: Legacy Envelope-based (improved) ───────────────────

def _dereverb_envelope(audio_path: str, strength: float) -> dict:
    audio, sr = _load_audio(audio_path)

    frame_size = 512
    hop = frame_size // 4
    num_frames = (len(audio) - frame_size) // hop + 1
    rms_env = np.zeros(len(audio), dtype=np.float64)

    for i in range(num_frames):
        start = i * hop
        end = start + frame_size
        if end > len(audio):
            break
        rms = np.sqrt(np.mean(audio[start:end] ** 2) + 1e-10)
        rms_env[start:end] = rms

    smooth_win = int(sr * 0.05)
    rms_env = np.convolve(rms_env, np.ones(smooth_win) / smooth_win, mode="same")

    decay_rate = -np.log(0.001) / (strength * sr * 0.5)
    reverb_mask = np.ones(len(audio), dtype=np.float64)
    peak_hold = 0.0

    for i in range(len(audio)):
        current_rms = rms_env[i]
        peak_hold = max(peak_hold * np.exp(-decay_rate / sr), current_rms)
        ratio = current_rms / max(peak_hold, 1e-10)
        alpha = 1.0 - strength * (1.0 - ratio)
        reverb_mask[i] = max(0.1, min(1.0, alpha))

    cleaned = audio * reverb_mask

    # Adaptive highpass: detect voice F0, set cutoff at 0.5x F0
    f0_hz = _detect_fundamental_f0(audio, sr)
    hp_cutoff = max(75.0, min(200.0, f0_hz * 0.5))
    nyq = sr / 2
    b_hp, a_hp = sig.butter(2, hp_cutoff / nyq, btype="high")
    cleaned = sig.lfilter(b_hp, a_hp, cleaned)

    output_path = _save_wav(audio_path, cleaned, sr)

    return {
        "cleaned_path": output_path,
        "sample_rate": sr,
        "duration": len(audio) / sr,
        "strength": strength,
        "method": "envelope-v2",
        "hp_cutoff_hz": round(hp_cutoff, 0),
        "detected_f0_hz": round(f0_hz, 0),
    }
