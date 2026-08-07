import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel

from ..config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])
settings = get_settings()


class YouTubeRequest(BaseModel):
    url: str


class YouTubeResponse(BaseModel):
    ok: bool = True
    title: str = ""
    artist: str = ""
    filename: str = ""
    url: str = ""
    duration_secs: float = 0
    thumbnail: str = ""


class CompressResponse(BaseModel):
    ok: bool = True
    original_size: int = 0
    compressed_size: int = 0
    reduction_pct: float = 0
    filename: str = ""
    url: str = ""
    sample_rate: int = 0
    duration_secs: float = 0
    channels: int = 1


class NoteEvent(BaseModel):
    start_time: float
    end_time: float
    pitch: int
    note_name: str
    velocity: float


class TranscribeResponse(BaseModel):
    ok: bool = True
    notes: list[NoteEvent] = []
    duration_secs: float = 0
    method: str = "fft"
    note_count: int = 0


@router.post("/youtube", response_model=YouTubeResponse)
async def download_youtube(body: YouTubeRequest):
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    import yt_dlp

    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    file_id = uuid.uuid4().hex[:12]
    output_template = str(output_dir / f"yt_{file_id}.%(ext)s")

    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
        title = info.get("title", "Unknown")
        uploader = info.get("uploader", "Unknown Artist")
        duration = info.get("duration", 0) or 0
        thumbnail = info.get("thumbnail", "")

        candidates = list(output_dir.glob(f"yt_{file_id}.*"))
        if not candidates:
            raise HTTPException(status_code=500, detail="Download produced no file")

        filename = candidates[0].name
        logger.info(f"YouTube: '{title}' by {uploader} -> {filename}")

        return YouTubeResponse(
            ok=True,
            title=title,
            artist=uploader,
            filename=filename,
            url=f"/api/audio/{filename}",
            duration_secs=float(duration),
            thumbnail=thumbnail or "",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"YouTube download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)[:200]}")


