import numpy as np
import scipy.io.wavfile as wav
import scipy.signal as sig
from pathlib import Path
from ..config import get_settings

settings = get_settings()


def remove_reverb(audio_path: str, strength: float = 0.7) -> dict:
    sr, data = wav.read(audio_path)
    orig_dtype = data.dtype
    if data.ndim > 1:
        data = data.mean(axis=1)
    audio = data.astype(np.float32) / 32767.0 if np.issubdtype(orig_dtype, np.integer) else data.astype(np.float32)

    # Envelope-based dereverberation
    # 1. Compute RMS envelope
    frame_size = 512
    hop = frame_size // 4
    num_frames = (len(audio) - frame_size) // hop + 1
    rms_env = np.zeros(len(audio), dtype=np.float32)

    for i in range(num_frames):
        start = i * hop
        end = start + frame_size
        if end > len(audio):
            break
        rms = np.sqrt(np.mean(audio[start:end] ** 2) + 1e-10)
        rms_env[start:end] = rms

    # 2. Smooth envelope
    smooth_win = int(sr * 0.05)
    rms_env = np.convolve(rms_env, np.ones(smooth_win) / smooth_win, mode="same")

    # 3. Compute reverb tail mask: attenuate where RMS decays slowly
    decay_rate = -np.log(0.001) / (strength * sr * 0.5)
    reverb_mask = np.ones(len(audio), dtype=np.float32)
    peak_hold = 0.0

    for i in range(len(audio)):
        current_rms = rms_env[i]
        peak_hold = max(peak_hold * np.exp(-decay_rate / sr), current_rms)
        # Attenuate if signal is below the held peak (reverb tail)
        ratio = current_rms / max(peak_hold, 1e-10)
        alpha = 1.0 - strength * (1.0 - ratio)
        reverb_mask[i] = np.clip(alpha, 0.1, 1.0)

    # 4. Apply mask
    cleaned = audio * reverb_mask

    # 5. Light high-frequency restore (reverb often dulls highs)
    b, a = sig.butter(2, 3000 / (sr / 2), btype="high")
    high = sig.lfilter(b, a, audio) * 0.15
    cleaned = cleaned + high

    peak = np.max(np.abs(cleaned))
    if peak > 0:
        cleaned = cleaned / peak * 0.95

    output_path = str(Path(settings.EDITS_DIR) / f"dereverb_{Path(audio_path).stem}.wav")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    wav.write(output_path, sr, (cleaned * 32767).astype(np.int16))

    return {
        "cleaned_path": output_path,
        "sample_rate": sr,
        "duration": len(audio) / sr,
        "strength": strength,
    }
