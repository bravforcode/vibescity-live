import confetti from "canvas-confetti";

/**
 * Trigger a particle burst at a specific screen coordinate
 * @param {number} x - Screen X percentage (0-1)
 * @param {number} y - Screen Y percentage (0-1)
 * @param {string} [type='vibe'] - 'vibe' | 'love' | 'coin'
 */
export const triggerParticleBurst = (x, y, type = "vibe") => {
	let colors = ["#ef4444", "#3b82f6", "#eab308"];
	let particleCount = 40;

	if (type === "love") {
		colors = ["#ec4899", "#f43f5e"];
		particleCount = 25;
	} else if (type === "coin") {
		colors = ["#fbbf24", "#d97706", "#fff"];
		particleCount = 30;
	}

	confetti({
		particleCount,
		startVelocity: 30,
		spread: 360,
		origin: { x, y },
		colors,
		disableForReducedMotion: true,
		zIndex: 10001, // Above Mapbox Popups
	});
};

/**
 * Trigger emoji particle burst at a specific screen coordinate
 * @param {number} x - Screen X percentage (0-1)
 * @param {number} y - Screen Y percentage (0-1)
 * @param {string} emoji - Emoji character to use as particle
 */
export const triggerEmojiParticles = (x, y, emoji = "❤️") => {
	const scalar = 2;
	const emojiShape = confetti.shapeFromText({ text: emoji, scalar });

	confetti({
		particleCount: 12,
		angle: 90,
		spread: 50,
		startVelocity: 25,
		decay: 0.92,
		gravity: 0.8,
		origin: { x, y },
		shapes: [emojiShape],
		scalar,
		disableForReducedMotion: true,
		zIndex: 10001,
	});
};

/**
 * Trigger a "fireworks" effect from bottom of screen
 */
export const triggerFireworks = () => {
	const duration = 3000;
	const animationEnd = Date.now() + duration;
	const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10001 };

	const random = (min, max) => Math.random() * (max - min) + min;

	const interval = setInterval(() => {
		const timeLeft = animationEnd - Date.now();

		if (timeLeft <= 0) {
			return clearInterval(interval);
		}

		const particleCount = 50 * (timeLeft / duration);

		confetti({
			...defaults,
			particleCount,
			origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 },
		});
		confetti({
			...defaults,
			particleCount,
			origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 },
		});
	}, 250);
};
