import asyncio
import json
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

async def test_http_endpoints():
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # 1. Health Check
        try:
            print("🔍 Testing GET /health...")
            resp = await client.get("/health")
            resp.raise_for_status()
            print(f"✅ Health OK: {resp.json()}")
        except Exception as e:
            print(f"❌ Health Check Failed: {e}")
            return False

        # 2. Rides Estimate
        try:
            print("\n🚗 Testing POST /api/v1/rides/estimate...")
            payload = {
                "start_lat": 18.7883,
                "start_lng": 98.9853,
                "end_lat": 18.8000,
                "end_lng": 99.0000
            }
            resp = await client.post("/api/v1/rides/estimate", json=payload)
            resp.raise_for_status()
            print(f"✅ Rides Estimate OK: {len(resp.json()['providers'])} providers found")
        except Exception as e:
            print(f"❌ Ride Estimate Failed: {e}")
            return False

        # 3. Payment Intent
        try:
            print("\n💳 Testing POST /api/v1/payments/create-intent...")
            payload = {
                "amount": 100,
                "currency": "thb",
                "deviceId": "test-device-id"
            }
            # Note: This might fail if Stripe key is invalid/missing, which is expected in mock mode
            # But the endpoint should be reachable.
            resp = await client.post("/api/v1/payments/create-intent", json=payload)
            if resp.status_code == 200:
                print(f"✅ Payment Intent OK: {resp.json().get('clientSecret')}")
            else:
                print(f"⚠️ Payment Endpoint Reachable but Error (Expected if no Stripe Key): {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"❌ Payment Request Failed: {e}")
            return False

        # 4. Shops List
        try:
            print("\n🏪 Testing GET /api/v1/shops...")
            resp = await client.get("/api/v1/shops/")
            resp.raise_for_status()
            shops = resp.json()
            print(f"✅ Shops API OK: Found {len(shops)} shops")
            if len(shops) > 0:
                print(f"   Sample: {shops[0]['name']}")
        except Exception as e:
            print(f"❌ Shops API Failed: {e}")
            return False

        # 5. Rate Limit Test (Optional - might block subsequent runs)
        # print("\n🛡️ Testing Rate Limit (Spamming /rides)...")
        # for i in range(12):
        #     await client.post("/api/v1/rides/estimate", json=payload)
        # print("   (Skipping to avoid blocking dev flow)")

    return True

async def test_websocket():
    print("\n🔌 Testing WebSocket /ws/vibe-stream...")
    try:
        async with websockets.connect(WS_URL) as websocket:
            # Send a test message (JSON)
            test_payload = {"content": "🔥 Checking Vibe!", "shopId": 1, "lat": 18.7, "lng": 98.9}
            await websocket.send(json.dumps(test_payload))
            print(f"📤 Sent: {test_payload}")

            # Receive echo (JSON formatted)
            response = await asyncio.wait_for(websocket.recv(), timeout=3.0)
            print(f"📥 Received: {response}")

            try:
                data = json.loads(response)
                if data.get("type") == "vibe" and "🔥" in data.get("content"):
                    print("✅ WebSocket JSON Echo Works!")
                    return True
                else:
                    print(f"⚠️ Unexpected Content: {data}")
                    return False
            except json.JSONDecodeError:
                print("❌ Received non-JSON response")
                return False

    except Exception as e:
        print(f"❌ WebSocket Test Failed: {e}")
        return False

async def main():
    print("🚀 Starting Backend Logic Verification (Loki Mode)...\n")

    http_ok = await test_http_endpoints()
    ws_ok = await test_websocket()

    if http_ok and ws_ok:
        print("\n✅✅ ALL BACKEND TESTS PASSED. Ready for Frontend Integration.")
        sys.exit(0)
    else:
        print("\n❌ BACKEND TESTS FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
