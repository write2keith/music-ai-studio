# Music AI Studio

A production-grade DAW-inspired web application combining AI music generation, stem separation, audio editing, vocal coaching, multitrack recording, and instrument note detection. Powered by Meta MusicGen, Demucs, Pedalboard, and scipy.

## Architecture

```
music-ai-studio/
├── backend/                     # FastAPI Python backend
│   ├── app/
│   │   ├── main.py              # FastAPI entry point with lifespan
│   │   ├── config.py            # Centralized settings via pydantic-settings
│   │   ├── routers/
│   │   │   ├── generate.py      # /api/generate, /api/separate endpoints
│   │   │   ├── edit.py          # /api/edit/* endpoints
│   │   │   ├── tracks.py        # /api/tracks, /api/community, /api/library
│   │   │   ├── auth.py          # /api/auth/register, /login, /logout, /me
│   │   │   ├── billing.py       # /api/billing/plans, /credits, /checkout, /webhook
│   │   │   ├── tools.py         # /api/tools/youtube, /compress, /transcribe, /vocal-score, /vocal-prep
│   │   │   ├── settings.py      # /api/settings/generation
│   │   │   └── llm.py           # /api/enhance-prompt (LLM prompt enrichment)
│   │   ├── store/
│   │   │   ├── tracks.py        # In-memory track store with community seeding
│   │   │   └── users.py         # In-memory user store with bcrypt auth
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic request/response validation
│   │   ├── services/
│   │   │   ├── generator.py     # MusicGen (HuggingFace Transformers)
│   │   │   ├── separator.py     # Demucs stem separation
│   │   │   ├── editor.py        # pydub + Pedalboard audio editing
│   │   │   └── llm.py           # OpenAI-compatible LLM prompt enhancer
│   │   ├── queue/
│   │   │   ├── worker.py        # In-memory job queue (Redis fallback ready)
│   │   │   └── tasks.py         # Registered async task handlers
│   │   └── middleware/
│   │       └── auth.py          # JWT authentication middleware
│   ├── prisma/
│   │   └── schema.prisma        # Database schema
│   └── requirements.txt
├── frontend/                    # Next.js TypeScript frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # Root layout (auth + toast + audio providers)
│   │   │   ├── globals.css      # DAW dark theme design system
│   │   │   ├── (main)/          # Authenticated routes (sidebar + topnav shell)
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx     # Redirect to /studio
│   │   │   │   ├── studio/      # Studio dashboard
│   │   │   │   ├── community/   # Community feed
│   │   │   │   ├── library/     # Personal library
│   │   │   │   ├── generate/    # Stem separation
│   │   │   │   ├── tools/       # YouTube, Compressor, Note Detection, Vocal Coach
│   │   │   │   ├── editor/      # Multitrack DAW recorder
│   │   │   │   └── settings/    # AI provider configuration
│   │   │   └── (auth)/          # Auth routes (standalone, no shell)
│   │   │       └── login/       # DAW-themed login/register page
│   │   ├── components/
│   │   │   ├── ui/              # Design primitives (Button, Card, Badge, Tabs, Toast, Skeleton, Progress)
│   │   │   ├── studio/          # Sidebar, TopNav, PromptBuilder, TrackCard, CreditWidget, TrackRow
│   │   │   ├── community/       # CommunityFeed component
│   │   │   ├── library/         # LibraryView component
│   │   │   ├── AudioPlayer.tsx
│   │   │   ├── WaveformEditor.tsx
│   │   │   └── PitchGraph.tsx   # Dual-line pitch graph canvas
│   │   └── lib/
│   │       ├── api.ts           # Typed API client (all endpoints)
│   │       ├── types.ts         # TypeScript interfaces
│   │       ├── hooks.ts         # Data fetching + mutation hooks
│   │       ├── auth-context.tsx # Auth context provider
│   │       ├── audio-player.tsx # Global audio player context
│   │       └── utils.ts         # cn(), formatTime(), formatSize()
│   └── next.config.ts           # API proxy rewrites + proxyClientMaxBodySize
├── HELP.md                       # Detailed usage guide
├── CHANGELOG.md
└── README.md
```

## Key Design Decisions

| Concern | Implementation |
|---------|---------------|
| UI Framework | Next.js 16 + TailwindCSS v4 + framer-motion |
| Design System | DAW-inspired dark theme (deep charcoal/slate, violet/cyan accents) |
| UI Primitives | Custom shadcn-style components built from lucide-react |
| API Validation | Pydantic v2 schemas on all endpoints |
| Async Processing | Job queue with polling (in-memory, Redis-ready) |
| Type Safety | TypeScript on frontend, Python type hints on backend |
| Error Handling | Error boundaries, try-catch, typed API errors, toast notifications |
| Loading States | Skeleton loaders, LoadingSpinner, progress bars |
| Auth | Email/password with JWT sessions, bcrypt password hashing, httponly cookies |
| Database | Prisma schema (in-memory stores for MVP) |
| Payments | Stripe checkout integration, webhook handler, test mode fallback |
| Audio Processing | scipy/numpy for DSP, pydub for format conversion, Web Audio API for real-time |
| Pitch Detection | FFT with parabolic interpolation, autocorrelation for live, harmonic subtraction for polyphonic |

## Features

### Authentication
Email/password registration and login with DAW-themed glass card UI. JWT session tokens stored in httponly cookies, validated by backend middleware. User menu dropdown shows name, email, and sign-out. `useAuth()` React context provides login, register, and auto-session refresh.

