from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.config import settings
from app.core.models import VibePayload
from app.core.supabase import supabase, supabase_admin

router = APIRouter()
logger = logging.getLogger("app.vibes")


def _supabase_client():
	"""Prefer service role client when available."""
	return supabase_admin or supabase


def _rpc(name: str, params: dict[str, Any] | None = None) -> Any:
	client = _supabase_client()
	if client is None:
		return None
	resp = client.rpc(name, params or {}).execute()
	return getattr(resp, "data", None)


def _hotspot_snapshot(limit: int = 20) -> list[dict[str, Any]]:
	client = _supabase_client()
	if client is None:
		return []
	resp = (
		client.table("hotspot_5m")
		.select("bucket_start,venue_ref,event_count,unique_visitors,score")
		.order("score", desc=True)
		.limit(limit)
		.execute()
	)
	return list(getattr(resp, "data", []) or [])


class ConnectionManager:
	def __init__(self):
		# Receives global stream payloads (Map / Home)
		self.global_connections: List[WebSocket] = []
		# Room presence channels (shop detail)
		self.room_connections: dict[str, List[WebSocket]] = {}

	async def connect(self, websocket: WebSocket):
		await websocket.accept()
		self.global_connections.append(websocket)

	async def _safe_send(self, websocket: WebSocket, payload: dict[str, Any]):
		try:
			await websocket.send_text(json.dumps(payload))
			return True
		except Exception:
			return False

	async def broadcast_payload(self, payload: dict[str, Any]):
		if not self.global_connections:
			return
		dead = []
		for connection in self.global_connections:
			ok = await self._safe_send(connection, payload)
			if not ok:
				dead.append(connection)
		for ws in dead:
			self.remove_connection(ws)

	async def process_message(self, websocket: WebSocket, data: str):
		"""
		Process incoming websocket messages.
		Returns payload for global broadcast, or None.
		"""
		try:
			raw = json.loads(data)
			payload = VibePayload(**raw)
		except (json.JSONDecodeError, ValidationError):
			await self._safe_send(
				websocket,
				{"type": "error", "content": "Invalid payload format."},
			)
			return None

		# Room subscribe action (presence channel)
		if payload.action == "subscribe":
			if payload.shopId:
				await self.subscribe_to_room(websocket, str(payload.shopId))
			return None

		# Broadcast vibe payload globally
		response = payload.model_dump()
		response["type"] = "vibe"
		return response

	def remove_connection(self, websocket: WebSocket) -> list[str]:
		affected_shops: list[str] = []
		if websocket in self.global_connections:
			self.global_connections.remove(websocket)

		empty_shops = []
		for shop_id, connections in self.room_connections.items():
			if websocket in connections:
				connections.remove(websocket)
				affected_shops.append(shop_id)
				if not connections:
					empty_shops.append(shop_id)

		for shop_id in empty_shops:
			del self.room_connections[shop_id]

		return affected_shops

	async def handle_disconnect(self, websocket: WebSocket):
		try:
			affected_shops = self.remove_connection(websocket)
			for shop_id in affected_shops:
				connections = self.room_connections.get(shop_id, [])
				if not connections:
					continue
				msg = {
					"type": "presence",
					"shopId": int(shop_id) if shop_id.isdigit() else shop_id,
					"count": len(connections),
				}
				for conn in connections:
					await self._safe_send(conn, msg)

			await self.broadcast_heatmap()
		except Exception as exc:
			logger.warning("disconnect handling failed: %s", exc)

	async def broadcast_heatmap(self):
		if not self.global_connections:
			return
		data_payload: dict[str, int] = {}
		for shop_id, conns in self.room_connections.items():
			if conns:
				data_payload[shop_id] = len(conns)
		if not data_payload:
			return
		await self.broadcast_payload({"type": "heatmap", "data": data_payload})

	async def subscribe_to_room(self, websocket: WebSocket, shop_id: str):
		if shop_id not in self.room_connections:
			self.room_connections[shop_id] = []
		if websocket not in self.room_connections[shop_id]:
			self.room_connections[shop_id].append(websocket)

		msg = {
			"type": "presence",
			"shopId": int(shop_id) if shop_id.isdigit() else shop_id,
			"count": len(self.room_connections[shop_id]),
		}
		for conn in self.room_connections[shop_id]:
			await self._safe_send(conn, msg)

		await self.broadcast_heatmap()


manager = ConnectionManager()

