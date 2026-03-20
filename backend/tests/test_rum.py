def test_rum_beacon_accepts_batch(client):
    payload = {
        "beacons": [
            {
                "session_id_hash": "hash_123456",
                "region_code": "th",
                "carrier": "AIS Mobile",
                "device_tier": "B",
                "display_refresh_hz": 120,
                "inp_ms": 133.2,
                "fcp_ms": 812.5,
                "lcp_ms": 1211.1,
                "cls": 0.03,
                "touch_to_scroll_start_ms": 17.4,
                "bfcache_hit": True,
                "prefetch_hit": False,
                "coalesced_pointer_events_per_frame": 2.4,
                "thermal_fps_drop_percent": 8.1,
                "sign_first_paint_ms": 420.4,
                "neon_sprite_hit_ratio_v2": 0.92,
                "neon_fallback_rate_v2": 0.01,
                "neon_visible_count": 37,
                "mini_dot_visible_count": 0,
                "neon_event": "neon_v2_render_pipeline",
                "shop_id_hash": "fnv1a_abc123",
                "zoom": 15.2,
                "lod": "full",
                "viewport_bucket": "in",
                "flag_version": "2-stable",
                "render_stage": "map_inject",
                "error_code": "none",
            }
        ]
    }
    response = client.post("/api/v1/rum/beacon", json=payload)
    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] == 1


def test_rum_beacon_rejects_invalid_payload(client):
    payload = {"beacons": [{"session_id_hash": "bad"}]}
    response = client.post("/api/v1/rum/beacon", json=payload)
    assert response.status_code == 422
