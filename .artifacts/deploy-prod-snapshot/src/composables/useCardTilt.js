/**
 * useCardTilt — Adds subtle perspective tilt to a card element
 * based on pointer position. Creates a premium 3D parallax feel.
 *
 * Usage:
 *   const { tiltStyle, onPointerMove, onPointerLeave } = useCardTilt();
 *   <div :style="tiltStyle" @pointermove="onPointerMove" @pointerleave="onPointerLeave" />
 */
import { computed, ref } from "vue";

const DEFAULTS = {
	maxTilt: 6, // degrees
	perspective: 800, // px
	scale: 1.02, // slight zoom on hover
	speed: 400, // transition ms
	glare: true,
};

export function useCardTilt(opts = {}) {
	const config = { ...DEFAULTS, ...opts };

	const tiltX = ref(0);
	const tiltY = ref(0);
	const isHovering = ref(false);

	const onPointerMove = (e) => {
		const el = e.currentTarget;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width; // 0..1
		const y = (e.clientY - rect.top) / rect.height; // 0..1

		// Map to -maxTilt..+maxTilt
		tiltX.value = (y - 0.5) * -2 * config.maxTilt;
		tiltY.value = (x - 0.5) * 2 * config.maxTilt;
		isHovering.value = true;
	};

	const onPointerLeave = () => {
		tiltX.value = 0;
		tiltY.value = 0;
		isHovering.value = false;
	};

	const tiltStyle = computed(() => ({
		transform: isHovering.value
			? `perspective(${config.perspective}px) rotateX(${tiltX.value}deg) rotateY(${tiltY.value}deg) scale3d(${config.scale}, ${config.scale}, ${config.scale})`
			: `perspective(${config.perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
		transition: `transform ${config.speed}ms cubic-bezier(0.03, 0.98, 0.52, 0.99)`,
		willChange: "transform",
	}));

	// Glare overlay style (optional — a subtle highlight that follows pointer)
	const glareStyle = computed(() => {
		if (!config.glare || !isHovering.value) {
			return { opacity: 0, transition: `opacity ${config.speed}ms ease` };
		}
		const glareX = (tiltY.value / config.maxTilt + 1) * 50; // 0..100
		const glareY = (tiltX.value / config.maxTilt + 1) * 50;
		return {
			opacity: 0.15,
			background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.4) 0%, transparent 60%)`,
			transition: `opacity ${config.speed}ms ease`,
		};
	});

	return {
		tiltStyle,
		glareStyle,
		isHovering,
		onPointerMove,
		onPointerLeave,
	};
}
