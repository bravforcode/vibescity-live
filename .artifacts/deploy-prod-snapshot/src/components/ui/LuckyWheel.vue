<script setup>
/**
 * LuckyWheel.vue — Premium Spin-to-Win (anonymous, no auth)
 */

import { computed, onMounted, onUnmounted, ref } from "vue";
import { gamificationService } from "@/services/gamificationService";

defineProps({ isDarkMode: { type: Boolean, default: true } });
const emit = defineEmits(["spin-complete", "close"]);

const isVisible = ref(false);
const isSpinning = ref(false);
const isLoadingStatus = ref(false);
const statusMessage = ref("");
const canSpinToday = ref(true);
const rotation = ref(0);
const selectedPrize = ref(null);
const spinHistory = ref([]);
const prefersReducedMotion = ref(false);
let motionMediaQuery = null;
const handleMotionChange = (e) => {
	prefersReducedMotion.value = e.matches;
};

const prizes = [
	{
		id: 1,
		code: "coins_10",
		label: "10 Coins",
		value: 10,
		color: "#7C3AED",
		glow: "#A78BFA",
		icon: "🪙",
	},
	{
		id: 2,
		code: "coins_20",
		label: "20 Coins",
		value: 20,
		color: "#BE185D",
		glow: "#F472B6",
		icon: "🪙",
	},
	{
		id: 3,
		code: "coins_50",
		label: "50 Coins",
		value: 50,
		color: "#065F46",
		glow: "#34D399",
		icon: "💰",
	},
	{
		id: 4,
		code: "try_again",
		label: "Try Again",
		value: 0,
		color: "#374151",
		glow: "#9CA3AF",
		icon: "🔄",
	},
	{
		id: 5,
		code: "coins_5",
		label: "5 Coins",
		value: 5,
		color: "#92400E",
		glow: "#FCD34D",
		icon: "🪙",
	},
	{
		id: 6,
		code: "coins_100",
		label: "100 Coins",
		value: 100,
		color: "#991B1B",
		glow: "#FCA5A5",
		icon: "🎁",
	},
	{
		id: 7,
		code: "coins_15",
		label: "15 Coins",
		value: 15,
		color: "#1E3A8A",
		glow: "#93C5FD",
		icon: "🪙",
	},
	{
		id: 8,
		code: "vip_badge",
		label: "VIP Badge",
		value: "badge",
		color: "#581C87",
		glow: "#C084FC",
		icon: "⭐",
	},
];

const segmentAngle = computed(() => 360 / prizes.length);

// ─── SVG Wheel Geometry ───────────────────────────────────────────────────────
const WR = 148,
	CR = 44,
	CX = 160,
	CY = 160;
const toRad = (d) => (d * Math.PI) / 180;

const segPaths = computed(() =>
	prizes.map((_, i) => {
		const s = toRad(-90 + i * 45);
		const e = toRad(-90 + (i + 1) * 45);
		const x1 = (CX + WR * Math.cos(s)).toFixed(2);
		const y1 = (CY + WR * Math.sin(s)).toFixed(2);
		const x2 = (CX + WR * Math.cos(e)).toFixed(2);
		const y2 = (CY + WR * Math.sin(e)).toFixed(2);
		return `M${CX},${CY} L${x1},${y1} A${WR},${WR} 0 0,1 ${x2},${y2} Z`;
	}),
);

const labelPos = computed(() =>
	prizes.map((_, i) => {
		const mid = toRad(-90 + (i + 0.5) * 45);
		const r = 98;
		return {
			x: (CX + r * Math.cos(mid)).toFixed(2),
			y: (CY + r * Math.sin(mid)).toFixed(2),
			rot: (-90 + (i + 0.5) * 45 + 90).toFixed(0),
		};
	}),
);

// ─── Star particles (precomputed) ────────────────────────────────────────────
const stars = Array.from({ length: 28 }, () => ({
	x: Math.floor(Math.random() * 100),
	y: Math.floor(Math.random() * 100),
	sz: (Math.random() * 2 + 1).toFixed(1),
	dl: (Math.random() * 4).toFixed(1),
	dr: (Math.random() * 2 + 2).toFixed(1),
}));

