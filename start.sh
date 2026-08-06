#!/bin/bash

echo "Starting Music AI Studio..."
echo ""

cd "$(dirname "$0")"

export PORT="${PORT:-8000}"
export MUSICGEN_MODEL_SIZE="${MUSICGEN_MODEL_SIZE:-small}"
export MUSICGEN_DURATION="${MUSICGEN_DURATION:-10}"

echo "Backend port: $PORT"
echo "MusicGen model: facebook/musicgen-$MUSICGEN_MODEL_SIZE"
echo ""

python3 backend/app.py
