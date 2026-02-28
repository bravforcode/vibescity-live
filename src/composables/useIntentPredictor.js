import { onMounted, onUnmounted, ref } from "vue";
import { useHardwareInfo } from "./useHardwareInfo";

/**
 * 🔮 Spatial AI Intent Predictor
 * Passively observes user micro-interactions to predict which venue they will click next.
 */

// Intent Scoring Weights
const SCORE_SCROLL_DECEL = 10;
const SCORE_MAP_PAN = 15;
const SCORE_PIN_HOVER = 25;
const SCORE_CARD_DWELL = 30;
const SCORE_CARD_TOUCH = 40;

const DECAY_RATE = 0.95; // 5% decay per tick
const TICK_INTERVAL = 1000; // 1 second

// Global Singleton State
const intentScores = new Map();
const topPredictions = ref([]);
let decayTimer = null;

const addScore = (venueId, amount) => {
	if (!venueId) return;
	const current = intentScores.get(venueId) || 0;
	intentScores.set(venueId, Math.min(current + amount, 100)); // Cap at 100
	updatePredictions();
};

const tickDecay = () => {
	let changed = false;
	for (const [id, score] of intentScores.entries()) {
		const next = score * DECAY_RATE;
		if (next < 5) {
			intentScores.delete(id);
			changed = true;
		} else {
			intentScores.set(id, next);
			if (Math.floor(score) !== Math.floor(next)) changed = true;
		}
	}
	if (changed) updatePredictions();
};

const updatePredictions = () => {
	const sorted = [...intentScores.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3) // Top 3
		.map(([id]) => id);

	// Only trigger reactivity if the top 3 actually changed
	if (JSON.stringify(sorted) !== JSON.stringify(topPredictions.value)) {
		topPredictions.value = sorted;
	}
};

export function useIntentPredictor() {
	const { isSlowNetwork, isLowPowerMode } = useHardwareInfo();
	let isObserverSetup = false;

	// Intersection Observer for Card Dwell Time
	let cardObserver = null;
	const dwellTimers = new Map();

	const setupDwellObserver = () => {
		if (typeof IntersectionObserver === "undefined") return;

		cardObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const id = entry.target.dataset.venueId;
					if (!id) continue;

					if (entry.isIntersecting) {
						// Start dwell timer (800ms)
						dwellTimers.set(
							id,
							setTimeout(() => {
								addScore(id, SCORE_CARD_DWELL);
							}, 800),
						);
					} else {
						// Cancel if scrolled away quickly
						clearTimeout(dwellTimers.get(id));
						dwellTimers.delete(id);
					}
				}
			},
			{ threshold: 0.8 }, // 80% visible
		);
	};

	const observeCards = () => {
		if (isSlowNetwork.value || isLowPowerMode.value) return; // Disable on slow networks
		if (!cardObserver) setupDwellObserver();

		// Wait a tick for DOM
		setTimeout(() => {
			const cards = document.querySelectorAll("[data-venue-id]");
			for (const card of cards) {
				cardObserver?.observe(card);

				// Add touchstart listener as a high-intent signal!
				card.addEventListener(
					"touchstart",
					() => addScore(card.dataset.venueId, SCORE_CARD_TOUCH),
					{ passive: true, once: true },
				);
				card.addEventListener(
					"pointerenter",
					() => addScore(card.dataset.venueId, SCORE_PIN_HOVER),
					{ passive: true, once: true },
				);
			}
		}, 100);
	};

	const recordMapPan = (visibleVenueIds) => {
		if (isSlowNetwork.value || isLowPowerMode.value) return;
		// A pan typically means they are looking at the center
		// Add a slight score to all visible pins
		for (const id of visibleVenueIds) {
			addScore(id, SCORE_MAP_PAN);
		}
	};

	const recordCarouselDeceleration = (centerVenueId) => {
		if (isSlowNetwork.value || isLowPowerMode.value) return;
		addScore(centerVenueId, SCORE_SCROLL_DECEL);
	};

	onMounted(() => {
		if (!isObserverSetup && !decayTimer) {
			decayTimer = setInterval(tickDecay, TICK_INTERVAL);
			isObserverSetup = true;
		}
	});

	onUnmounted(() => {
		if (cardObserver) {
			cardObserver.disconnect();
			cardObserver = null;
		}
		for (const timer of dwellTimers.values()) clearTimeout(timer);
		dwellTimers.clear();
	});

	return {
		topPredictions,
		observeCards,
		recordMapPan,
		recordCarouselDeceleration,
		addManualSignal: addScore,
	};
}
