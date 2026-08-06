# Music AI Studio

A production-grade DAW-inspired web application combining AI music generation, stem separation, and audio editing. Powered by Meta MusicGen, Demucs, and Pedalboard.

## Architecture

```
music-ai-studio/
├── backend/                     # FastAPI Python backend
│   ├── app/
│   │   ├── main.py              # FastAPI entry point with lifespan
│   │   ├── config.py            # Centralized settings via pydantic-settings
│   │   ├── routers/
│   │   │   ├── generate.py      # /api/generate, /api/separate endpoints
│   │   │   └── edit.py          # /api/edit/* endpoints
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic request/response validation
│   │   ├── services/
│   │   │   ├── generator.py     # MusicGen (HuggingFace Transformers)
│   │   │   ├── separator.py     # Demucs stem separation
│   │   │   └── editor.py        # pydub + Pedalboard audio editing
│   │   ├── queue/
│   │   │   ├── worker.py        # In-memory job queue (Redis fallback ready)
│   │   │   └── tasks.py         # Registered async task handlers
│   │   └── middleware/
│   │       └── auth.py          # Authentication middleware
│   ├── prisma/
│   │   └── schema.prisma        # Database schema (User, Project, Generation, Separation)
│   └── requirements.txt
├── frontend/                    # Next.js TypeScript frontend
│   ├── src/
│   │   ├── app/                 # App router pages
│   │   │   ├── page.tsx         # Redirect to /studio
│   │   │   ├── layout.tsx       # Root layout with sidebar + topbar
│   │   │   ├── globals.css      # DAW dark theme design system
│   │   │   ├── studio/          # Studio dashboard (prompt builder + tracks)
│   │   │   ├── community/       # Community feed (discover, trending)
│   │   │   ├── library/         # Personal library (track management)
│   │   │   ├── generate/        # Stem separation
│   │   │   └── editor/          # Audio waveform editor
│   │   ├── components/
│   │   │   ├── ui/              # Design primitives (Button, Card, Badge, Toast, etc.)
│   │   │   ├── studio/          # Studio features (Sidebar, TopNav, PromptBuilder, TrackCard)
│   │   │   ├── community/       # CommunityFeed component
│   │   │   ├── library/         # LibraryView component
│   │   │   ├── Navbar.tsx       # (legacy) Navigation bar
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── AudioPlayer.tsx
│   │   │   └── WaveformEditor.tsx # Audacity-style editor
│   │   └── lib/
│   │       ├── api.ts           # Typed API client
│   │       ├── types.ts         # TypeScript interfaces
│   │       └── utils.ts         # cn(), formatTime(), formatSize()
│   └── next.config.ts           # API proxy rewrites + allowedHosts
├── .env.example                 # Comprehensive env template
├── VERIFICATION.md              # Step-by-step verification checklist
├── CHANGELOG.md
└── README.md
```

## Key Design Decisions

| Concern | Implementation |
|---------|---------------|
| UI Framework | Next.js 16 + TailwindCSS v4 + framer-motion |
| Design System | DAW-inspired dark theme (deep charcoal/slate, violet/cyan accents) |
| UI Primitives | Radix UI base + custom shadcn-style components |
| API Validation | Pydantic v2 schemas on all endpoints |
| Async Processing | Job queue with polling (in-memory, Redis-ready) |
| Type Safety | TypeScript on frontend, Python type hints on backend |
| Error Handling | Error boundaries, try-catch, typed API errors, toast notifications |
| Loading States | Skeleton loaders, LoadingSpinner, progress bars |
| Auth (ready) | Middleware with session/cookie support, BetterAuth Prisma schema |
| Database | Prisma schema for users, projects, generations |
| Payments | Stripe integration hooks in config |
| Cloud Storage | S3/R2 config in settings |

## Features

### Studio Dashboard
Two-column layout with the Advanced Prompt Builder on the left and recent tracks on the right. The Prompt Builder includes toggles for Genre, Mood, Key, BPM, and Structure with an AI-powered Smart Prompt Enhancer. Track cards show cover art, play overlay, stem badges, and quick actions (download MP3/WAV, stems, fork).

### Community Feed
SoundCloud-style explore view with Trending, New, Top, and For You tabs. Each post shows the track title, artist, genre, the original prompt used to generate it, and like/fork/share actions with counts.

### Library
Personal track management with All, Completed, Drafts, and Published tab filters. Tracks are displayed in a table-row layout with play buttons, genre/mood tags, export format badges (MP3/WAV/Stems), published status, and inline actions (edit, download, stems, more).

### Generate
Text-to-music via Meta MusicGen. Submit a prompt, the job is queued asynchronously, and the result appears when complete. Built-in polling with status display.

### Separate
Upload any audio file and split into isolated stems (vocals, drums, bass, other). Supports htdemucs, htdemucs_ft, and htdemucs_6s models.

### Edit
Audio editor with waveform display, play/pause/stop transport, region selection, trim/crop, fade in/out, normalize, speed change, merge stems, and effects chain (reverb, delay, 3-band EQ, compressor).

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
cp .env.example .env.local
npm run dev
```

Backend runs on `http://localhost:8000`, frontend on `http://localhost:3000`. API requests from the frontend are proxied via Next.js rewrites.

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

CPU-only mode works for Demucs and audio editing. MusicGen on CPU is very slow.

## Environment Variables

See `.env.example` for the complete list covering:
- Server configuration
- Database (PostgreSQL)
- Redis (async queue)
- Authentication (BetterAuth, Google, GitHub OAuth)
- AI Models (MusicGen size, HuggingFace token)
- Cloud Storage (S3/R2)
- Serverless GPU (Modal)
- Payments (Stripe)
- Rate limiting & credits
