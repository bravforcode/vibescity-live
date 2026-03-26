<!-- src/components/map/NeonPinSign.vue -->
<!-- Premium neon sign markers — VibeCity Chiang Mai Nimman style -->

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps({
	shop: { type: Object, required: true },
	isVisible: { type: Boolean, default: true },
	isSelected: { type: Boolean, default: false },
});

const emit = defineEmits(["click", "hover", "unhover"]);

const isHovered = ref(false);
const flickerActive = ref(false);
let flickerTimer = null;

// Category → neon color palette
const CATEGORY_COLORS = {
	bar: "#ff2d78",
	cocktail: "#ff2d78",
	pub: "#ff2d78",
	nightlife: "#ff2d78",
	cafe: "#ff9500",
	coffee: "#ff9500",
	restaurant: "#ff6b35",
	food: "#ff6b35",
	street_food: "#ff6b35",
	massage: "#bf5af2",
	spa: "#bf5af2",
	wellness: "#bf5af2",
	accommodation: "#00d4ff",
	hotel: "#00d4ff",
	hostel: "#00d4ff",
	shop: "#5e9eff",
	retail: "#5e9eff",
	gallery: "#ffd60a",
	art: "#ffd60a",
	museum: "#ffd60a",
	vegan: "#30d158",
	organic: "#30d158",
	live_music: "#b5e853",
	music: "#b5e853",
	entertainment: "#b5e853",
	default: "#00d4ff",
};

const CATEGORY_ICONS = {
	bar: "🍸",
	cocktail: "🍸",
	pub: "🍺",
	cafe: "☕",
	coffee: "☕",
	restaurant: "🍜",
	food: "🍜",
	street_food: "🥘",
	massage: "💆",
	spa: "🧖",
	accommodation: "🏨",
	hotel: "🏨",
	hostel: "🏠",
	shop: "🛍",
	gallery: "🎨",
	art: "🎨",
	vegan: "🌿",
	live_music: "🎸",
	music: "🎵",
	entertainment: "🎭",
	default: "✨",
};

const categoryKey = computed(() => {
	const raw = (props.shop.category || props.shop.type || "")
		.toLowerCase()
		.replace(/\s+/g, "_");
	for (const key of Object.keys(CATEGORY_COLORS)) {
		if (raw.includes(key)) return key;
	}
	return "default";
});

const glowColor = computed(() =>
	props.shop.isLive
		? "#ff2d78"
		: (CATEGORY_COLORS[categoryKey.value] ?? CATEGORY_COLORS.default),
);

const icon = computed(
	() => CATEGORY_ICONS[categoryKey.value] ?? CATEGORY_ICONS.default,
);

const categoryLabel = computed(() =>
	(props.shop.category || props.shop.type || "VENUE")
		.toUpperCase()
		.slice(0, 14),
);

const venueName = computed(() => (props.shop.name || "").slice(0, 22));

// Occasional neon flicker for realism
const startFlicker = () => {
	if (Math.random() > 0.3) return; // Only 30% of signs flicker
	const scheduleNext = () => {
		const delay = 8000 + Math.random() * 20000; // Every 8–28 seconds
		flickerTimer = setTimeout(() => {
			flickerActive.value = true;
			setTimeout(
				() => {
					flickerActive.value = false;
					setTimeout(
						() => {
							flickerActive.value = true;
							setTimeout(
								() => {
									flickerActive.value = false;
									scheduleNext();
								},
								60 + Math.random() * 80,
							);
						},
						30 + Math.random() * 50,
					);
				},
				40 + Math.random() * 60,
			);
		}, delay);
	};
	scheduleNext();
};

onMounted(() => startFlicker());
onUnmounted(() => {
	if (flickerTimer) clearTimeout(flickerTimer);
});
</script>

<template>
	<div
		v-if="isVisible"
		class="ns"
		:class="{
			'ns--live': shop.isLive,
			'ns--selected': isSelected,
			'ns--hovered': isHovered,
			'ns--flicker': flickerActive,
		}"
		:style="{
			'--c': glowColor,
			'--scale': isSelected ? 1.28 : isHovered ? 1.12 : 1,
		}"
		role="button"
		:aria-label="shop.name"
		tabindex="0"
		@click.stop="emit('click', shop)"
		@mouseenter="isHovered = true; emit('hover', shop)"
		@mouseleave="isHovered = false; emit('unhover', shop)"
		@keydown.enter.stop="emit('click', shop)"
	>
		<!-- LIVE badge -->
		<div v-if="shop.isLive" class="ns__live" aria-hidden="true">
			<span class="ns__live-dot" />
			LIVE
		</div>

		<!-- Main sign board -->
		<div class="ns__board">
			<!-- Scan line overlay for CRT effect -->
			<div class="ns__scan" aria-hidden="true" />

			<!-- Corner decorations -->
			<div class="ns__corner ns__corner--tl" aria-hidden="true" />
			<div class="ns__corner ns__corner--tr" aria-hidden="true" />
			<div class="ns__corner ns__corner--bl" aria-hidden="true" />
			<div class="ns__corner ns__corner--br" aria-hidden="true" />

			<!-- Inner divider line -->
			<div class="ns__divider" aria-hidden="true" />

			<!-- Left: emoji icon with halo -->
			<div class="ns__icon-wrap" aria-hidden="true">
				<span class="ns__icon">{{ icon }}</span>
				<div class="ns__icon-halo" />
			</div>

			<!-- Right: text -->
			<div class="ns__text">
				<div class="ns__name">{{ venueName }}</div>
				<div class="ns__cat">{{ categoryLabel }}</div>
			</div>
		</div>

		<!-- Bottom pointer with glow -->
		<div class="ns__tip-wrap" aria-hidden="true">
			<div class="ns__tip" />
			<div class="ns__tip-glow" />
		</div>
	</div>