_bg_tasks: list[asyncio.Task] = []
_bg_stop_event = asyncio.Event()
_last_hotspot_hash = ""
_last_hotspot_rollup = 0.0


async def _dispatch_map_effects_loop():
	"""Poll queue and broadcast short-lived effects in batches."""
	poll_seconds = max(settings.MAP_EFFECT_POLL_MS, 150) / 1000.0
	batch_size = max(settings.MAP_EFFECT_BATCH_SIZE, 1)

	while not _bg_stop_event.is_set():
		try:
			if not manager.global_connections:
				await asyncio.sleep(poll_seconds)
				continue

			rows = await asyncio.to_thread(
				_rpc,
				"dequeue_map_effects",
				{"p_limit": batch_size},
			)
			events = list(rows or [])
			if events:
				# Backpressure guard: cap payload size per tick
				events = events[:batch_size]
				await manager.broadcast_payload(
					{
						"type": "map_effect",
						"events": events,
						"ts": int(time.time() * 1000),
					}
				)
		except asyncio.CancelledError:
			break
		except Exception as exc:
			logger.warning("map effect dispatcher error: %s", exc)
		finally:
			await asyncio.sleep(poll_seconds)


async def _dispatch_hotspot_loop():
	"""Broadcast hotspot snapshots periodically with duplicate suppression."""
	global _last_hotspot_hash
	global _last_hotspot_rollup

	interval_seconds = max(settings.HOTSPOT_BROADCAST_MS, 5000) / 1000.0

	while not _bg_stop_event.is_set():
		try:
			if not manager.global_connections:
				await asyncio.sleep(interval_seconds)
				continue

			now = time.time()
			if now - _last_hotspot_rollup >= 300:
				# Refresh aggregate every ~5 minutes
				try:
					await asyncio.to_thread(_rpc, "rollup_hotspot_5m", {})
				except Exception as exc:
					logger.debug("hotspot rollup skipped: %s", exc)
				_last_hotspot_rollup = now

			try:
				rows = await asyncio.to_thread(
					_rpc,
					"get_hotspot_snapshot",
					{"p_limit": 20},
				)
				snapshot = list(rows or [])
			except Exception:
				snapshot = await asyncio.to_thread(_hotspot_snapshot, 20)

			payload_data = snapshot[:20]
			payload_hash = hashlib.md5(
				json.dumps(payload_data, sort_keys=True, default=str).encode("utf-8")
			).hexdigest()

			# Skip duplicate payloads to reduce websocket spam
			if payload_hash and payload_hash == _last_hotspot_hash:
				await asyncio.sleep(interval_seconds)
				continue

			_last_hotspot_hash = payload_hash
			await manager.broadcast_payload(
				{
					"type": "hotspot_update",
					"data": payload_data,
					"ts": int(time.time() * 1000),
				}
			)
		except asyncio.CancelledError:
			break
		except Exception as exc:
			logger.warning("hotspot broadcaster error: %s", exc)
		finally:
			await asyncio.sleep(interval_seconds)


async def start_background_tasks():
	"""Called by app startup."""
	if _bg_tasks:
		return
	_bg_stop_event.clear()
	_bg_tasks.extend(
		[
			asyncio.create_task(_dispatch_map_effects_loop(), name="map_effect_dispatcher"),
			asyncio.create_task(_dispatch_hotspot_loop(), name="hotspot_dispatcher"),
		]
	)
	logger.info("vibes background tasks started")


async def stop_background_tasks():
	"""Called by app shutdown."""
	_bg_stop_event.set()
	for task in _bg_tasks:
		task.cancel()
	if _bg_tasks:
		await asyncio.gather(*_bg_tasks, return_exceptions=True)
	_bg_tasks.clear()
	logger.info("vibes background tasks stopped")


@router.websocket("/vibe-stream")
async def vibe_stream(websocket: WebSocket):
	await manager.connect(websocket)
	last_msg_time = 0.0

	try:
		while True:
			data = await websocket.receive_text()
			now = time.time()

			# Simple anti-spam guard
			if now - last_msg_time < 0.35:
				await manager._safe_send(
					websocket,
					{"type": "error", "content": "Too fast! Chill."},
				)
				continue

			last_msg_time = now
			result = await manager.process_message(websocket, data)
			if result:
				await manager.broadcast_payload(result)
	except WebSocketDisconnect:
		await manager.handle_disconnect(websocket)
	except Exception as exc:
		logger.warning("vibe websocket error: %s", exc)
		await manager.handle_disconnect(websocket)