@router.post("/compress", response_model=CompressResponse)
async def compress_audio(
    file: UploadFile = File(...),
    sample_rate: int = Form(default=22050),
    bit_depth: int = Form(default=16),
    to_mono: bool = Form(default=True),
):
    import numpy as np
    import scipy.io.wavfile as wav

    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    original_content = await file.read()
    original_size = len(original_content)

    tmp_path = output_dir / f"compress_in_{uuid.uuid4().hex[:12]}.wav"
    tmp_path.write_bytes(original_content)

    try:
        sr, data = wav.read(str(tmp_path))
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Unable to read audio file. Only WAV format is supported.")

    if data.ndim > 1:
        if to_mono:
            data = data.mean(axis=1)
        else:
            data = data[:, 0]

    if sample_rate < sr:
        from scipy import signal
        ratio = sample_rate / sr
        new_len = int(len(data) * ratio)
        data = signal.resample(data, new_len)

    dtype = np.int16 if bit_depth == 16 else np.int8
    max_val = np.max(np.abs(data))
    if max_val > 0:
        data = data / max_val
    data = (data * (np.iinfo(dtype).max - 1)).astype(dtype)

    duration = len(data) / sample_rate
    out_filename = f"compressed_{uuid.uuid4().hex[:12]}.wav"
    out_path = output_dir / out_filename
    wav.write(str(out_path), sample_rate, data)

    compressed_size = out_path.stat().st_size
    reduction_pct = round((1 - compressed_size / original_size) * 100, 1) if original_size > 0 else 0

    tmp_path.unlink(missing_ok=True)

    logger.info(f"Compressed: {original_size}B -> {compressed_size}B ({reduction_pct}% reduction)")

    return CompressResponse(
        ok=True,
        original_size=original_size,
        compressed_size=compressed_size,
        reduction_pct=reduction_pct,
        filename=out_filename,
        url=f"/api/audio/{out_filename}",
        sample_rate=sample_rate,
        duration_secs=round(duration, 1),
        channels=1 if to_mono else 2,
    )


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _hz_to_note(hz: float) -> tuple[int, str]:
    if hz <= 0:
        return 0, "?"
    midi = int(round(69 + 12 * __import__("math").log2(hz / 440.0)))
    midi = max(0, min(127, midi))
    return midi, f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def _detect_notes_fft(audio_path: str) -> dict:
    import numpy as np
    import scipy.io.wavfile as wav

    sr, data = wav.read(str(audio_path))
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    max_val = np.max(np.abs(data))
    if max_val > 0:
        data = data / max_val

    duration = len(data) / sr

    window_sec = 0.12
    hop_sec = 0.04
    window_samples = int(sr * window_sec)
    hop_samples = int(sr * hop_sec)
    if window_samples > len(data):
        return {"notes": [], "duration_secs": round(duration, 1), "method": "fft"}
    num_windows = (len(data) - window_samples) // hop_samples + 1

    rms_values = []
    for i in range(num_windows):
        start = i * hop_samples
        frame = data[start : start + window_samples]
        rms_values.append(float(np.sqrt(np.mean(frame ** 2))))

    rms_arr = np.array(rms_values)
    nonzero = rms_arr[rms_arr > 1e-6]
    noise_floor = float(np.median(nonzero)) if len(nonzero) > 0 else 1e-6
    threshold = max(0.03, noise_floor * 2.5)

    fft_len = window_samples
    freqs = np.fft.rfftfreq(fft_len, 1.0 / sr)
    freq_mask = (freqs >= 40) & (freqs <= 3500)
    valid_freqs = freqs[freq_mask]
    valid_indices = np.where(freq_mask)[0]

    raw_events = []
    for i in range(num_windows):
        if rms_values[i] < threshold:
            raw_events.append(None)
            continue

        start = i * hop_samples
        frame = data[start : start + window_samples]
        windowed = frame * np.hanning(len(frame))
        fft = np.abs(np.fft.rfft(windowed, n=fft_len))
        fft_valid = fft[valid_indices]

        peak_rel = int(np.argmax(fft_valid))
        peak_idx = valid_indices[peak_rel]

        y0 = fft[peak_idx]
        if 1 <= peak_rel < len(fft_valid) - 1:
            y_left = fft_valid[peak_rel - 1]
            y_right = fft_valid[peak_rel + 1]
            delta = 0.5 * (y_left - y_right) / (y_left - 2 * y0 + y_right + 1e-10)
            delta = max(-0.5, min(0.5, delta))
            freq = valid_freqs[peak_rel] + delta * (valid_freqs[1] - valid_freqs[0])
        else:
            freq = valid_freqs[peak_rel]

        midi, name = _hz_to_note(freq)
        vel = min(1.0, round(rms_values[i] / max(noise_floor, 1e-6) * 0.4, 2))
        raw_events.append({
            "time": (start + window_samples / 2) / sr,
            "midi": midi,
            "name": name,
            "velocity": vel,
            "rms": rms_values[i],
        })

    stability = 3
    notes = []
    buffer = []

    for evt in raw_events:
        if evt is None:
            if buffer:
                midis = [e["midi"] for e in buffer]
                midi = round(np.mean(midis))
                name = _hz_to_note(440.0 * 2 ** ((midi - 69) / 12))[1]
                vel = round(float(np.mean([e["velocity"] for e in buffer])), 2)
                notes.append({
                    "start_time": round(buffer[0]["time"], 3),
                    "end_time": round(buffer[-1]["time"], 3),
                    "pitch": midi,
                    "note_name": name,
                    "velocity": vel,
                })
                buffer = []
            continue

        if not buffer:
            buffer = [evt]
            continue

        midis = [e["midi"] for e in buffer]
        midi_mode = max(set(midis), key=midis.count)
        if evt["midi"] == midi_mode or abs(evt["midi"] - midi_mode) <= 1:
            buffer.append(evt)
        else:
            if len(buffer) >= stability:
                midis = [e["midi"] for e in buffer]
                midi = round(np.mean(midis))
                name = _hz_to_note(440.0 * 2 ** ((midi - 69) / 12))[1]
                vel = round(float(np.mean([e["velocity"] for e in buffer])), 2)
                notes.append({
                    "start_time": round(buffer[0]["time"], 3),
                    "end_time": round(buffer[-1]["time"], 3),
                    "pitch": midi,
                    "note_name": name,
                    "velocity": vel,
                })
            buffer = [evt]

    if buffer and len(buffer) >= stability:
        midis = [e["midi"] for e in buffer]
        midi = round(np.mean(midis))
        name = _hz_to_note(440.0 * 2 ** ((midi - 69) / 12))[1]
        vel = round(float(np.mean([e["velocity"] for e in buffer])), 2)
        notes.append({
            "start_time": round(buffer[0]["time"], 3),
            "end_time": round(buffer[-1]["time"], 3),
            "pitch": midi,
            "note_name": name,
            "velocity": vel,
        })

    min_duration = 0.08
    notes = [n for n in notes if n["end_time"] - n["start_time"] >= min_duration]

    merged = []
    for n in notes:
        if merged and merged[-1]["pitch"] == n["pitch"] and n["start_time"] - merged[-1]["end_time"] < 0.12:
            merged[-1]["end_time"] = n["end_time"]
            merged[-1]["velocity"] = round(max(merged[-1]["velocity"], n["velocity"]), 2)
        else:
            merged.append(n)

    return {
        "notes": merged,
        "duration_secs": round(duration, 1),
        "method": "fft",
    }


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_notes(
    file: UploadFile = File(...),
):
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    tmp_path = output_dir / f"transcribe_{uuid.uuid4().hex[:12]}{ext}"
    tmp_path.write_bytes(content)

    wav_path = tmp_path
    try:
        import scipy.io.wavfile
        scipy.io.wavfile.read(str(wav_path))
    except Exception:
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(str(tmp_path))
            wav_path = output_dir / f"transcribe_{uuid.uuid4().hex[:12]}.wav"
            audio.export(str(wav_path), format="wav")
            tmp_path.unlink(missing_ok=True)
            scipy.io.wavfile.read(str(wav_path))
        except Exception as e:
            for p in [tmp_path, wav_path]:
                p.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail="Unable to read audio file. Supported formats: WAV, MP3, M4A, FLAC, OGG. Ensure ffmpeg is installed for non-WAV formats.",
            )

    try:
        result = _detect_notes_fft(str(wav_path))
    except Exception as e:
        wav_path.unlink(missing_ok=True)
        if wav_path != tmp_path:
            tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)[:200]}")

    wav_path.unlink(missing_ok=True)
    if wav_path != tmp_path:
        tmp_path.unlink(missing_ok=True)

    return TranscribeResponse(
        ok=True,
        notes=[NoteEvent(**n) for n in result["notes"]],
        duration_secs=result["duration_secs"],
        method=result["method"],
        note_count=len(result["notes"]),
    )
