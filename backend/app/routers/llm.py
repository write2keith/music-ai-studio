from fastapi import APIRouter, HTTPException
from ..models.schemas import PromptEnhanceRequest, PromptEnhanceResponse, ErrorResponse
from ..services.llm import enhance_prompt

router = APIRouter(prefix="/api", tags=["llm"])


@router.post(
    "/enhance-prompt",
    response_model=PromptEnhanceResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def enhance_prompt_endpoint(body: PromptEnhanceRequest):
    try:
        enhanced = await enhance_prompt(
            prompt=body.prompt,
            genre=body.genre,
            mood=body.mood,
            key=body.key,
            bpm=body.bpm,
            structure=body.structure,
        )
        return PromptEnhanceResponse(enhanced_prompt=enhanced)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
