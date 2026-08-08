import numpy as np
import scipy.io.wavfile as wav
import scipy.signal as sig
from pathlib import Path
from ..config import get_settings

settings = get_settings()


def change_voice(audio_path: str, semitones: int = 0, formant_shift: float = 0.0) -> dict:
    sr, data = wav.read(audio_path)
    orig_dtype = data.dtype
    if data.ndim > 1:
        data = data.mean(axis=1)
    audio = data.astype(np.float32) / 32767.0 if np.issubdtype(orig_dtype, np.integer) else data.astype(np.float32)

    shifted = audio.copy()

    if semitones != 0:
        pitch_factor = 2 ** (semitones / 12.0)
        # Pitch shift via resample + time-stretch (preserves formants)
        resampled_len = int(len(audio) / pitch_factor)
        resampled = sig.resample(audio, resampled_len)
        shifted = _time_stretch(resampled, len(audio))

    if formant_shift != 0:
        # Formant shift: apply EQ-like spectral tilt
        shifted = _shift_formants(shifted, sr, formant_shift)

    peak = np.max(np.abs(shifted))
    if peak > 0:
        shifted = shifted / peak * 0.95

    suffix = f"_p{semitones}" if semitones else ""
    suffix += f"_f{int(formant_shift)}" if formant_shift else ""
    output_path = str(Path(settings.EDITS_DIR) / f"voicechanged_{Path(audio_path).stem}{suffix}.wav")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    wav.write(output_path, sr, (shifted * 32767).astype(np.int16))

    return {
        "changed_path": output_path,
        "sample_rate": sr,
        "duration": len(shifted) / sr,
        "semitones": semitones,
        "formant_shift": formant_shift,
    }


def _time_stretch(audio: np.ndarray, target_len: int) -> np.ndarray:
    if len(audio) == target_len:
        return audio
    return sig.resample(audio, target_len)


def _shift_formants(audio: np.ndarray, sr: int, shift: float) -> np.ndarray:
    # Simple formant shift via spectral envelope warping
    n_fft = 2048
    hop = n_fft // 4
    num_frames = (len(audio) - n_fft) // hop + 1
    result = np.zeros(len(audio), dtype=np.float32)

    for i in range(num_frames):
        start = i * hop
        segment = audio[start:start + n_fft]
        if len(segment) < n_fft:
            break
        windowed = segment * np.hanning(n_fft)
        spec = np.fft.rfft(windowed)
        mag = np.abs(spec)
        phase = np.angle(spec)

        # Warp magnitude spectrum (shift formants)
        idx = np.arange(len(mag), dtype=np.float64)
        warped_idx = np.clip(idx * (2 ** (-shift / 12.0)), 0, len(mag) - 1)
        warped_mag = np.zeros_like(mag)
        for j in range(len(mag)):
            wi = int(warped_idx[j])
            frac = warped_idx[j] - wi
            warped_mag[j] = mag[wi] * (1 - frac) + mag[min(wi + 1, len(mag) - 1)] * frac

        warped_spec = warped_mag * np.exp(1j * phase)
        result[start:start + n_fft] += np.fft.irfft(warped_spec) * np.hanning(n_fft)

    return result
