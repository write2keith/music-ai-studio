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
    window_samples = int(sr * 0.05)
    hop_samples = int(window_samples / 2)
    num_windows = (len(data) - window_samples) // hop_samples + 1

    notes = []
    prev_midi = -1
    prev_start = 0.0

    for i in range(num_windows):
        start = i * hop_samples
        frame = data[start : start + window_samples]
        rms = np.sqrt(np.mean(frame ** 2))

        if rms < 0.02:
            if prev_midi >= 0:
                end_time = (start + window_samples / 2) / sr
                notes.append({
                    "start_time": round(prev_start, 3),
                    "end_time": round(end_time, 3),
                    "pitch": prev_midi,
                    "note_name": _hz_to_note(440.0 * 2 ** ((prev_midi - 69) / 12))[1],
                    "velocity": 0.5,
                })
                prev_midi = -1
            continue

        windowed = frame * np.hanning(len(frame))
        fft = np.abs(np.fft.rfft(windowed))
        freqs = np.fft.rfftfreq(len(windowed), 1.0 / sr)

        peak_idx = np.argmax(fft[1:]) + 1
        freq = freqs[peak_idx]

        if 30 < freq < 4000:
            midi, name = _hz_to_note(freq)
            if midi != prev_midi and prev_midi >= 0:
                end_time = (start + window_samples / 2) / sr
                notes.append({
                    "start_time": round(prev_start, 3),
                    "end_time": round(end_time, 3),
                    "pitch": prev_midi,
                    "note_name": _hz_to_note(440.0 * 2 ** ((prev_midi - 69) / 12))[1],
                    "velocity": round(min(1.0, rms * 3), 2),
                })
            prev_midi = midi
            prev_start = (start + window_samples / 2) / sr
        elif prev_midi >= 0:
            end_time = (start + window_samples / 2) / sr
            notes.append({
                "start_time": round(prev_start, 3),
                "end_time": round(end_time, 3),
                "pitch": prev_midi,
                "note_name": _hz_to_note(440.0 * 2 ** ((prev_midi - 69) / 12))[1],
                "velocity": 0.5,
            })
            prev_midi = -1

    if prev_midi >= 0:
        notes.append({
            "start_time": round(prev_start, 3),
            "end_time": round(duration, 3),
            "pitch": prev_midi,
            "note_name": _hz_to_note(440.0 * 2 ** ((prev_midi - 69) / 12))[1],
            "velocity": 0.5,
        })

    merged = []
    for n in notes:
        if merged and merged[-1]["pitch"] == n["pitch"] and n["start_time"] - merged[-1]["end_time"] < 0.05:
            merged[-1]["end_time"] = n["end_time"]
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
