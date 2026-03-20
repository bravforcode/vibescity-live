/**
 * Neon Sign Debug Utilities
 *
 * Add to browser console to debug neon signs:
 * window.debugNeonSigns()
 */

import { isMapDebugLoggingEnabled } from "./mapDebug";

export function setupNeonSignDebug(map, neonSignCache) {
	if (typeof window === "undefined") return;

	window.debugNeonSigns = () => {
		if (!map?.value) {
			console.error("Map not available");
			return;
		}

		const m = map.value;
		console.group("🎨 Neon Sign Debug Report");

		// 1. Check map state
		console.log("📍 Map State:");
		console.log("  - Style loaded:", m.isStyleLoaded?.());
		console.log("  - Zoom level:", m.getZoom?.());
		console.log("  - Center:", m.getCenter?.());

		// 2. Check sources
		console.log("\n📦 Sources:");
		const pinsSource = m.getSource("pins_source");
		if (pinsSource) {
			const data = pinsSource._data;
			const features = data?.features || [];
			const featuresWithNeon = features.filter((f) => f?.properties?.neon_key);
			console.log(`  - pins_source: ${features.length} features`);
			console.log(`  - Features with neon_key: ${featuresWithNeon.length}`);
			if (featuresWithNeon.length > 0) {
				console.log(
					"  - Sample neon properties:",
					featuresWithNeon[0]?.properties,
				);
			}
		} else {
			console.log("  - pins_source: NOT FOUND");
		}

		// 3. Check layers
		console.log("\n🎭 Neon Sign Layers:");
		const neonLayers = [
			"neon-sign-full",
			"neon-sign-compact",
			"neon-sign-mini",
		];
		neonLayers.forEach((layerId) => {
			const layer = m.getLayer(layerId);
			if (layer) {
				const visibility = m.getLayoutProperty(layerId, "visibility");
				const filter = m.getFilter(layerId);
				console.log(`  - ${layerId}:`);
				console.log(`    • Exists: ✅`);
				console.log(`    • Visibility: ${visibility || "visible"}`);
				console.log(`    • Filter:`, filter);
				console.log(`    • Type: ${layer.type}`);
				console.log(`    • Source: ${layer.source}`);
			} else {
				console.log(`  - ${layerId}: ❌ NOT FOUND`);
			}
		});

		// 4. Check sprite cache
		if (neonSignCache) {
			console.log("\n💾 Sprite Cache Stats:");
			const stats = neonSignCache.getStats();
			console.log("  - Hits:", stats.hits);
			console.log("  - Misses:", stats.misses);
			console.log("  - Generated:", stats.generated);
			console.log("  - Failed:", stats.failed);
			console.log("  - Hit ratio:", `${(stats.hitRatio * 100).toFixed(1)}%`);
			console.log("  - Memory:", `${stats.memoryMb.toFixed(2)} MB`);
		}

		// 5. Check map images
		console.log("\n🖼️ Map Images:");
		const style = m.getStyle();
		if (style?.sprite) {
			console.log("  - Sprite URL:", style.sprite);
		}
		// Try to list neon sign images
		const testImageId = "neon-sign-test";
		console.log("  - Checking for neon sign images...");
		let neonImageCount = 0;
		for (let i = 0; i < 100; i++) {
			const imageId = `neon-sign-${i.toString(36)}`;
			if (m.hasImage?.(imageId)) {
				neonImageCount++;
			}
		}
		console.log(`  - Found ~${neonImageCount} neon sign images`);

		// 6. Recommendations
		console.log("\n💡 Recommendations:");
		if (!m.isStyleLoaded?.()) {
			console.log("  ⚠️ Map style not loaded - wait for style.load event");
		}
		const zoom = m.getZoom?.();
		if (zoom < 12) {
			console.log(
				`  ⚠️ Zoom level ${zoom?.toFixed(1)} is below minimum (12) for neon signs`,
			);
		}
		const pinsSource2 = m.getSource("pins_source");
		if (!pinsSource2) {
			console.log("  ⚠️ pins_source not found - features not loaded yet");
		} else {
			const data = pinsSource2._data;
			const features = data?.features || [];
			const featuresWithNeon = features.filter((f) => f?.properties?.neon_key);
			if (features.length > 0 && featuresWithNeon.length === 0) {
				console.log(
					"  ⚠️ Features exist but none have neon_key - check toNeonFeatureProperties()",
				);
			}
			if (featuresWithNeon.length > 0) {
				const featuresWithSprites = featuresWithNeon.filter(
					(f) =>
						f?.properties?.neon_sprite_full ||
						f?.properties?.neon_sprite_compact ||
						f?.properties?.neon_sprite_mini,
				);
				if (featuresWithSprites.length === 0) {
					console.log(
						"  ⚠️ Features have neon_key but no sprite properties - check ensureSpritesForFeatures()",
					);
				}
			}
		}

		console.groupEnd();
	};

	if (isMapDebugLoggingEnabled()) {
		console.log(
			"✅ Neon sign debug helper installed. Run window.debugNeonSigns() to diagnose issues.",
		);
	}
}
