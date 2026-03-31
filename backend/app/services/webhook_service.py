"""
Webhook Service - Manages real-time notifications for merchants.
Handles subscription, queuing, delivery, and retries.
"""
import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
from pydantic import BaseModel, HttpUrl

from app.core.config import get_settings
from app.services.cache import redis_client

logger = logging.getLogger("app.webhooks")

class WebhookCondition(BaseModel):
    event_type: Literal["traffic_jam", "accident", "road_closure", "special_event"]
    severity_threshold: Literal["minor", "moderate", "major", "critical"] = "moderate"
    radius_m: int = 2000

class WebhookSubscription(BaseModel):
    id: str
    merchant_id: str
    target_url: HttpUrl
    conditions: list[WebhookCondition]
    active: bool = True
    secret: str | None = None

class WebhookMessage(BaseModel):
    id: str = str(uuid.uuid4())
    event_type: str
    payload: dict[str, Any]
    timestamp: str = datetime.now(UTC).isoformat()
    retry_count: int = 0

class WebhookService:
    """
    Service for handling real-time merchant webhooks.
    """
    
    QUEUE_KEY = "webhooks:outbound:queue"
    MAX_RETRIES = 5
    RETRY_DELAY = 60 # seconds

    def __init__(self):
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._redis = redis_client.get_redis()

    async def subscribe(self, merchant_id: str, url: str, conditions: list[dict[str, Any]]) -> WebhookSubscription:
        """
        Registers a new webhook subscription for a merchant.
        """
        # In a real app, this would write to Supabase 'webhook_subscriptions' table.
        sub_id = str(uuid.uuid4())
        secret = str(uuid.uuid4())
        
        subscription = WebhookSubscription(
            id=sub_id,
            merchant_id=merchant_id,
            target_url=url,
            conditions=[WebhookCondition(**c) for c in conditions],
            secret=secret
        )
        
        # Mock DB write
        logger.info(f"Merchant {merchant_id} subscribed to webhook {url}")
        return subscription

    async def dispatch_event(self, event_type: str, payload: dict[str, Any], merchant_id: str | None = None):
        """
        Analyzes traffic events and dispatches webhooks to eligible merchants.
        """
        # 1. Fetch eligible subscriptions (filtered by merchant_id and conditions)
        subscriptions = await self._get_eligible_subscriptions(event_type, payload, merchant_id)
        
        # 2. Queue messages for each subscription
        for sub in subscriptions:
            message = WebhookMessage(
                event_type=event_type,
                payload={
                    **payload,
                    "merchant_id": sub.merchant_id
                }
            )
            await self._enqueue_delivery(sub, message)

    async def _get_eligible_subscriptions(self, event_type: str, payload: dict[str, Any], merchant_id: str | None) -> list[WebhookSubscription]:
        """
        Filters subscriptions based on location, severity, and event type.
        """
        # Placeholder for DB query to find matching merchants
        # Logic: find merchants whose venue location is within 'radius_m' of the incident 'lat/lng'
        # and match the event_type and severity_threshold.
        return []

    async def _enqueue_delivery(self, sub: WebhookSubscription, message: WebhookMessage):
        """
        Pushes a webhook message to the Redis queue for asynchronous delivery.
        """
        delivery_task = {
            "subscription": sub.model_dump(),
            "message": message.model_dump(),
            "timestamp": datetime.now(UTC).timestamp()
        }
        await asyncio.to_thread(
            lambda: self._redis.rpush(self.QUEUE_KEY, json.dumps(delivery_task))
        )
        logger.debug(f"Queued webhook delivery for {sub.target_url}")

    async def process_delivery_queue(self):
        """
        Worker task that pulls from the queue and attempts HTTP delivery.
        """
        logger.info("Starting webhook delivery worker...")
        while True:
            try:
                task_raw = await asyncio.to_thread(lambda: self._redis.blpop(self.QUEUE_KEY, timeout=5))
                if not task_raw:
                    continue
                
                _, task_data = task_raw
                task = json.loads(task_data)
                
                await self._deliver_with_retry(task)
                
            except Exception as e:
                logger.error(f"Error in webhook worker: {e}")
                await asyncio.sleep(1)

    async def _deliver_with_retry(self, task: dict):
        """
        Attempts to deliver a webhook with HTTP POST. 
        Implements exponential backoff/retry logic.
        """
        sub = task["subscription"]
        msg = task["message"]
        url = sub["target_url"]
        
        try:
            headers = {
                "Content-Type": "application/json",
                "X-VibeCity-Event": msg["event_type"],
                "X-VibeCity-Signature": self._generate_signature(sub["secret"], json.dumps(msg["payload"]))
            }
            
            response = await self._http_client.post(url, json=msg["payload"], headers=headers)
            response.raise_for_status()
            
            logger.info(f"Webhook delivered successfully to {url} [ID: {msg['id']}]")
            
        except (httpx.HTTPError, Exception) as e:
            msg["retry_count"] += 1
            if msg["retry_count"] <= self.MAX_RETRIES:
                logger.warning(f"Webhook delivery failed for {url} (Retry {msg['retry_count']}): {e}")
                # Re-queue with delay (in a real app, use a delayed task system or separate queue)
                await asyncio.sleep(self.RETRY_DELAY * msg["retry_count"])
                await asyncio.to_thread(lambda: self._redis.rpush(self.QUEUE_KEY, json.dumps(task)))
            else:
                logger.error(f"Webhook failed after {self.MAX_RETRIES} retries for {url}. Falling back.")
                await self._handle_fallback(sub, msg)

    def _generate_signature(self, secret: str, body: str) -> str:
        """HMAC-SHA256 signature for security verification by the merchant."""
        import hmac
        import hashlib
        if not secret: return ""
        return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()

    async def _handle_fallback(self, sub: dict, msg: dict):
        """
        If webhook fails repeatedly, store as a persistent notification for the merchant dashboard.
        """
        # In a real app, write to 'notifications' table in Supabase.
        logger.info(f"Fallback: Stored persistent notification for merchant {sub['merchant_id']}")

webhook_service = WebhookService()
