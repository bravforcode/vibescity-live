from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import stripe
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()

stripe.api_key = settings.STRIPE_SECRET_KEY

class PaymentIntentRequest(BaseModel):
    amount: int
    currency: str = "thb"
    deviceId: str

@router.post("/create-intent")
async def create_payment_intent(request: PaymentIntentRequest):
    try:
        # Create a PaymentIntent with the order amount and currency
        # In a real app, calculate amount on server to prevent manipulation
        # For 'Coin Packages', we should map package_id to amount here.

        intent = stripe.PaymentIntent.create(
            amount=request.amount * 100, # satang
            currency=request.currency,
            metadata={"device_id": request.deviceId},
            automatic_payment_methods={
                'enabled': True,
            },
        )
        return {
            "clientSecret": intent.client_secret
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