### Billing & Credits
Plan-based credit system with Free (10/mo), Pro (200/mo), and Studio (unlimited) tiers. Test mode: selecting a plan instantly grants credits without Stripe keys. With Stripe configured, users go through Stripe Checkout and credits are granted via webhook.

### Publish & Fork
Publish tracks publicly. Fork tracks or community posts to clone into your personal library. Library rows show publish/unpublish actions. Community cards and track cards include fork buttons.

### Studio Dashboard
Advanced Prompt Builder with genre, mood, key, BPM, and structure toggles. AI-powered Smart Prompt Enhancer. Async generation with live status polling. Recent tracks sidebar.

### Community Feed
SoundCloud-style explore view with Trending, New, Top, and For You tabs. Each post shows title, artist, genre, the prompt used, and like/fork/share actions.

### Library
Personal track management with All, Completed, Drafts, and Published tab filters. Table-row layout with play buttons, genre/mood tags, export format badges, and inline actions.

### Generate
Text-to-music via Meta MusicGen. Prompt is queued asynchronously, frontend polls for completion with live status text.

### Separate
Upload any audio file and split into isolated stems (vocals, drums, bass, guitar, piano, other via htdemucs_6s). Async job queue with live polling. Automatic cloud fallback via HuggingFace Inference API when local demucs unavailable.

### Tools
Four utilities on a single page:

- **YouTube Extractor** — paste a YouTube URL, downloads audio via yt-dlp. Play, download, and link to stem separation in one click.

- **Audio Compressor** — reduce WAV file size by lowering sample rate (44.1k/22k/16k/11k/8k), bit depth (16/8), and optional mono conversion. **MP3 output** — export compressed audio as MP3 at 128kbps via pydub/ffmpeg. Supports WAV/MP3/M4A/FLAC/OGG input.

- **Instrument Note Detection** — two modes:
  - **Mono (FFT)** — detects single-note melodies from separated instrument stems with adaptive threshold, 2-frame stability hysteresis, parabolic interpolation, and minimum note duration filtering. Outputs MIDI note names, numbers, timing, and velocity.
  - **Polyphonic** — detects chords (up to 6 simultaneous notes) using iterative harmonic subtraction on the FFT spectrum. Great for guitar chords, piano voicings.

- **Vocal Coach** — upload any song (vocals auto-separated via demucs in the background), record yourself singing, and get scored on pitch accuracy.
  - **Auto-separation** — upload a full song, backend separates vocals, extracts the pitch contour, and shows it on a graph.
  - **Live pitch** — during recording, your pitch is detected in real-time via Web Audio API autocorrelation and overlaid on the reference graph.
  - **Scoring** — compares your pitch contour to the reference frame-by-frame. Grading scale: S (95+), A (85+), B (70+), C (55+), D (40+), F.

### Multitrack Editor
Browser-based DAW at `/editor` with:

- **4 starter tracks** — Vocals, Guitar, Drums, Bass (rename, add, or delete tracks)
- **Per-track controls** — arm for recording (mic), mute (M), solo (S), volume slider
- **Waveform display** — recorded audio renders as a waveform using Web Audio API
- **Transport bar** — play, pause, stop, record, BPM display
- **Recording** — arm a track, press record, sing/play into your mic → audio lands on that track
- **Export Mix** — mixes all unmuted tracks to a downloadable WAV file
- **Layered playback** — all tracks play simultaneously in sync

### Waveform Editor
Real waveform canvas rendering via AudioContext, drag-to-select regions, click-to-seek, playhead cursor animation. Supports trim, fade in/out, normalize, speed change, merge stems, and effects chain (reverb, delay, EQ, compressor). Edit chaining: each result becomes the working file.

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
cp ../.env.example .env
python3 -m app.main

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Backend runs on `http://localhost:8000`, frontend on `http://localhost:3000`. API requests proxy through Next.js rewrites.

**Important for Windows:** create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000` to bypass Turbopack proxy issues with multipart file uploads.

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU VRAM | 8GB (MusicGen small) | 16GB (large model) |
| RAM | 16GB | 32GB |
| Storage | 15GB free | 30GB |
| Python | 3.10+ | 3.11+ |
| Node.js | 18+ | 22+ |
| PostgreSQL | 14+ | 16+ |
| Redis | 6+ | 7+ |

CPU-only mode works for Demucs and audio editing. MusicGen on CPU is very slow. Cloud fallback (HuggingFace) available for both generation and separation.

## Environment Variables

See `.env.example` for the complete list covering:
- Server configuration
- Database (PostgreSQL)
- Redis (async queue)
- Authentication (JWT secret, Google/GitHub OAuth)
- AI Models (MusicGen size, HuggingFace token)
- LLM Prompt Enhancement (API key, base URL, model)
- Cloud Storage (S3/R2)
- Serverless GPU (Modal)
- Payments (Stripe secret, webhook secret, price IDs)
- Rate limiting & credits

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Auth | Email/password registration and login |
| `/studio` | Dashboard | Prompt builder + recent tracks |
| `/community` | Explore | Public feed of published tracks |
| `/library` | My Library | Personal track collection |
| `/generate` | Separation | Upload audio, split into stems |
| `/tools/karaoke` | Karaoke Studio | Guided 4-step Karaoke Video Studio (AI vocal separation, Whisper auto-detection, tap-syncing, waveform editor, 1080p video export) |
| `/editor` | Multitrack | Multi-track recorder and mixer |
| `/settings` | Settings | AI provider configuration |
