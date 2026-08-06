# Music AI Studio

A web application that combines AI music generation and stem separation in one interface. Powered by Meta's MusicGen and Demucs.

## Features

- **Generate Music** -- Text-to-music using Meta MusicGen (small/medium/large models)
- **Separate Stems** -- Split audio into vocals, drums, bass, and other (or 6 stems with piano + guitar)
- **Pipeline Mode** -- Generate music and automatically separate into stems in one step

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU VRAM | 8GB (MusicGen small) | 16GB (MusicGen large) |
| RAM | 16GB | 32GB |
| Storage | ~10GB free | ~20GB |
| Python | 3.10+ | 3.11+ |

CPU-only mode works for Demucs stem separation. MusicGen on CPU is very slow (5-10 min per 10s clip).

## Quick Start

```bash
# Install dependencies
./setup.sh

# Start the app
./start.sh
```

The app runs on `http://localhost:8000` by default.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Server port |
| `MUSICGEN_MODEL_SIZE` | `small` | Model size: small, medium, large |
| `MUSICGEN_DURATION` | `10` | Default generation duration in seconds |

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: Vanilla HTML/CSS/JS
- **Music Generation**: Meta MusicGen via HuggingFace Transformers
- **Stem Separation**: Meta Demucs (htdemucs, htdemucs_ft, htdemucs_6s)

## Project Structure

```
music-ai-studio/
├── backend/
│   ├── app.py            # FastAPI server
│   ├── generator.py      # MusicGen wrapper
│   ├── separator.py      # Demucs wrapper
│   └── requirements.txt
├── frontend/
│   ├── index.html        # UI
│   ├── style.css         # Dark theme
│   └── app.js            # Client logic
├── output/               # Generated audio (gitignored)
├── setup.sh              # Install dependencies
└── start.sh              # Launch app
```

## License

MIT
