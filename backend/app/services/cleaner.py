import logging
import numpy as np
from pathlib import Path
from ..config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def clean_voice(
    audio_path: str,
    noise_reduction: float = 0.7,
    method: str = "noisereduce",
    stationary: bool = True,
) -> dict:
    """Clean voice audio using the specified method.

    Args:
        audio_path: Path to the input WAV file.
        noise_reduction: Strength 0.0-1.0 (maps to dB reduction in noisereduce).
        method: "noisereduce" (spectral gating), "deepfilternet" (deep learning),
                or "spectral" (legacy Wiener-style).
        stationary: If True, assume stationary noise (AC hum, fan). If False,
                    use non-stationary mode for dynamic noise (traffic, clicks).
    """
    if method == "deepfilternet":
        try:
            return _clean_deepfilternet(audio_path, noise_reduction)
        except Exception as e:
            logger.warning(f"DeepFilterNet failed ({e}), falling back to noisereduce")
            method = "noisereduce"

    if method == "noisereduce":
        try:
            return _clean_noisereduce(audio_path, noise_reduction, stationary)
        except Exception as e:
            logger.warning(f"noisereduce failed ({e}), falling back to spectral")
            method = "spectral"

    return _clean_spectral(audio_path, noise_reduction)


def _load_audio(audio_path: str) -> tuple[np.ndarray, int]:
    """Load WAV as float32 mono. Supports integer and float WAVs."""
    import scipy.io.wavfile as wav

    sr, data = wav.read(audio_path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if np.issubdtype(data.dtype, np.integer):
        data = data.astype(np.float32) / 32767.0
    else:
        data = data.astype(np.float32)
    return data, sr


def _save_wav(audio_path: str, data: np.ndarray, sr: int) -> str:
    """Save float32 audio as 16-bit WAV to the edits directory."""
    import scipy.io.wavfile as wav

    peak = np.max(np.abs(data))
    if peak > 0:
        data = data / peak * 0.95

    output_path = str(Path(settings.EDITS_DIR) / f"cleaned_{Path(audio_path).stem}.wav")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    wav.write(output_path, sr, (data * 32767).astype(np.int16))
    return output_path


# ── Method 1: noisereduce Spectral Gating ─────────────────────────

def _clean_noisereduce(
    audio_path: str,
    noise_reduction: float,
    stationary: bool,
) -> dict:
    import noisereduce as nr

    audio, sr = _load_audio(audio_path)
    reduction_db = _strength_to_db(noise_reduction)

    if stationary:
        reduced = nr.reduce_noise(
            y=audio,
            sr=sr,
            stationary=True,
            prop_decrease=noise_reduction,
            n_fft=2048,
            hop_length=512,
            win_length=2048,
            freq_mask_smooth_hz=500,
            time_mask_smooth_ms=50,
        )
    else:
        # Non-stationary: adaptive gating with time-frequency smoothing
        reduced = nr.reduce_noise(
            y=audio,
            sr=sr,
            stationary=False,
            prop_decrease=noise_reduction,
            n_fft=2048,
            hop_length=512,
            win_length=2048,
            freq_mask_smooth_hz=200,
            time_mask_smooth_ms=25,
            n_std_thresh_stationary=1.5,
        )

    output_path = _save_wav(audio_path, reduced, sr)

    return {
        "cleaned_path": output_path,
        "sample_rate": sr,
        "duration": len(audio) / sr,
        "noise_profile_frames": 0,
        "method": f"noisereduce-{'stationary' if stationary else 'nonstationary'}",
        "reduction_db": reduction_db,
    }


# ── Method 2: DeepFilterNet Deep Learning ─────────────────────────

def _clean_deepfilternet(audio_path: str, noise_reduction: float) -> dict:
    """DeepFilterNet speech enhancement.

    Only loaded on first use to avoid startup overhead.
    Requires: pip install deepfilternet
    Models auto-download from HuggingFace on first run.
    """
    from df.enhance import enhance, init_df, load_audio, save_audio

    model, df_state, _ = init_df()
    audio, sr = load_audio(audio_path, sr=df_state.sr())

    enhanced = enhance(model, df_state, audio)

    output_path = str(Path(settings.EDITS_DIR) / f"cleaned_{Path(audio_path).stem}.wav")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    save_audio(output_path, enhanced, df_state.sr())

    return {
        "cleaned_path": output_path,
        "sample_rate": df_state.sr(),
        "duration": len(enhanced) / df_state.sr(),
        "noise_profile_frames": 0,
        "method": "deepfilternet",
        "reduction_db": 0,
    }


# ── Method 3: Legacy Spectral Subtraction (with soft-masking) ─────

def _clean_spectral(audio_path: str, noise_reduction: float) -> dict:
    """Improved spectral subtraction with:
    - Soft-exponent masking (prevents musical noise artifacts)
    - Phase preservation (no zeroing of phase)
    - Overlap-add with weighted synthesis windows (prevents aliasing)
    """
    audio, sr = _load_audio(audio_path)

    n_fft = min(2048, len(audio) // 3)
    if n_fft < 256:
        n_fft = 256

    # Noise profile: quietest frames with Hann weighting
    hop = n_fft // 4
    num_frames = (len(audio) - n_fft) // hop + 1
    if num_frames < 2:
        # Too short for profiling, return as-is
        output_path = _save_wav(audio_path, audio, sr)
        return {
            "cleaned_path": output_path,
            "sample_rate": sr,
            "duration": len(audio) / sr,
            "noise_profile_frames": 0,
            "method": "spectral-subtraction-v2",
            "reduction_db": 0,
        }

    frame_rms = np.zeros(num_frames)
    for i in range(num_frames):
        seg = audio[i * hop:i * hop + n_fft]
        if len(seg) == n_fft:
            frame_rms[i] = np.sqrt(np.mean(seg ** 2))

    rms_thresh = np.percentile(frame_rms[frame_rms > 1e-10], 15) if np.any(frame_rms > 1e-10) else 0.0

    noise_profile = np.zeros(n_fft // 2 + 1)
    noise_count = 0
    for i in range(num_frames):
        if frame_rms[i] <= rms_thresh:
            seg = audio[i * hop:i * hop + n_fft]
            if len(seg) == n_fft:
                noise_profile += np.abs(np.fft.rfft(seg * np.hanning(n_fft)))
                noise_count += 1

    if noise_count > 0:
        noise_profile /= noise_count

    # Soft-masking: exponent-based gain avoids hard binary chopping
    # gain = (mag^beta) / (mag^beta + (alpha * noise)^beta)
    # beta=2 = classical Wiener; beta=1 = square-root (softer)
    window = np.hanning(n_fft)
    window_sq = window ** 2
    cleaned = np.zeros_like(audio)
    window_sum = np.zeros_like(audio)
    alpha = noise_reduction * 1.5  # scale 0-1 → 0-1.5 over-subtraction factor
    beta = max(0.5, 2.0 - noise_reduction)  # softer masking at higher reduction
    noise_floor = np.max(noise_profile) * 0.01  # absolute floor to prevent zeroing

    for i in range(num_frames):
        start = i * hop
        segment = audio[start:start + n_fft]
        if len(segment) < n_fft:
            break
        windowed = segment * window
        spec = np.fft.rfft(windowed)
        mag = np.abs(spec)
        phase = np.angle(spec)

        # Soft Wiener-like gain with exponent and noise floor
        estimated_noise = alpha * noise_profile + noise_floor
        mag_safe = np.maximum(mag, 1e-10)
        # Soft mask: retains partial energy even when noise dominates
        gain = (mag_safe ** beta) / (mag_safe ** beta + estimated_noise ** beta)
        gain = np.clip(gain, 0.02, 1.0)  # minimum gain floor = -34dB, preserves phase

        cleaned_spec = mag * gain * np.exp(1j * phase)
        cleaned_frame = np.fft.irfft(cleaned_spec, n=n_fft)
        cleaned[start:start + n_fft] += cleaned_frame * window
        window_sum[start:start + n_fft] += window_sq

    cleaned = np.divide(cleaned, np.maximum(window_sum, 1e-10))

    output_path = _save_wav(audio_path, cleaned, sr)
    reduction_db = _strength_to_db(noise_reduction)

    return {
        "cleaned_path": output_path,
        "sample_rate": sr,
        "duration": len(audio) / sr,
        "noise_profile_frames": noise_count,
        "method": "spectral-subtraction-v2",
        "reduction_db": reduction_db,
    }


# ── Helpers ───────────────────────────────────────────────────────

def _strength_to_db(strength: float) -> int:
    """Map 0.0-1.0 strength to approximate dB reduction."""
    return round(strength * 24)  # 0 -> 0dB, 0.5 -> 12dB, 1.0 -> 24dB