</template>

<style scoped>
/* ── Tokens ──────────────────────────────────────────────────── */
.ns {
	--c: #00d4ff;
	--scale: 1;
	--glow-soft:  color-mix(in srgb, var(--c) 28%, transparent);
	--glow-mid:   color-mix(in srgb, var(--c) 50%, transparent);
	--glow-hard:  color-mix(in srgb, var(--c) 80%, transparent);
	--glow-white: color-mix(in srgb, var(--c) 15%, #ffffff22);

	position: relative;
	display: inline-flex;
	flex-direction: column;
	align-items: center;
	cursor: pointer;
	user-select: none;
	transform: scale(var(--scale)) translateZ(0);
	transform-origin: bottom center;
	transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
	will-change: transform;
	filter: drop-shadow(0 6px 16px var(--glow-soft));
}

/* ── Board ───────────────────────────────────────────────────── */
.ns__board {
	position: relative;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 14px 8px 10px;

	/* Dark neon sign chassis */
	background:
		linear-gradient(
			160deg,
			rgba(255,255,255,0.05) 0%,
			transparent 50%,
			rgba(0,0,0,0.4) 100%
		),
		#080c14;
	border: 2px solid var(--c);
	border-radius: 6px;
	min-width: 162px;
	max-width: 215px;
	overflow: hidden;

	/* Layered neon glow */
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--c) 20%, transparent),
		0 0 8px var(--c),
		0 0 20px var(--glow-soft),
		0 0 40px var(--glow-soft),
		inset 0 0 16px color-mix(in srgb, var(--c) 8%, transparent);

	z-index: 2;
	transition: box-shadow 0.3s ease, border-color 0.3s ease;
}

/* Scan line CRT effect */
.ns__scan {
	position: absolute;
	inset: 0;
	background: repeating-linear-gradient(
		0deg,
		transparent,
		transparent 2px,
		rgba(0, 0, 0, 0.06) 2px,
		rgba(0, 0, 0, 0.06) 4px
	);
	pointer-events: none;
	z-index: 0;
	border-radius: inherit;
}

/* ── Corners ─────────────────────────────────────────────────── */
.ns__corner {
	position: absolute;
	width: 6px;
	height: 6px;
	border-color: var(--c);
	border-style: solid;
	opacity: 0.8;
}
.ns__corner--tl { top: 3px; left: 3px;   border-width: 1.5px 0 0 1.5px; border-radius: 2px 0 0 0; }
.ns__corner--tr { top: 3px; right: 3px;  border-width: 1.5px 1.5px 0 0; border-radius: 0 2px 0 0; }
.ns__corner--bl { bottom: 3px; left: 3px;  border-width: 0 0 1.5px 1.5px; border-radius: 0 0 0 2px; }
.ns__corner--br { bottom: 3px; right: 3px; border-width: 0 1.5px 1.5px 0; border-radius: 0 0 2px 0; }

/* Vertical divider */
.ns__divider {
	position: absolute;
	left: 40px;
	top: 6px;
	bottom: 6px;
	width: 1px;
	background: linear-gradient(
		to bottom,
		transparent,
		var(--glow-hard) 30%,
		var(--glow-hard) 70%,
		transparent
	);
	opacity: 0.4;
}

/* ── Icon ────────────────────────────────────────────────────── */
.ns__icon-wrap {
	position: relative;
	flex-shrink: 0;
	z-index: 1;
}

