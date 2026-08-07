# Music AI Studio Usage Guide

## Quick Start

Open two terminals:

```bash
# Terminal 1 — Backend (port 8000)
cd backend && python3 -m app.main

# Terminal 2 — Frontend (port 3000)
cd frontend && npm run dev
```

Visit `http://localhost:3000`. Login with any email/password (dev mode accepts any credentials).

## Sidebar Navigation

| Icon | Page | What It Does |
|------|------|-------------|
| Home | Studio Dashboard | Prompt builder for AI music generation |
| Layers | Generate | Upload audio, split into vocal/drum/bass/guitar/piano stems |
| Mic | Editor | Multitrack DAW — record, mix, export |
| Users | Community | Browse public tracks, fork and listen |
| Library | Library | Your personal track collection |
| Wrench | Tools | YouTube extractor, compressor, note detection, vocal coach |
| Settings | Settings | Configure AI providers and API keys |

## Studio Dashboard

1. Choose genre, mood, key, BPM, and structure from dropdowns
2. Type a text description or let the Smart Enhancer expand it
3. Click "Generate" — a job starts in the queue
4. Wait for completion (progress bar shows status)
5. Generated tracks appear in the Recent section

## Generate (Stem Separation)

1. Upload any music file (WAV, MP3, M4A, FLAC, OGG)
2. Click "Separate" — async job starts
3. Polling shows progress: "Loading model...", "Processing audio..."
4. When done, 6 stems appear: Vocals, Drums, Bass, Guitar, Piano, Other
5. Click any stem to play or download

## Multitrack Editor

1. Navigate to `/editor`
2. Each track shows: name, waveform area, arm (record), mute (M), solo (S), volume slider
3. Click "Arm" (red circle) on a track to enable recording
4. Click "Record" in the transport bar — speak/sing/play into your microphone
5. Click "Stop" — the audio appears as a waveform on the armed track
6. Click "Play" to hear all tracks simultaneously
7. Click "Export Mix" to download a combined WAV file

**Important:** Grant microphone permission when prompted by the browser.

## Tools

### YouTube Extractor

1. Paste a YouTube URL
2. Click "Extract" — audio downloads via yt-dlp
3. Play, download, or jump to stem separation

### Audio Compressor

1. Upload any audio file (WAV, MP3, M4A, FLAC, OGG)
2. Choose sample rate (44.1k, 22k, 16k, 11k, 8k), bit depth (16, 8), mono toggle
3. Choose output format: WAV or MP3 (128kbps)
4. Click "Compress" — shows file size reduction
5. Download the compressed file

### Note Detection

1. Upload an instrument stem or melody recording
2. Choose detection method:
   - **Mono (FFT)** — single notes, best for melodies and solos
   - **Polyphonic** — chords (up to 6 notes at once), best for guitar chords and piano voicings
3. Click "Detect Notes" — results show note name (A4, C5), MIDI number, start time, duration, velocity
4. Play detected notes or download results

### Vocal Coach

**Step 1 — Upload Reference**
1. Upload any song (full mix recommended)
2. Click "Prepare Vocal" — backend separates vocals and extracts pitch contour
3. Wait for processing (takes a minute on CPU)
4. The reference pitch curve (cyan line) appears on the graph

**Step 2 — Record Yourself**
1. Click "Start Recording" and grant mic permission
2. Sing along with the reference
3. A live pitch indicator (purple line) appears in real-time
4. The current note name and MIDI number display above the graph
5. Click "Stop Recording"

**Step 3 — Get Scored**
1. Click "Get Score"
2. The system compares your pitch contour against the reference
3. Results show:
   - **Grade** — S (95%+), A (85%+), B (70%+), C (55%+), D (40%+), F (below 40%)
   - **Score** — percentage of frames where your pitch matches
   - **Graph** — dual-line overlay (cyan reference, purple your recording) on MIDI note grid

**Tips for better scores:**
- Use headphones while singing to avoid reference bleeding into your mic
- Sing in a quiet room
- Choose a song within your vocal range
- Partial credit is given: within 1 semitone = 75%, 2 = 50%, 3 = 25%

## Settings

Configure AI providers at `/settings`:

- **HuggingFace Token** — required for cloud music generation and stem separation fallback
- **LLM API Key** — OpenAI-compatible key for Smart Prompt Enhancer (rule-based fallback if empty)
- **Generation Mode** — local (GPU), cloud (HuggingFace API), or auto (GPU if available, cloud if not)
- **Separation Mode** — same auto/local/cloud options

## Troubleshooting

### Upload Not Working on Windows

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
This bypasses the Next.js proxy for multipart file uploads.

### Server OOM or Unresponsive

Kill stale Python worker processes:
```bash
pkill -f "multiprocessing" && pkill -f app.main
```
Then restart the backend.

### Stem Separation Is Very Slow

On CPU, Demucs can take 8+ minutes for a single file. Options:
- Use smaller files (under 5 minutes)
- Set `SEPARATION_MODE=cloud` in your env to use HuggingFace API
- Skip the "Other" stem when you only need vocals, drums, bass, guitar, piano

### Vocal Coach Reference Doesn't Process

Make sure:
- The file is a valid audio format (WAV/MP3)
- Demucs can load (check backend console for "Loading model" messages)
- You wait for the job to complete (polling auto-updates every 3 seconds)

### Note Detection Shows Too Many/Few Notes

- Mono mode: use clean instrument stems (isolated melody lines work best, chords cause overdetection)
- Polyphonic mode: use separated instrument stems (full mixes with drums cause artifacts in the spectrum)
- Algorithm parameters are tuned but not perfect — adjust by editing `_detect_notes_fft` thresholds in `backend/app/routers/tools.py`

### YouTube Download Fails (403 Error)

YouTube rate-limits downloads from automated clients. Wait a few minutes and try again with a different video.

### Multitrack Recording Shows No Waveform

- Check browser mic permissions in site settings
- Confirm your mic input level is not zero
- Try a different browser (Chrome/Edge have best MediaRecorder support)
