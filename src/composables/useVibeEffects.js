import { ref } from "vue";

export function useVibeEffects() {
	// We will manage a list of temporary "floating" vibes
	// Each object: { id: timestamp, shopId: 1, emoji: "🔥", lat: ..., lng: ..., opacity: 1, offset: 0 }
	const activeVibeEffects = ref([]);

	const MAX_VIBES = 30;

	const triggerVibeEffect = (shop, emoji) => {
		if (!shop || !shop.lat) return;

		const id = Date.now() + Math.random();

		activeVibeEffects.value.push({
			id,
			shopId: shop.id,
			lat: shop.lat,
			lng: shop.lng,
			emoji: emoji || "✨",
			opacity: 1,
			offsetY: 0,
		});

		// Protect against Map freeze during massive websocket barrages
		if (activeVibeEffects.value.length > MAX_VIBES) {
			activeVibeEffects.value.shift(); // Remove the oldest vibe instantly
		}

		// Animation Loop for this specific particle is handled by CSS/GSAP usually,
		// but since we are rendering markers on Mapbox, we might need to manually update ref or use CSS animation in the marker component.
		// For performance, we'll let Vue handle the "enter" transition and auto-remove after X seconds.

		setTimeout(() => {
			removeVibe(id);
		}, 2000); // 2 seconds float time
	};

	const removeVibe = (id) => {
		activeVibeEffects.value = activeVibeEffects.value.filter(
			(v) => v.id !== id,
		);
	};

	return {
		activeVibeEffects,
		triggerVibeEffect,
	};
}