// ─── Logic ───────────────────────────────────────────────────────────────────
const normalizePrize = (raw) => {
	const code = raw?.code || raw?.prize_code;
	return (
		prizes.find((p) => p.code === code) ?? {
			id: 999,
			code: code || "unknown",
			label: raw?.label || raw?.prize_label || "Reward",
			value: Number(raw?.reward_coins || 0),
			color: "#8B5CF6",
			glow: "#C084FC",
			icon: raw?.metadata?.icon || "🎁",
		}
	);
};

const loadSpinStatus = async () => {
	isLoadingStatus.value = true;
	statusMessage.value = "";
	try {
		const status = await gamificationService.getLuckyWheelStatus();
		canSpinToday.value = Boolean(status.can_spin_today);
		if (status.today_spin)
			selectedPrize.value = normalizePrize(status.today_spin);
	} catch (err) {
		canSpinToday.value = false;
		statusMessage.value = err?.message || "Could not load spin status.";
	} finally {
		isLoadingStatus.value = false;
	}
};

const spin = async () => {
	if (isSpinning.value || !canSpinToday.value || isLoadingStatus.value) return;
	isSpinning.value = true;
	statusMessage.value = "";
	selectedPrize.value = null;
	try {
		const result = await gamificationService.spinLuckyWheel();
		// RPC may return { prize: {...} } or flat { prize_code, reward_coins }
		const rawPrize = result?.prize || result;
		const prize = normalizePrize(rawPrize);
		const prizeIndex = Math.max(
			prizes.findIndex((p) => p.code === prize.code),
			0,
		);
		rotation.value +=
			360 * 5 + prizeIndex * segmentAngle.value + segmentAngle.value / 2;
		const delay = prefersReducedMotion.value ? 160 : 3800;
		setTimeout(() => {
			isSpinning.value = false;
			canSpinToday.value = false;
			selectedPrize.value = prize;
			spinHistory.value = [prize, ...spinHistory.value].slice(0, 3);
			emit("spin-complete", prize);
		}, delay);
	} catch (err) {
		isSpinning.value = false;
		statusMessage.value = err?.message || "Spin failed. Try again.";
	}
};

const show = async () => {
	isVisible.value = true;
	await loadSpinStatus();
};
const hide = () => {
	isVisible.value = false;
	rotation.value = 0;
	selectedPrize.value = null;
	statusMessage.value = "";
	emit("close");
};

defineExpose({ show, hide });

onMounted(() => {
	if (typeof window === "undefined" || !window.matchMedia) return;
	motionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	prefersReducedMotion.value = motionMediaQuery.matches;
	motionMediaQuery.addEventListener?.("change", handleMotionChange);
});
onUnmounted(() =>
	motionMediaQuery?.removeEventListener?.("change", handleMotionChange),
);
</script>

