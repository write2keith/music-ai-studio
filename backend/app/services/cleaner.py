import numpy as np
import scipy.io.wavfile as wav
from pathlib import Path
from ..config import get_settings

settings = get_settings()


def clean_voice(audio_path: str, noise_reduction: float = 0.7) -> dict:
    sr, data = wav.read(audio_path)
    orig_dtype = data.dtype
    if data.ndim > 1:
        data = data.mean(axis=1)
    audio = data.astype(np.float32) / 32767.0 if np.issubdtype(orig_dtype, np.integer) else data.astype(np.float32)

    n_fft = min(2048, len(audio) // 3)
    if n_fft < 256:
        n_fft = 256

    # Noise profile from quietest 10% of frames
    hop = n_fft // 4
    num_frames = (len(audio) - n_fft) // hop + 1
    frame_energies = np.zeros(num_frames)
    for i in range(num_frames):
        segment = audio[i * hop:i * hop + n_fft]
        frame_energies[i] = np.mean(segment ** 2)

    quiet_threshold = np.percentile(frame_energies, 15)
    noise_profile = np.zeros(n_fft)
    noise_count = 0
    for i in range(num_frames):
        if frame_energies[i] <= quiet_threshold:
            segment = audio[i * hop:i * hop + n_fft]
            if len(segment) == n_fft:
                noise_profile += np.abs(np.fft.rfft(segment * np.hanning(n_fft)))
                noise_count += 1

    if noise_count > 0:
        noise_profile /= noise_count

    # Spectral subtraction with Wiener-like gain
    cleaned = np.zeros_like(audio)
    for i in range(num_frames):
        start = i * hop
        segment = audio[start:start + n_fft]
        if len(segment) < n_fft:
            break
        windowed = segment * np.hanning(n_fft)
        spec = np.fft.rfft(windowed)
        mag = np.abs(spec)
        phase = np.angle(spec)

        gain = np.maximum(mag - noise_reduction * noise_profile, 0.0) / np.maximum(mag, 1e-10)
        gain = np.clip(gain, 0.01, 1.0)
        cleaned_spec = mag * gain * np.exp(1j * phase)
        cleaned_frame = np.fft.irfft(cleaned_spec)
        cleaned[start:start + n_fft] += cleaned_frame * np.hanning(n_fft)

    peak = np.max(np.abs(cleaned))
    if peak > 0:
        cleaned = cleaned / peak * 0.95

    output_path = str(Path(settings.EDITS_DIR) / f"cleaned_{Path(audio_path).stem}.wav")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    wav.write(output_path, sr, (cleaned * 32767).astype(np.int16))

    return {
        "cleaned_path": output_path,
        "sample_rate": sr,
        "duration": len(audio) / sr,
        "noise_profile_frames": noise_count,
    }
