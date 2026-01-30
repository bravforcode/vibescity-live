from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
from pydantic import ValidationError
from app.core.models import VibePayload
import json

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # global_connections receives ALL broadcast messages (e.g. Map View)
        self.global_connections: List[WebSocket] = []
        # room_connections: shop_id -> [websockets] (e.g. Shop Detail View)
        self.room_connections: dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.global_connections.append(websocket)

    async def process_message(self, websocket: WebSocket, data: str):
        """
        Process incoming websocket messages.
        Returns True if message should be broadcasted globally, False otherwise.
        """
        try:
            # Enforce Pydantic validation
            raw = json.loads(data)
            payload = VibePayload(**raw)
        except (json.JSONDecodeError, ValidationError):
            # Invalid JSON or Schema mismatch
            await websocket.send_text(json.dumps({"type": "error", "content": "Invalid payload format."}))
            return None

        # ✅ Handle Actions (Subscribe/Unsubscribe)
        if payload.action == "subscribe":
            if payload.shopId:
                await self.subscribe_to_room(websocket, str(payload.shopId))
            return None # Don't broadcast

        # ✅ Construct broadcast message
        # Convert model to dict for serialization
        response = payload.model_dump()
        response["type"] = "vibe" # Protocol compatibility
        return response



    # Helper to clean up and return affected rooms for broadcasting
    def remove_connection(self, websocket: WebSocket) -> List[str]:
        affected_shops = []
        if websocket in self.global_connections:
            self.global_connections.remove(websocket)

        # Identify empty rooms first to avoid modifying dict during iteration
        empty_shops = []
        for shop_id, connections in self.room_connections.items():
            if websocket in connections:
                connections.remove(websocket)
                affected_shops.append(shop_id)
                if not connections:
                    empty_shops.append(shop_id)

        # Cleanup empty rooms
        for shop_id in empty_shops:
            del self.room_connections[shop_id]

        return affected_shops

    async def handle_disconnect(self, websocket: WebSocket):
        """Handles cleaner disconnect: removes connection and broadcasts updates."""
        try:
            affected_shops = self.remove_connection(websocket)

            # Broadcast new counts to affected rooms
            for shop_id in affected_shops:
                connections = self.room_connections.get(shop_id, [])
                if connections:
                    count = len(connections)
                    msg = json.dumps({
                        "type": "presence",
                        "shopId": int(shop_id) if shop_id.isdigit() else shop_id,
                        "count": count
                    })
                    for conn in connections:
                        try:
                            await conn.send_text(msg)
                        except Exception:
                            pass

            # 📢 Update Global Heatmap
            await self.broadcast_heatmap()
        except Exception as e:
            print(f"Error handling disconnect: {e}")

    async def broadcast_heatmap(self):
        """Broadcasts the current density of all shops to the global map."""
        if not self.global_connections:
            return

        data_payload = {}
        for shop_id, conns in self.room_connections.items():
            if conns:
                data_payload[shop_id] = len(conns)

        if not data_payload:
            return

        message = json.dumps({
            "type": "heatmap",
            "data": data_payload
        })

        # 2. Broadcast to Global
        for connection in self.global_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Ignore failures for broadcastFire and forget
                pass

    async def subscribe_to_room(self, websocket: WebSocket, shop_id: str):
        if shop_id not in self.room_connections:
            self.room_connections[shop_id] = []
        if websocket not in self.room_connections[shop_id]:
            self.room_connections[shop_id].append(websocket)

            # 📢 Broadcast Presence (Room)
            count = len(self.room_connections[shop_id])
            msg = json.dumps({
                "type": "presence",
                "shopId": int(shop_id) if shop_id.isdigit() else shop_id,
                "count": count
            })
            for conn in self.room_connections[shop_id]:
                try:
                    await conn.send_text(msg)
                except Exception:
                    pass

            # 📢 Broadcast Global Heatmap Update
            await self.broadcast_heatmap()

    async def broadcast(self, message: str):
        for connection in self.global_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass # Handle dead connections lazily

manager = ConnectionManager()

import time
import asyncio

@router.websocket("/vibe-stream")
async def vibe_stream(websocket: WebSocket):
    await manager.connect(websocket)
    last_msg_time = 0

    try:
        while True:
            # ✅ Periodic Heatmap Broadcast
            # We check time inside loop. But wait, websocket.receive_text() blocks!
            # If no messages come, we never broadcast heatmap.
            # To handle this properly, we need a separate background task or use asyncio.wait_for.
            # OR: Since we have valid traffic, maybe it's fine.
            # BUT: If the map is idle, heatmap won't update.
            # BETTER MVP: Broadcast heatmap on *change* (inside subscribe/disconnect/broadcast),
            # and maybe just once per X seconds if we want to reduce traffic.
            # Let's rely on event-driven updates for now (subscribe/disconnect already notify room).
            # But the GLOBAL map doesn't know about room counts unless we tell it.

            # Since receive_text blocks, we can only do this when we receive something.
            # This is flawed for a "Live Map" if user is just watching.
            # Correct approach for Global Updates: A background task in FastAPI startup event
            # that loops forever and broadcasts to global_connections.

            # Quick MVP Fix: Use asyncio.wait_for with timeout to allow periodic tasks.
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            except asyncio.TimeoutError:
                # Timeout reached, loop continues. We can do periodic tasks here.
                # But we only want ONE server task doing this, not every connection.
                # If we do it here, every connected client tries to run logic? No, this is the handler for ONE client.
                # We need a singleton broadcaster.
                # For now, let's just ignore the "idle update" issue for MVP.
                # Heatmap updates will be triggered by ACTIVITY (someone joining/leaving).
                # Wait, I did that for "Presence" (Room update).
                # I need "Global Heatmap" (ALL rooms).
                # Let's adding a `broadcast_heatmap` method to manager and call it on subscribe/disconnect.
                continue

            # ... (Rest of logic)

            # ✅ Simple Rate Limit (Spam Protection)
            # Max 1 message per 500ms
            now = time.time()
            if now - last_msg_time < 0.5:
                # Ignore spam, maybe send warning?
                await websocket.send_text(json.dumps({"type": "error", "content": "Too fast! Chill."}))
                continue

            last_msg_time = now

            result = await manager.process_message(websocket, data)
            if result:
                # Broadcast payload to everyone (Global Map Effect)
                await manager.broadcast(json.dumps(result))
    except WebSocketDisconnect:
        await manager.handle_disconnect(websocket)
