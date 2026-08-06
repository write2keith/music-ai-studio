import logging
import json

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from ..config import get_settings
from ..store.users import user_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])
settings = get_settings()

PLANS = [
    {
        "id": "free",
        "name": "Free",
        "price": "$0",
        "credits": 10,
        "credits_label": "10/mo",
        "price_id": None,
        "featured": False,
    },
    {
        "id": "pro",
        "name": "Pro",
        "price": "$12",
        "credits": 200,
        "credits_label": "200/mo",
        "price_id": settings.STRIPE_PRICE_ID_BASIC,
        "featured": True,
    },
    {
        "id": "studio",
        "name": "Studio",
        "price": "$29",
        "credits": -1,
        "credits_label": "Unlimited",
        "price_id": settings.STRIPE_PRICE_ID_PRO,
        "featured": False,
    },
]


class CheckoutRequest(BaseModel):
    plan_id: str
    success_url: str = ""
    cancel_url: str = ""


def _get_user(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _stripe_available() -> bool:
    return bool(settings.STRIPE_SECRET_KEY)


@router.get("/plans")
async def get_plans():
    return {"plans": PLANS, "stripe_available": _stripe_available()}


@router.get("/credits")
async def get_credits(request: Request):
    user = _get_user(request)
    return {"credits": user.credits}


@router.post("/checkout")
async def create_checkout(body: CheckoutRequest, request: Request):
    user = _get_user(request)

    plan = next((p for p in PLANS if p["id"] == body.plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if plan["id"] == "free":
        return {"url": None, "message": "Free plan activated", "credits": user.credits}

    if not _stripe_available():
        user_store.add_credits(user.id, plan["credits"])
        return {
            "url": None,
            "message": f"Test mode: {plan['credits']} credits added to {plan['name']} plan",
            "credits": user.credits,
        }

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": plan["price_id"],
                "quantity": 1,
            }],
            mode="subscription" if plan["credits_label"] == "200/mo" else "payment",
            success_url=body.success_url or f"{request.base_url}studio?checkout=success",
            cancel_url=body.cancel_url or f"{request.base_url}studio?checkout=cancel",
            metadata={
                "user_id": user.id,
                "plan_id": plan["id"],
            },
        )
        return {"url": session.url, "session_id": session.id}
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not _stripe_available():
        return {"status": "stripe_not_configured"}

    import stripe

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        logger.error(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        plan_id = session.get("metadata", {}).get("plan_id")

        if user_id and plan_id:
            plan = next((p for p in PLANS if p["id"] == plan_id), None)
            if plan and plan["credits"] > 0:
                user_store.add_credits(user_id, plan["credits"])
                logger.info(f"Webhook: credited {plan['credits']} to user {user_id}")

    return {"status": "ok"}
