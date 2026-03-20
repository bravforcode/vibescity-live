<!-- src/components/map/NeonPinSign.vue -->
<!-- Neon block sign markers — VibesCity Nimman style city grid layout -->

<script setup>
import { computed, ref } from "vue";

const props = defineProps({
	shop: { type: Object, required: true },
	isVisible: { type: Boolean, default: true },
	isSelected: { type: Boolean, default: false },
});

const emit = defineEmits(["click", "hover", "unhover"]);

const isHovered = ref(false);

// Category → neon color (Nimman palette)
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

// Category → emoji icon
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

// Category label: uppercase, max 14 chars
const categoryLabel = computed(() =>
	(props.shop.category || props.shop.type || "VENUE")
		.toUpperCase()
		.slice(0, 14),
);

// Venue name: max 18 chars
const venueName = computed(() => (props.shop.name || "").slice(0, 22));
</script>

<template>
	<div
		v-if="isVisible"
		class="ns"
		:class="{
			'ns--live': shop.isLive,
			'ns--selected': isSelected,
			'ns--hovered': isHovered,
		}"
		:style="{
			'--c': glowColor,
			'--scale': isSelected ? 1.22 : isHovered ? 1.1 : 1,
		}"
		role="button"
		:aria-label="shop.name"
		tabindex="0"
		@click.stop="emit('click', shop)"
		@mouseenter="isHovered = true; emit('hover', shop)"
		@mouseleave="isHovered = false; emit('unhover', shop)"
		@keydown.enter.stop="emit('click', shop)"
	>
		<!-- LIVE badge — sits above the sign board -->
		<div v-if="shop.isLive" class="ns__live" aria-hidden="true">
			<span class="ns__live-dot" />
			LIVE
		</div>

		<!-- Main neon sign board -->
		<div class="ns__board">
			<!-- Left: big emoji icon -->
			<span class="ns__icon" aria-hidden="true">{{ icon }}</span>

			<!-- Right: text stack -->
			<div class="ns__text">
				<div class="ns__name">{{ venueName }}</div>
				<div class="ns__cat">{{ categoryLabel }}</div>
			</div>
		</div>

		<!-- Bottom arrow pointer -->
		<div class="ns__tip" aria-hidden="true" />
	</div>
</template>

<style scoped>
/* ── Root ────────────────────────────────────────────────────── */
.ns {
	--c: #00d4ff;
	--scale: 1;
	--glow-soft: color-mix(in srgb, var(--c) 35%, transparent);
	--glow-mid:  color-mix(in srgb, var(--c) 55%, transparent);

	position: relative;
	display: inline-flex;
	flex-direction: column;
	align-items: center;
	cursor: pointer;
	user-select: none;
	transform: scale(var(--scale)) translateZ(0);
	transform-origin: bottom center;
	transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
	will-change: transform;
	filter: drop-shadow(0 4px 12px var(--glow-soft));
}

/* ── Board ───────────────────────────────────────────────────── */
.ns__board {
	display: flex;
	align-items: center;
	gap: 9px;
	padding: 7px 13px 7px 10px;

	/* Dark background like a real neon sign chassis */
	background: #06080f;
	border: 2.5px solid var(--c);
	border-radius: 5px;
	min-width: 160px;
	max-width: 210px;

	/* Multi-layer neon glow */
	box-shadow:
		0 0 6px var(--c),
		0 0 18px var(--glow-soft),
		inset 0 0 14px color-mix(in srgb, var(--c) 10%, transparent);

	position: relative;
	z-index: 2;

	/* Subtle inner frame line (double-border effect) */
	outline: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
	outline-offset: 3px;
}

/* ── Icon ────────────────────────────────────────────────────── */
.ns__icon {
	font-size: 20px;
	line-height: 1;
	flex-shrink: 0;
	filter: drop-shadow(0 0 5px var(--c));
}

/* ── Text ────────────────────────────────────────────────────── */
.ns__text {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.ns__name {
	font-size: 13px;
	font-weight: 900;
	letter-spacing: 0.5px;
	color: #fff;
	text-shadow:
		0 0 5px var(--c),
		0 0 14px var(--glow-mid);
	text-transform: uppercase;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 140px;
	line-height: 1.2;
}

.ns__cat {
	font-size: 9px;
	font-weight: 700;
	letter-spacing: 1.2px;
	color: var(--c);
	opacity: 0.9;
	text-transform: uppercase;
	line-height: 1;
	white-space: nowrap;
}

/* ── Tip arrow ───────────────────────────────────────────────── */
.ns__tip {
	width: 0;
	height: 0;
	border-left: 7px solid transparent;
	border-right: 7px solid transparent;
	border-top: 9px solid var(--c);
	filter: drop-shadow(0 3px 5px var(--c));
	position: relative;
	z-index: 1;
}

/* ── LIVE badge ──────────────────────────────────────────────── */
.ns__live {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 2px 7px;
	background: #ff2d78;
	border-radius: 3px 3px 0 0;
	font-size: 8px;
	font-weight: 900;
	letter-spacing: 1.5px;
	color: #fff;
	text-shadow: 0 0 5px rgba(255,255,255,0.7);
	box-shadow: 0 0 8px #ff2d78, 0 0 20px rgba(255,45,120,0.5);
	animation: live-pulse 1.1s ease-in-out infinite;
}

.ns__live-dot {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 0 4px #fff;
	animation: dot-blink 0.85s ease-in-out infinite;
}

/* ── Hover / Selected states ─────────────────────────────────── */
.ns--hovered .ns__board,
.ns--selected .ns__board {
	box-shadow:
		0 0 10px var(--c),
		0 0 28px var(--glow-mid),
		0 0 50px var(--glow-soft),
		inset 0 0 18px color-mix(in srgb, var(--c) 16%, transparent);
	border-width: 3px;
}

/* LIVE board pulse */
.ns--live .ns__board {
	border-color: #ff2d78;
	animation: board-pulse 1.1s ease-in-out infinite;
}

/* ── Keyframes ───────────────────────────────────────────────── */
@keyframes live-pulse {
	0%, 100% { opacity: 1; }
	50%       { opacity: 0.72; }
}

@keyframes dot-blink {
	0%, 100% { opacity: 1; transform: scale(1); }
	50%       { opacity: 0.35; transform: scale(0.65); }
}

@keyframes board-pulse {
	0%, 100% {
		box-shadow:
			0 0 8px #ff2d78,
			0 0 20px rgba(255,45,120,0.38),
			inset 0 0 12px rgba(255,45,120,0.10);
	}
	50% {
		box-shadow:
			0 0 16px #ff2d78,
			0 0 38px rgba(255,45,120,0.6),
			inset 0 0 22px rgba(255,45,120,0.18);
	}
}

/* ── Reduced motion ──────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
	.ns { transition: none; }
	.ns__live, .ns__live-dot, .ns--live .ns__board { animation: none; }
}
</style>
