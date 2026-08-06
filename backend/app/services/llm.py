import json
import logging
import httpx
from ..config import get_settings

logger = logging.getLogger(__name__)

PROMPT_ENHANCE_SYSTEM = """You are a professional music producer and audio engineer. Your job is to enhance music generation prompts for an AI music generator.

Given a user's description and optional metadata (genre, mood, key, BPM, structure), create a rich, detailed prompt that will produce high-quality music. Add production terminology, instrumentation details, and sonic characteristics.

Rules:
1. Output ONLY the enhanced prompt text - no explanations, no markdown, no quotes
2. Be specific about instruments, production techniques, and sonic qualities
3. Keep it under 200 characters
4. Incorporate the metadata naturally
5. If the input is already detailed, refine rather than replace

Example:
Input: "a chill lo-fi beat" + genre: Lo-Fi, mood: Chill, bpm: 85
Output: Lo-fi chill beat at 85 BPM with warm Rhodes piano, soft vinyl crackle, subdued boom-bap drums, and gentle tape saturation for a cozy study atmosphere"""


async def enhance_prompt(
    prompt: str,
    genre: str | None = None,
    mood: str | None = None,
    key: str | None = None,
    bpm: int | None = None,
    structure: str | None = None,
) -> str:
    settings = get_settings()

    if not settings.USER_LLM_API_KEY:
        return _fallback_enhance(prompt, genre, mood, key, bpm, structure)

    metadata_parts = []
    if genre:
        metadata_parts.append(f"genre: {genre}")
    if mood:
        metadata_parts.append(f"mood: {mood}")
    if key:
        metadata_parts.append(f"key: {key}")
    if bpm:
        metadata_parts.append(f"bpm: {bpm}")
    if structure:
        metadata_parts.append(f"structure: {structure}")

    metadata = ", ".join(metadata_parts) if metadata_parts else "no specific metadata"
    user_message = f"Enhance this music prompt:\n{prompt}\n\nMetadata: {metadata}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{settings.USER_LLM_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.USER_LLM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.USER_LLM_MODEL,
                    "messages": [
                        {"role": "system", "content": PROMPT_ENHANCE_SYSTEM},
                        {"role": "user", "content": user_message},
                    ],
                    "max_tokens": 200,
                    "temperature": 0.7,
                },
            )
            response.raise_for_status()
            data = response.json()
            enhanced = data["choices"][0]["message"]["content"].strip()
            logger.info(f"LLM enhanced prompt: {enhanced[:100]}...")
            return enhanced

    except Exception as e:
        logger.warning(f"LLM enhancement failed, using fallback: {e}")
        return _fallback_enhance(prompt, genre, mood, key, bpm, structure)


def _fallback_enhance(
    prompt: str,
    genre: str | None = None,
    mood: str | None = None,
    key: str | None = None,
    bpm: int | None = None,
    structure: str | None = None,
) -> str:
    tags = [genre, mood, key, f"{bpm} BPM" if bpm else None, structure]
    tags = [t for t in tags if t]
    suffix = " — " + ", ".join(tags) if tags else ""
    return f"{prompt}{suffix} — professional production, high quality mix, mastered"
