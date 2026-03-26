<!-- src/components/ui/CategorySlider.vue -->
<!-- Premium neon category filter pills — VibeCity style -->
<script setup>
import { onMounted, ref } from "vue";
import { useHaptics } from "../../composables/useHaptics";

const props = defineProps({
	activeCategory: {
		type: String,
		default: "All",
	},
	isDarkMode: {
		type: Boolean,
		default: true,
	},
});

const emit = defineEmits(["select"]);
const { tapFeedback } = useHaptics();
const mounted = ref(false);

onMounted(() => {
	// Stagger entrance animation
	setTimeout(() => {
		mounted.value = true;
	}, 50);
});

const categories = [
	{ id: "All", label: "All", icon: "⚡", color: "#00d4ff" },
	{ id: "Live", label: "Live", icon: "🔴", color: "#ff2d78", special: true },
	{ id: "Bar", label: "Bar", icon: "🍸", color: "#ff2d78" },
	{ id: "Club", label: "Club", icon: "🎧", color: "#bf5af2" },
	{ id: "Restaurant", label: "Food", icon: "🍜", color: "#ff6b35" },
	{ id: "Karaoke", label: "Karaoke", icon: "🎤", color: "#ffd60a" },
	{ id: "Cafe", label: "Cafe", icon: "☕", color: "#ff9500" },
	{ id: "Massage", label: "Massage", icon: "💆", color: "#30d158" },
];

const handleSelect = (categoryId) => {
	tapFeedback();
	emit("select", categoryId);
};
</script>

<template>
	<div
		class="cs"
		:class="{ 'cs--visible': mounted }"
		role="tablist"
		aria-label="Filter categories"
	>
		<!-- Subtle left fade -->
		<div class="cs__fade cs__fade--left" aria-hidden="true" />

		<div class="cs__track">
			<button
				v-for="(cat, index) in categories"
				:key="cat.id"
				role="tab"
				:aria-selected="activeCategory === cat.id"
				:style="{
					'--cc': cat.color,
					'--delay': `${index * 45}ms`,
				}"
				class="cs__pill"
				:class="{
					'cs__pill--active': activeCategory === cat.id,
					'cs__pill--special': cat.special,
				}"
				@click="handleSelect(cat.id)"
			>
				<!-- Icon -->
				<span class="cs__pill-icon" aria-hidden="true">{{ cat.icon }}</span>

				<!-- Label -->
				<span class="cs__pill-label">{{ cat.label }}</span>

				<!-- Active glow ring -->
				<span
					v-if="activeCategory === cat.id"
					class="cs__pill-ring"
					aria-hidden="true"
				/>
			</button>
		</div>

		<!-- Subtle right fade -->
		<div class="cs__fade cs__fade--right" aria-hidden="true" />
	</div>
</template>

<style scoped>
/* ── Root ──────────────────────────────────────────────────── */
.cs {
	position: relative;
	width: 100%;
	pointer-events: auto;
}

.cs__track {
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 8px 16px;
	overflow-x: auto;
	scrollbar-width: none;
	-ms-overflow-style: none;
}
.cs__track::-webkit-scrollbar { display: none; }

/* ── Edge fades ────────────────────────────────────────────── */
.cs__fade {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 24px;
	z-index: 2;
	pointer-events: none;
}
.cs__fade--left {
	left: 0;
	background: linear-gradient(to right, rgba(5,5,15,0.85), transparent);
}
.cs__fade--right {
	right: 0;
	background: linear-gradient(to left, rgba(5,5,15,0.85), transparent);
}

/* ── Pill base ─────────────────────────────────────────────── */
.cs__pill {
	/* CSS token */
	--cc: #00d4ff;

	position: relative;
	display: flex;
	align-items: center;
	gap: 5px;
	flex-shrink: 0;
	padding: 6px 13px;
	border-radius: 100px;
	cursor: pointer;
	outline: none;
	white-space: nowrap;

	/* Glassmorphism base */
	background: rgba(10, 12, 24, 0.7);
	border: 1.5px solid rgba(255, 255, 255, 0.12);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);

	/* Typography */
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.4px;
	color: rgba(255, 255, 255, 0.65);

	/* Animate in */
	opacity: 0;
	transform: translateY(8px) scale(0.92);
	transition:
		opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
		transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
		background 0.2s ease,
		border-color 0.2s ease,
		color 0.2s ease,
		box-shadow 0.2s ease;
	transition-delay: var(--delay);
}