<template>
  <Teleport to="body">
    <Transition name="lw-fade">
      <div
        v-if="isVisible"
        class="lw-overlay"
        @click.self="hide"
        @keydown.esc="hide"
        tabindex="-1"
        role="presentation"
      >
        <!-- Star field -->
        <div class="lw-stars" aria-hidden="true">
          <span
            v-for="(s, i) in stars"
            :key="i"
            class="lw-star"
            :style="`left:${s.x}%;top:${s.y}%;width:${s.sz}px;height:${s.sz}px;animation-delay:${s.dl}s;animation-duration:${s.dr}s`"
          />
        </div>

        <div
          class="lw-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lw-title"
        >
          <!-- Close -->
          <button
            type="button"
            class="lw-close-btn"
            aria-label="Close lucky wheel"
            @click="hide"
          >
            ✕
          </button>

          <!-- Header -->
          <div class="lw-header">
            <div class="lw-badge">DAILY SPIN</div>
            <h2 id="lw-title" class="lw-title">Lucky Wheel</h2>
            <p class="lw-sub">Spin once per day · No sign-in needed</p>
          </div>

          <!-- Wheel -->
          <div class="lw-wheel-wrap">
            <!-- Outer glow rings -->
            <div class="lw-ring lw-ring-a" aria-hidden="true" />
            <div class="lw-ring lw-ring-b" aria-hidden="true" />

            <!-- Gold pointer arrow -->
            <div class="lw-pointer" aria-hidden="true">
              <svg width="22" height="30" viewBox="0 0 22 30" fill="none">
                <defs>
                  <filter id="ptr-glow">
                    <feGaussianBlur stdDeviation="2.5" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <polygon
                  points="11,2 21,28 11,21 1,28"
                  fill="#FFD700"
                  filter="url(#ptr-glow)"
                />
                <polygon
                  points="11,2 21,28 11,21 1,28"
                  fill="none"
                  stroke="rgba(255,255,255,0.6)"
                  stroke-width="1"
                />
              </svg>
            </div>

            <!-- SVG Wheel -->
            <div
              class="lw-wheel"
              :style="{
                transform: `rotate(${rotation}deg)`,
                transition: isSpinning
                  ? prefersReducedMotion
                    ? 'transform 120ms linear'
                    : 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
                  : 'none',
              }"
            >
              <svg
                viewBox="0 0 320 320"
                width="100%"
                height="100%"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <filter id="seg-drop">
                    <feDropShadow
                      dx="0"
                      dy="0"
                      stdDeviation="4"
                      flood-color="rgba(0,0,0,0.6)"
                    />
                  </filter>
                  <filter id="center-glow">
                    <feGaussianBlur stdDeviation="5" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <radialGradient id="cg" cx="50%" cy="35%" r="65%">
                    <stop offset="0%" stop-color="#FFD700" />
                    <stop offset="60%" stop-color="#C084FC" />
                    <stop offset="100%" stop-color="#581C87" />
                  </radialGradient>
                </defs>

                <!-- Segments -->
                <g v-for="(prize, i) in prizes" :key="prize.id">
                  <defs>
                    <radialGradient :id="`sg${i}`" cx="30%" cy="30%" r="80%">
                      <stop
                        offset="0%"
                        :stop-color="prize.color"
                        stop-opacity="1"
                      />
                      <stop
                        offset="100%"
                        :stop-color="prize.color"
                        stop-opacity="0.7"
                      />
                    </radialGradient>
                  </defs>
                  <path
                    :d="segPaths[i]"
                    :fill="`url(#sg${i})`"
                    stroke="rgba(255,255,255,0.18)"
                    stroke-width="1.5"
                  />
                  <!-- Icon label -->
                  <text
                    :x="labelPos[i].x"
                    :y="labelPos[i].y"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    :transform="`rotate(${labelPos[i].rot},${labelPos[i].x},${labelPos[i].y})`"
                    font-size="18"
                    style="filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8))"
                  >
                    {{ prize.icon }}
                  </text>
                  <!-- Value label -->
                  <text
                    :x="labelPos[i].x"
                    :y="Number(labelPos[i].y) + 18"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    :transform="`rotate(${labelPos[i].rot},${labelPos[i].x},${Number(labelPos[i].y) + 18})`"
                    font-size="9"
                    font-weight="900"
                    fill="rgba(255,255,255,0.9)"
                    letter-spacing="0.5"
                  >
                    {{ prize.label.toUpperCase() }}
                  </text>
                </g>

                <!-- Outer rim -->
                <circle
                  cx="160"
                  cy="160"
                  r="149"
                  fill="none"
                  stroke="rgba(255,255,255,0.15)"
                  stroke-width="2"
                />

                <!-- Center button -->
                <circle cx="160" cy="160" :r="CR + 6" fill="rgba(0,0,0,0.4)" />
                <circle
                  cx="160"
                  cy="160"
                  :r="CR"
                  fill="url(#cg)"
                  filter="url(#center-glow)"
                  :class="{
                    'lw-center-pulse':
                      !isSpinning && canSpinToday && !selectedPrize,
                  }"
                />
                <text
                  x="160"
                  y="157"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size="11"
                  font-weight="900"
                  fill="white"
                  letter-spacing="1"
                >
                  {{
                    isSpinning
                      ? "🎲"
                      : isLoadingStatus
                        ? "…"
                        : canSpinToday
                          ? "SPIN"
                          : "✓"
                  }}
                </text>
              </svg>
            </div>
          </div>

          <!-- Spin CTA button -->
          <button
            type="button"
            class="lw-spin-btn"
            :class="{
              'lw-spin-btn--glow':
                !isSpinning && canSpinToday && !selectedPrize,
            }"
            :disabled="isSpinning || !canSpinToday || isLoadingStatus"
            @click="spin"
          >
            <span v-if="isSpinning">Spinning…</span>
            <span v-else-if="isLoadingStatus">Loading…</span>
            <span v-else-if="!canSpinToday && selectedPrize"
              >🎉 Come back tomorrow!</span
            >
            <span v-else-if="!canSpinToday">Daily limit reached</span>
            <span v-else>🎰 SPIN NOW</span>
          </button>

          <!-- Prize reveal -->
          <Transition name="lw-prize-reveal">
            <div
              v-if="selectedPrize && !isSpinning"
              class="lw-prize-card"
              :style="`--prize-color: ${selectedPrize.color}; --prize-glow: ${selectedPrize.glow}`"
              aria-live="polite"
            >
              <div class="lw-prize-icon">{{ selectedPrize.icon }}</div>
              <div class="lw-prize-won">YOU WON</div>
              <div class="lw-prize-value">{{ selectedPrize.label }}</div>
              <div
                v-if="Number(selectedPrize.value) > 0"
                class="lw-prize-coins"
              >
                +{{ selectedPrize.value }} <span>🪙</span>
              </div>
            </div>
          </Transition>

          <!-- Spin history chips -->
          <div
            v-if="spinHistory.length"
            class="lw-history"
            aria-label="Recent spins"
          >
            <span
              v-for="(p, idx) in spinHistory"
              :key="idx"
              class="lw-history-chip"
              :style="`border-color:${p.glow}50;color:${p.glow}`"
              >{{ p.icon }} {{ p.label }}</span
            >
          </div>

          <!-- Error -->
          <div v-if="statusMessage" class="lw-error" aria-live="polite">
            {{ statusMessage }}
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Overlay ── */
.lw-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: radial-gradient(
    ellipse at 50% 0%,
    rgba(88, 28, 135, 0.6) 0%,
    rgba(0, 0, 10, 0.97) 70%
  );
  backdrop-filter: blur(6px);
  overflow: hidden;
}

