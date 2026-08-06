# Music AI Studio

A production-grade web application combining AI music generation, stem separation, and audio editing in a single interface. Powered by Meta MusicGen, Demucs, and Pedalboard.

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
│   │   │   ├── page.tsx         # Home (music generation)
│   │   │   ├── generate/page.tsx # Stem separation
│   │   │   └── editor/page.tsx  # Audio editor
│   │   ├── components/
│   │   │   ├── Navbar.tsx       # Navigation bar
│   │   │   ├── ErrorBoundary.tsx # Error catch boundary
│   │   │   ├── LoadingSpinner.tsx # Loading states
│   │   │   ├── AudioPlayer.tsx  # Audio playback component
│   │   │   └── WaveformEditor.tsx # Audacity-style editor
│   │   └── lib/
│   │       ├── api.ts           # Typed API client
│   │       ├── types.ts         # TypeScript interfaces
│   │       └── utils.ts         # Utility functions
│   └── next.config.ts           # API proxy rewrites + allowedHosts
├── .env.example                 # Comprehensive env template
├── VERIFICATION.md              # Step-by-step verification checklist
├── CHANGELOG.md
└── README.md
```

## Key Design Decisions

| Concern | Implementation |
|---------|---------------|
| API Validation | Pydantic v2 schemas on all endpoints |
| Async Processing | Job queue with polling (in-memory, Redis-ready) |
| Type Safety | TypeScript on frontend, Python type hints on backend |
| Error Handling | Error boundaries, try-catch, typed API errors |
| Loading States | LoadingSpinner component, skeleton placeholders |
| Auth (ready) | Middleware with session/cookie support, BetterAuth Prisma schema |
| Database | Prisma schema for users, projects, generations |
| Payments | Stripe integration hooks in config |
| Cloud Storage | S3/R2 config in settings |

## Features

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