.ns__icon {
	display: block;
	font-size: 20px;
	line-height: 1;
	filter: drop-shadow(0 0 6px var(--c)) drop-shadow(0 0 2px #fff8);
	animation: icon-float 3s ease-in-out infinite;
}

.ns__icon-halo {
	position: absolute;
	inset: -4px;
	border-radius: 50%;
	background: radial-gradient(circle, var(--glow-soft) 0%, transparent 70%);
	pointer-events: none;
}

/* ── Text ────────────────────────────────────────────────────── */
.ns__text {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	z-index: 1;
}

.ns__name {
	font-size: 12.5px;
	font-weight: 900;
	letter-spacing: 0.7px;
	color: #fff;
	text-shadow:
		0 0 4px #fff,
		0 0 8px var(--c),
		0 0 18px var(--glow-mid);
	text-transform: uppercase;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 142px;
	line-height: 1.2;
}

.ns__cat {
	font-size: 8.5px;
	font-weight: 700;
	letter-spacing: 1.4px;
	color: var(--c);
	text-transform: uppercase;
	line-height: 1;
	white-space: nowrap;
	opacity: 0.9;
	text-shadow: 0 0 6px var(--c);
}

/* ── Pointer tip ─────────────────────────────────────────────── */
.ns__tip-wrap {
	position: relative;
	display: flex;
	justify-content: center;
	z-index: 1;
}

.ns__tip {
	width: 0;
	height: 0;
	border-left: 7px solid transparent;
	border-right: 7px solid transparent;
	border-top: 9px solid var(--c);
	position: relative;
	z-index: 2;
}

.ns__tip-glow {
	position: absolute;
	top: 0;
	left: 50%;
	transform: translateX(-50%);
	width: 14px;
	height: 9px;
	background: radial-gradient(ellipse at center top, var(--glow-mid) 0%, transparent 80%);
	filter: blur(3px);
}

/* ── LIVE badge ──────────────────────────────────────────────── */
.ns__live {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	background: linear-gradient(90deg, #ff0060, #ff2d78);
	border-radius: 4px 4px 0 0;
	font-size: 8px;
	font-weight: 900;
	letter-spacing: 1.8px;
	color: #fff;
	text-shadow: 0 0 6px rgba(255,255,255,0.8);
	box-shadow:
		0 0 8px #ff2d78,
		0 0 20px rgba(255,45,120,0.5),
		inset 0 1px 0 rgba(255,255,255,0.3);
	animation: live-pulse 1.1s ease-in-out infinite;
}

.ns__live-dot {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 0 5px #fff, 0 0 10px #fff;
	animation: dot-blink 0.85s ease-in-out infinite;
}

/* ── Hover / Selected states ─────────────────────────────────── */
.ns--hovered .ns__board,
.ns--selected .ns__board {
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent),
		0 0 12px var(--c),
		0 0 28px var(--glow-mid),
		0 0 60px var(--glow-soft),
		inset 0 0 22px color-mix(in srgb, var(--c) 14%, transparent);
	border-width: 2.5px;
}

.ns--selected .ns__name {
	text-shadow:
		0 0 6px #fff,
		0 0 12px var(--c),
		0 0 28px var(--glow-mid);
}

/* selected bounce-in */
.ns--selected {
	animation: select-bounce 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* LIVE board pulse */
.ns--live .ns__board {
	border-color: #ff2d78;
	animation: board-pulse 1.2s ease-in-out infinite;
}

/* ── Flicker (realistic neon) ────────────────────────────────── */
.ns--flicker .ns__board {
	animation: neon-flicker 0.15s linear;
}
.ns--flicker .ns__name {
	animation: text-flicker 0.15s linear;
}

/* ── Keyframes ───────────────────────────────────────────────── */
@keyframes icon-float {
	0%, 100% { transform: translateY(0); }
	50%       { transform: translateY(-1.5px); }
}

@keyframes live-pulse {
	0%, 100% { opacity: 1; box-shadow: 0 0 8px #ff2d78, 0 0 20px rgba(255,45,120,0.5), inset 0 1px 0 rgba(255,255,255,0.3); }
	50%       { opacity: 0.75; box-shadow: 0 0 14px #ff2d78, 0 0 32px rgba(255,45,120,0.7), inset 0 1px 0 rgba(255,255,255,0.3); }
}

@keyframes dot-blink {
	0%, 100% { opacity: 1; transform: scale(1); }
	50%       { opacity: 0.3; transform: scale(0.6); }
}

@keyframes board-pulse {
	0%, 100% {
		box-shadow:
			0 0 0 1px rgba(255,45,120,0.3),
			0 0 10px #ff2d78,
			0 0 24px rgba(255,45,120,0.4),
			inset 0 0 14px rgba(255,45,120,0.10);
	}
	50% {
		box-shadow:
			0 0 0 1px rgba(255,45,120,0.5),
			0 0 18px #ff2d78,
			0 0 44px rgba(255,45,120,0.65),
			inset 0 0 24px rgba(255,45,120,0.18);
	}
}

@keyframes select-bounce {
	0%   { transform: scale(0.88) translateZ(0); }
	60%  { transform: scale(1.32) translateZ(0); }
	100% { transform: scale(var(--scale)) translateZ(0); }
}

@keyframes neon-flicker {
	0%, 100% { opacity: 1; }
	25%       { opacity: 0.2; }
	50%       { opacity: 0.85; }
	75%       { opacity: 0.1; }
}

@keyframes text-flicker {
	0%, 100% { opacity: 1; }
	40%       { opacity: 0; }
	70%       { opacity: 0.7; }
}

/* ── Reduced motion ──────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
	.ns { transition: none; }
	.ns__icon { animation: none; }
	.ns__live, .ns__live-dot, .ns--live .ns__board,
	.ns--flicker .ns__board, .ns--flicker .ns__name { animation: none; }
}
</style>
