from fastapi import APIRouter, HTTPException, Query, Request
from ..models.schemas import TrackResponse, CommunityPostResponse, ErrorResponse
from ..store.tracks import track_store

router = APIRouter(prefix="/api", tags=["tracks"])


def _get_user_id(request: Request) -> str | None:
    return getattr(request.state, "user_id", None)


@router.get(
    "/tracks",
    response_model=list[TrackResponse],
    responses={500: {"model": ErrorResponse}},
)
async def list_tracks(request: Request):
    try:
        return track_store.list_user_tracks(user_id=_get_user_id(request))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/tracks/{track_id}",
    response_model=TrackResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_track(track_id: str):
    track = track_store.get(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return track.to_dict()


@router.get(
    "/community",
    response_model=list[CommunityPostResponse],
    responses={500: {"model": ErrorResponse}},
)
async def list_community():
    try:
        return track_store.list_community()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/library",
    response_model=list[TrackResponse],
    responses={500: {"model": ErrorResponse}},
)
async def list_library(
    request: Request,
    status: str = Query(default=None, description="Filter by status: completed, processing, draft, published"),
):
    try:
        tracks = track_store.list_user_tracks(user_id=_get_user_id(request))
        if status == "published":
            tracks = [t for t in tracks if t["is_published"]]
        elif status:
            tracks = [t for t in tracks if t["status"] == status]
        return tracks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tracks/{track_id}/publish")
async def publish_track(track_id: str, request: Request):
    user_id = _get_user_id(request)
    track = track_store.get(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if track.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your track")
    track_store.update(track_id, is_published=True)
    return {"status": "published", "track": track.to_dict()}


@router.post("/tracks/{track_id}/unpublish")
async def unpublish_track(track_id: str, request: Request):
    user_id = _get_user_id(request)
    track = track_store.get(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if track.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your track")
    track_store.update(track_id, is_published=False)
    return {"status": "unpublished", "track": track.to_dict()}


@router.post("/tracks/{track_id}/fork")
async def fork_track(track_id: str, request: Request):
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    forked = track_store.fork(track_id, user_id)
    if not forked:
        raise HTTPException(status_code=404, detail="Track not found")
    return {"status": "forked", "track": forked.to_dict()}
