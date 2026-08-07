# Session Summary — 2026-08-07

All commits pushed to `https://github.com/write2keith/music-ai-studio` (master).

---

## New Tools Added (7 tools)

### 1. Vocal Remover (`/api/tools/vocal-remove`)
- Upload any song, Demucs separates vocals from instrumental
- Mixes all non-vocal stems into one clean backing track
- Async job with polling, download both instrumental and isolated vocals
- Commit: `d79ac03`

### 2. Chord Detection (`/api/tools/chord-detect`)
- Detects chords in real time from any audio
- Maps detected note combinations to 15+ chord types (major, minor, dim, aug, sus2/4, 7th, maj7, m7, dim7, m7b5, 6th, 9th, add9)
- Shows chord name, constituent notes, confidence score, and timing
- Commit: `d79ac03`

### 3. Pitch & Tempo Adjustment (`/api/tools/pitch-tempo`)
- Pitch shift: -12 to +12 semitones
- Tempo change: 50% to 200%
- Uses pydub sample-rate-based transformation
- Downloads adjusted WAV file
- Commit: `d79ac03`

### 4. Lyric Transcription (`/api/tools/lyric-transcribe`)
- OpenAI Whisper (base model) speech-to-text
- Word-level timestamps with confidence scores
- Async job with polling
- Full text preview + timed line-by-line display
- Commit: `d79ac03`

### 5. Guitar Tab Generator (`/api/tools/guitar-tab`)
- Detects melody notes via FFT, maps to optimal string/fret on standard EADGBE tuning
- Algorithm prefers lower frets on lower strings (cost = fret + string_penalty)
- 22 frets across all 6 strings
- Visual tab grid display with 6 strings, fret numbers, timing, note names
- Commit: `c30c202`

### 6. MIDI Export (`/api/tools/midi-export`)
- Converts any detected notes to standard Type 0 MIDI file
- Raw MIDI writer — no third-party dependency
- Tempo, note-on/off events, velocity included
- Export button on transcribe and guitar tab results
- Commit: `e577f89`

### 7. Machine Learning System (`/api/tools/feedback`, `/api/tools/calibration`)
- Users can correct detected notes inline (click "Correct Notes", edit note name)
- Corrections stored as JSON in `data/calibration/`
- Adaptive parameter tuning: adjusts FFT threshold, stability window, min duration based on error patterns
- After 3+ corrections, analyzes trends (missed notes vs false positives)
- Running accuracy score shown in result headers
- Commit: `d5b9e04`

---

## New Settings Features

### Separation Provider Selector
- Settings page now has a Stem Separation section with provider cards
- Modes: Auto-detect, Local Demucs, Cloud (HuggingFace)
- Shows local availability, GPU status
- Runtime wired — saving instantly updates the separator without restart
- Runtime token `_active_sep_mode` feeds into `separator._use_cloud()`
- Commit: `e577f89`

### LLM Status Display
- Settings page shows whether `USER_LLM_API_KEY` is configured
- LLM auto-detection works: if key is set, uses LLM; if not, uses rule-based fallback
- Compatible with DeepSeek API (free tier) or local Ollama
- Commit: `1541462`

---

## Editor Improvements

### Metronome / Click Track
- Triangle-wave oscillator: 660Hz beat, 880Hz downbeat accent
- Toggle button in transport bar with pulsing dot indicator
- Editable BPM number input (40-300)
- Syncs with play/pause/stop
- Per-beat visual pulse
- Commit: `1541462`

---

## Runtime Wiring Repaired

### Separation Mode
- Previously only read `SEPARATION_MODE` from `.env` at startup
- Now accepts runtime override via `set_active_separation_mode()`
- Settings page POST calls the setter, takes effect immediately
- Commit: `1541462`

---

## LLM / AI Integration Notes

| Component | Technology | Status |
|-----------|-----------|--------|
| Prompt Enhancer | LLM (DeepSeek/Ollama) + fallback | Auto-detects key |
| Note Detection | numpy/scipy FFT | Works without AI |
| Chord Detection | FFT + chord mapping | Works without AI |
| Lyric Transcription | OpenAI Whisper | Needs `pip install openai-whisper` |
| Stem Separation | Demucs (PyTorch) | Local or HuggingFace cloud |
| Music Generation | MusicGen (Transformers) | Local or HuggingFace cloud |
| Vocal Scoring | numpy FFT comparison | Works without AI |
| Guitar Tab | FFT + fret mapping | Works without AI |
| ML Learning | JSON calibration store | Works without AI |

---

## How to Use Local LLM (Ollama)

```bash
# Install Ollama: https://ollama.com/download
ollama pull gemma2:2b   # 2 GB, good quality
# or
ollama pull llama3.2:1b  # 1.3 GB, faster

# Configure backend .env:
USER_LLM_API_KEY=ollama
USER_LLM_BASE_URL=http://localhost:11434/v1
USER_LLM_MODEL=gemma2:2b
```

Or use the free DeepSeek API — sign up at platform.deepseek.com for a key.

---

## Files Changed This Session

| File | Changes |
|------|---------|
| `backend/app/routers/tools.py` | +750 lines — 8 new endpoints (vocal-remove, chord-detect, pitch-tempo, lyric-transcribe, guitar-tab, midi-export, feedback, calibration) |
| `backend/app/routers/settings.py` | +90 lines — separation GET/POST, LLM GET/POST |
| `backend/app/queue/tasks.py` | +80 lines — vocal_remove, lyric_transcribe task handlers |
| `backend/app/services/calibration.py` | New — ML feedback store with adaptive params |
| `backend/app/services/separator.py` | +10 lines — runtime mode setter, checks active mode |
| `backend/app/main.py` | +7 lines — MIDI file static route |
| `backend/requirements.txt` | +1 line — openai-whisper |
| `frontend/src/app/(main)/tools/page.tsx` | +650 lines — 7 new tool sections, correction UI, MIDI export buttons |
| `frontend/src/app/(main)/editor/page.tsx` | +60 lines — metronome click generator, BPM input, transport toggle |
| `frontend/src/app/(main)/settings/page.tsx` | +110 lines — separation provider selector, LLM status badge |
| `frontend/src/lib/api.ts` | +120 lines — 10 new API methods, 8 new TypeScript interfaces |
| `README.md` | Rewritten — architecture, features, quick start |
| `CHANGELOG.md` | +v2.3.0 entry |
| `HELP.md` | New — step-by-step usage guide |