/* ── Star particles ── */
.lw-stars {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.lw-star {
  position: absolute;
  border-radius: 50%;
  background: white;
  animation: lw-twinkle 3s ease-in-out infinite;
  opacity: 0.6;
}
@keyframes lw-twinkle {
  0%,
  100% {
    opacity: 0.1;
    transform: scale(0.8);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.2);
  }
}

/* ── Modal card ── */
.lw-modal {
  position: relative;
  width: 100%;
  max-width: 360px;
  padding: 24px 20px 20px;
  border-radius: 28px;
  background: linear-gradient(160deg, #12002a 0%, #0a0015 50%, #120018 100%);
  border: 1px solid rgba(168, 85, 247, 0.3);
  box-shadow:
    0 0 0 1px rgba(139, 92, 246, 0.15),
    0 40px 80px rgba(0, 0, 0, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
}

/* ── Close ── */
.lw-close-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}
.lw-close-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

/* ── Header ── */
.lw-header {
  text-align: center;
}
.lw-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 99px;
  background: linear-gradient(90deg, #7c3aed, #ec4899);
  color: white;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 2px;
  margin-bottom: 6px;
}
.lw-title {
  font-size: 24px;
  font-weight: 900;
  background: linear-gradient(135deg, #ffd700, #c084fc, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 4px;
  line-height: 1.1;
}
.lw-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

/* ── Wheel container ── */
.lw-wheel-wrap {
  position: relative;
  width: 300px;
  height: 300px;
  flex-shrink: 0;
}

/* Glow rings */
.lw-ring {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 2px solid transparent;
  pointer-events: none;
}
.lw-ring-a {
  border-color: rgba(139, 92, 246, 0.25);
  box-shadow:
    0 0 24px rgba(139, 92, 246, 0.2),
    inset 0 0 24px rgba(139, 92, 246, 0.1);
  animation: lw-ring-pulse 3s ease-in-out infinite;
}
.lw-ring-b {
  inset: -16px;
  border-color: rgba(236, 72, 153, 0.12);
  animation: lw-ring-pulse 3s ease-in-out infinite 1.5s;
}
@keyframes lw-ring-pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

/* Gold pointer */
.lw-pointer {
  position: absolute;
  top: -2px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  filter: drop-shadow(0 0 6px #ffd700);
}

/* Wheel */
.lw-wheel {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  box-shadow:
    0 0 40px rgba(139, 92, 246, 0.4),
    0 0 80px rgba(139, 92, 246, 0.15),
    inset 0 0 20px rgba(0, 0, 0, 0.3);
}

/* Center circle pulse */
.lw-center-pulse {
  animation: lw-center-throb 1.8s ease-in-out infinite;
}
@keyframes lw-center-throb {
  0%,
  100% {
    opacity: 0.85;
  }
  50% {
    opacity: 1;
    filter: url(#center-glow) brightness(1.3);
  }
}

/* ── Spin button ── */
.lw-spin-btn {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
  color: white;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 1px;
  border: none;
  cursor: pointer;
  transition:
    opacity 0.2s,
    transform 0.15s,
    box-shadow 0.2s;
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.35);
}
.lw-spin-btn:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}
.lw-spin-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.lw-spin-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.lw-spin-btn--glow {
  box-shadow:
    0 4px 24px rgba(139, 92, 246, 0.5),
    0 0 40px rgba(236, 72, 153, 0.3);
  animation: lw-btn-glow 2s ease-in-out infinite;
}
@keyframes lw-btn-glow {
  0%,
  100% {
    box-shadow:
      0 4px 24px rgba(139, 92, 246, 0.5),
      0 0 40px rgba(236, 72, 153, 0.3);
  }
  50% {
    box-shadow:
      0 6px 32px rgba(139, 92, 246, 0.8),
      0 0 60px rgba(236, 72, 153, 0.5);
  }
}

/* ── Prize card ── */
.lw-prize-card {
  width: 100%;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    rgba(var(--prize-color-rgb, 139, 92, 246), 0.15),
    rgba(0, 0, 0, 0.2)
  );
  border: 1px solid var(--prize-glow, #a78bfa);
  box-shadow: 0 0 24px
    color-mix(in srgb, var(--prize-glow, #a78bfa) 30%, transparent);
  text-align: center;
}
.lw-prize-icon {
  font-size: 36px;
  line-height: 1;
  margin-bottom: 6px;
}
.lw-prize-won {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 2px;
}
.lw-prize-value {
  font-size: 20px;
  font-weight: 900;
  color: white;
  margin-bottom: 4px;
}
.lw-prize-coins {
  font-size: 22px;
  font-weight: 900;
  background: linear-gradient(90deg, #ffd700, #ffa500);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── History ── */
.lw-history {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
}
.lw-history-chip {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 99px;
  border: 1px solid;
  background: rgba(255, 255, 255, 0.05);
}

/* ── Error ── */
.lw-error {
  width: 100%;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  font-size: 12px;
  text-align: center;
}

/* ── Transitions ── */
.lw-fade-enter-active,
.lw-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.lw-fade-enter-from,
.lw-fade-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

.lw-prize-reveal-enter-active {
  animation: lw-prize-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
@keyframes lw-prize-pop {
  0% {
    opacity: 0;
    transform: scale(0.6) translateY(10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lw-star,
  .lw-ring-a,
  .lw-ring-b,
  .lw-spin-btn--glow {
    animation: none !important;
  }
  .lw-fade-enter-active,
  .lw-fade-leave-active,
  .lw-prize-reveal-enter-active {
    transition: none !important;
    animation: none !important;
  }
}
</style>