/* Entrance when parent is mounted */
.cs--visible .cs__pill {
	opacity: 1;
	transform: translateY(0) scale(1);
}

/* ── Hover ─────────────────────────────────────────────────── */
.cs__pill:hover {
	background: rgba(20, 24, 48, 0.85);
	border-color: color-mix(in srgb, var(--cc) 45%, transparent);
	color: rgba(255, 255, 255, 0.9);
	box-shadow:
		0 0 8px color-mix(in srgb, var(--cc) 25%, transparent),
		inset 0 0 12px color-mix(in srgb, var(--cc) 8%, transparent);
	transform: translateY(-1px) scale(1.04);
}

/* ── Active / Selected ─────────────────────────────────────── */
.cs__pill--active {
	background:
		linear-gradient(
			135deg,
			color-mix(in srgb, var(--cc) 22%, rgba(10,12,24,0.9)),
			color-mix(in srgb, var(--cc) 10%, rgba(10,12,24,0.9))
		);
	border-color: var(--cc);
	color: #fff;
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--cc) 30%, transparent),
		0 0 10px color-mix(in srgb, var(--cc) 40%, transparent),
		0 0 24px color-mix(in srgb, var(--cc) 20%, transparent),
		inset 0 0 18px color-mix(in srgb, var(--cc) 12%, transparent);
	text-shadow: 0 0 8px var(--cc), 0 0 3px #fff;
	transform: translateY(0) scale(1.06);
}

/* Active press effect */
.cs__pill--active:active {
	transform: scale(0.97);
}

.cs__pill:not(.cs__pill--active):active {
	transform: translateY(0) scale(0.96);
}

/* ── Special (LIVE) ────────────────────────────────────────── */
.cs__pill--special.cs__pill--active {
	background: linear-gradient(135deg, rgba(255,0,80,0.3), rgba(255,45,120,0.15));
	border-color: #ff2d78;
	box-shadow:
		0 0 0 1px rgba(255,45,120,0.4),
		0 0 12px rgba(255,45,120,0.5),
		0 0 28px rgba(255,45,120,0.25),
		inset 0 0 20px rgba(255,45,120,0.12);
	animation: live-pill-pulse 1.1s ease-in-out infinite;
}

/* ── Icon ──────────────────────────────────────────────────── */
.cs__pill-icon {
	font-size: 14px;
	line-height: 1;
	filter: drop-shadow(0 0 3px var(--cc));
	transition: filter 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cs__pill--active .cs__pill-icon,
.cs__pill:hover .cs__pill-icon {
	filter: drop-shadow(0 0 6px var(--cc)) drop-shadow(0 0 2px #fff8);
	transform: scale(1.15);
}

/* ── Label ─────────────────────────────────────────────────── */
.cs__pill-label {
	font-size: 11.5px;
}

/* ── Active glow ring ──────────────────────────────────────── */
.cs__pill-ring {
	position: absolute;
	inset: -3px;
	border-radius: 100px;
	border: 1px solid color-mix(in srgb, var(--cc) 35%, transparent);
	pointer-events: none;
	animation: ring-pulse 1.8s ease-in-out infinite;
}

/* ── Keyframes ─────────────────────────────────────────────── */
@keyframes live-pill-pulse {
	0%, 100% { box-shadow: 0 0 0 1px rgba(255,45,120,0.4), 0 0 12px rgba(255,45,120,0.5), 0 0 28px rgba(255,45,120,0.25), inset 0 0 20px rgba(255,45,120,0.12); }
	50%       { box-shadow: 0 0 0 1px rgba(255,45,120,0.6), 0 0 20px rgba(255,45,120,0.7), 0 0 40px rgba(255,45,120,0.4), inset 0 0 26px rgba(255,45,120,0.18); }
}

@keyframes ring-pulse {
	0%, 100% { opacity: 0.6; transform: scale(1); }
	50%       { opacity: 0; transform: scale(1.08); }
}

/* ── Reduced motion ────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
	.cs__pill {
		transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
	}
	.cs--visible .cs__pill { opacity: 1; transform: none; }
	.cs__pill--special.cs__pill--active,
	.cs__pill-ring { animation: none; }
}
</style>
