import asyncio
import json
import logging
import sys

import httpx
import websockets

# Prevent pytest from collecting this file (manual smoke test script).
__test__ = False

# ✅ Windows Console Fix for Emojis
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass # Older Python versions might not need/have this

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/api/v1/vibes/vibe-stream"
logger = logging.getLogger("backend.manual_test")


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")

async def test_http_endpoints():
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # 1. Health Check
        try:
            logger.info("🔍 Testing GET /health...")
            resp = await client.get("/health")
            resp.raise_for_status()
            logger.info("✅ Health OK: %s", resp.json())
        except httpx.HTTPError as exc:
            logger.error("❌ Health Check Failed: %s", exc)
            return False

        # 2. Rides Estimate
        try:
            logger.info("🚗 Testing POST /api/v1/rides/estimate...")
            payload = {
                "start_lat": 18.7883,
                "start_lng": 98.9853,
                "end_lat": 18.8000,
                "end_lng": 99.0000
            }
            resp = await client.post("/api/v1/rides/estimate", json=payload)
            resp.raise_for_status()
            provider_count = len(resp.json()["providers"])
            logger.info("✅ Rides Estimate OK: %s providers found", provider_count)
        except (httpx.HTTPError, KeyError, TypeError) as exc:
            logger.error("❌ Ride Estimate Failed: %s", exc)
            return False

        # 3. Payment Intent
        try:
            logger.info("💳 Testing POST /api/v1/payments/create-intent...")
            payload = {
                "amount": 100,
                "currency": "thb",
                "deviceId": "test-device-id"
            }
            # Note: This might fail if Stripe key is invalid/missing, which is expected in mock mode
            # But the endpoint should be reachable.
            resp = await client.post("/api/v1/payments/create-intent", json=payload)
            if resp.status_code == 200:
                logger.info("✅ Payment Intent OK: %s", resp.json().get("clientSecret"))
            else:
                logger.warning(
                    "⚠️ Payment endpoint reachable but returned %s: %s",
                    resp.status_code,
                    resp.text,
                )
        except httpx.HTTPError as exc:
            logger.error("❌ Payment Request Failed: %s", exc)
            return False

        # 4. Shops List
        try:
            logger.info("🏪 Testing GET /api/v1/shops...")
            resp = await client.get("/api/v1/shops/")
            resp.raise_for_status()
            shops = resp.json()
            logger.info("✅ Shops API OK: Found %s shops", len(shops))
            if len(shops) > 0:
                logger.info("   Sample: %s", shops[0]["name"])
        except (httpx.HTTPError, KeyError, TypeError) as exc:
            logger.error("❌ Shops API Failed: %s", exc)
            return False

        # 5. Rate Limit Test (Optional - might block subsequent runs)
        # logger.info("🛡️ Testing Rate Limit (Spamming /rides)...")
        # for i in range(12):
        #     await client.post("/api/v1/rides/estimate", json=payload)
        # logger.info("   (Skipping to avoid blocking dev flow)")

    return True

async def test_websocket():
    logger.info("🔌 Testing WebSocket /ws/vibe-stream...")
    try:
        async with websockets.connect(WS_URL) as websocket:
            # Send a test message (JSON)
            test_payload = {"content": "🔥 Checking Vibe!", "shopId": 1, "lat": 18.7, "lng": 98.9}
            await websocket.send(json.dumps(test_payload))
            logger.info("📤 Sent: %s", test_payload)

            # Receive echo (JSON formatted)
            response = await asyncio.wait_for(websocket.recv(), timeout=3.0)
            logger.info("📥 Received: %s", response)

            try:
                data = json.loads(response)
                if data.get("type") == "vibe" and "🔥" in data.get("content"):
                    logger.info("✅ WebSocket JSON Echo Works!")
                    return True
                logger.warning("⚠️ Unexpected Content: %s", data)
                return False
            except json.JSONDecodeError:
                logger.error("❌ Received non-JSON response")
                return False

    except (TimeoutError, OSError) as exc:
        logger.error("❌ WebSocket Test Failed: %s", exc)
        return False

async def main():
    _configure_logging()
    logger.info("🚀 Starting Backend Logic Verification (Loki Mode)...")

    http_ok = await test_http_endpoints()
    ws_ok = await test_websocket()

    if http_ok and ws_ok:
        logger.info("✅✅ ALL BACKEND TESTS PASSED. Ready for Frontend Integration.")
        return 0

    logger.error("❌ BACKEND TESTS FAILED.")
    return 1

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
