import os
import uuid
import logging
from pathlib import Path

import numpy as np
import soundfile as sf
from pydub import AudioSegment
from pedalboard import Pedalboard, Reverb, Delay, Compressor, Gain, LowpassFilter, HighpassFilter, Distortion, Chorus, Phaser, PitchShift

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)
EDITS_DIR = OUTPUT_DIR / "edits"
EDITS_DIR.mkdir(exist_ok=True)


def _save(audio: AudioSegment, suffix: str = "") -> str:
    filename = f"edit_{uuid.uuid4().hex[:8]}{suffix}.wav"
    filepath = EDITS_DIR / filename
    audio.export(str(filepath), format="wav")
    return str(filepath)


def trim(audio_path: str, start_sec: float, end_sec: float) -> str:
    audio = AudioSegment.from_file(audio_path)
    start_ms = int(start_sec * 1000)
    end_ms = int(end_sec * 1000)
    trimmed = audio[start_ms:end_ms]
    return _save(trimmed, "_trimmed")


def fade(audio_path: str, fade_in_sec: float = 0.0, fade_out_sec: float = 0.0) -> str:
    audio = AudioSegment.from_file(audio_path)
    if fade_in_sec > 0:
        audio = audio.fade_in(int(fade_in_sec * 1000))
    if fade_out_sec > 0:
        audio = audio.fade_out(int(fade_out_sec * 1000))
    return _save(audio, "_faded")


def adjust_volume(audio_path: str, gain_db: float) -> str:
    audio = AudioSegment.from_file(audio_path)
    adjusted = audio + gain_db
    return _save(adjusted, f"_vol{gain_db}")


def normalize(audio_path: str, target_db: float = -1.0) -> str:
    audio = AudioSegment.from_file(audio_path)
    change = target_db - audio.max_dBFS
    normalized = audio.apply_gain(change)
    return _save(normalized, "_normalized")


def speed(audio_path: str, factor: float = 1.0) -> str:
    audio = AudioSegment.from_file(audio_path)
    if factor == 1.0:
        return audio_path
    new_rate = int(audio.frame_rate * factor)
    changed = audio._spawn(audio.raw_data, overrides={"frame_rate": new_rate})
    changed = changed.set_frame_rate(audio.frame_rate)
    return _save(changed, f"_speed{factor}")


def merge_stems(stem_paths: list[str]) -> str:
    combined = None
    for path in stem_paths:
        segment = AudioSegment.from_file(path)
        if combined is None:
            combined = segment
        else:
            combined = combined.overlay(segment)
    if combined is None:
        raise ValueError("No stems to merge")
    return _save(combined, "_merged")


def apply_effects(
    audio_path: str,
    reverb_room_size: float = 0.0,
    reverb_wet: float = 0.0,
    delay_seconds: float = 0.0,
    delay_feedback: float = 0.0,
    delay_mix: float = 0.0,
    eq_low_gain: float = 0.0,
    eq_mid_gain: float = 0.0,
    eq_high_gain: float = 0.0,
    compressor_threshold: float = 0.0,
    compressor_ratio: float = 4.0,
    gain_db: float = 0.0,
    speed_factor: float = 1.0,
) -> str:
    data, sample_rate = sf.read(audio_path)

    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    elif data.shape[1] == 1:
        data = np.column_stack([data[:, 0], data[:, 0]])

    board = Pedalboard([])

    if abs(reverb_room_size) > 0.001 and abs(reverb_wet) > 0.001:
        board.append(Reverb(room_size=reverb_room_size, wet_level=reverb_wet, dry_level=1.0 - reverb_wet))

    if delay_seconds > 0.001 and delay_mix > 0.001:
        board.append(Delay(delay_seconds=delay_seconds, feedback=delay_feedback, mix=delay_mix))

    if abs(eq_low_gain) > 0.1:
        board.append(LowpassFilter(cutoff_hz=max(20, 250 + eq_low_gain * 5)))

    if abs(eq_high_gain) > 0.1:
        board.append(HighpassFilter(cutoff_hz=min(20000, 4000 - eq_high_gain * 5)))

    if abs(eq_mid_gain) > 0.1:
        board.append(Gain(gain_db=eq_mid_gain))

    if compressor_threshold < -0.1:
        board.append(Compressor(threshold_db=compressor_threshold, ratio=compressor_ratio))

    if abs(gain_db) > 0.1:
        board.append(Gain(gain_db=gain_db))

    if len(board) == 0:
        return audio_path

    effected = board(data, sample_rate)

    if speed_factor != 1.0:
        import scipy.signal
        new_len = int(len(effected) / speed_factor)
        indices = np.linspace(0, len(effected) - 1, new_len)
        effected = np.column_stack([
            np.interp(indices, np.arange(len(effected)), effected[:, 0]),
            np.interp(indices, np.arange(len(effected)), effected[:, 1])
        ])

    filename = f"edit_{uuid.uuid4().hex[:8]}_fx.wav"
    filepath = EDITS_DIR / filename
    sf.write(str(filepath), effected, sample_rate)
    return str(filepath)
