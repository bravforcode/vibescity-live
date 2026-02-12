<script setup>
/**
 * LuckyWheel.vue - Spin to win rewards
 * Feature #33: Lucky Spin Wheel (server-authoritative persistence)
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
	AUTH_REQUIRED_MESSAGE,
	gamificationService,
} from "@/services/gamificationService";

defineProps({
	isDarkMode: {
		type: Boolean,
		default: true,
	},
});

const emit = defineEmits(["spin-complete", "close"]);

const isVisible = ref(false);
const isSpinning = ref(false);
const isLoadingStatus = ref(false);
const statusMessage = ref("");
const canSpinToday = ref(true);
const rotation = ref(0);
const selectedPrize = ref(null);
const prefersReducedMotion = ref(false);
let motionMediaQuery = null;
const handleMotionChange = (event) => {
	prefersReducedMotion.value = event.matches;
};

const prizes = [
	{
		id: 1,
		code: "coins_10",
		label: "10 Coins",
		value: 10,
		color: "#8B5CF6",
		icon: "🪙",
	},
	{
		id: 2,
		code: "coins_20",
		label: "20 Coins",
		value: 20,
		color: "#EC4899",
		icon: "🪙",
	},
	{
		id: 3,
		code: "coins_50",
		label: "50 Coins",
		value: 50,
		color: "#10B981",
		icon: "💰",
	},
	{
		id: 4,
		code: "try_again",
		label: "Try Again",
		value: 0,
		color: "#6B7280",
		icon: "🔄",
	},
	{
		id: 5,
		code: "coins_5",
		label: "5 Coins",
		value: 5,
		color: "#F59E0B",
		icon: "🪙",
	},
	{
		id: 6,
		code: "coins_100",
		label: "100 Coins",
		value: 100,
		color: "#EF4444",
		icon: "🎁",
	},
	{
		id: 7,
		code: "coins_15",
		label: "15 Coins",
		value: 15,
		color: "#3B82F6",
		icon: "🪙",
	},
	{
		id: 8,
		code: "vip_badge",
		label: "VIP Badge",
		value: "badge",
		color: "#8B5CF6",
		icon: "⭐",
	},
];

const segmentAngle = computed(() => 360 / prizes.length);
const isAuthRequired = computed(
	() => statusMessage.value === AUTH_REQUIRED_MESSAGE,
);

const normalizePrize = (rawPrize) => {
	const code = rawPrize?.code || rawPrize?.prize_code;
	const matched = prizes.find((p) => p.code === code);
	if (matched) return matched;

	return {
		id: 999,
		code: code || "unknown",
		label: rawPrize?.label || rawPrize?.prize_label || "Reward",
		value: Number(rawPrize?.reward_coins || 0),
		color: "#8B5CF6",
		icon: rawPrize?.metadata?.icon || "🎁",
	};
};

const loadSpinStatus = async () => {
	isLoadingStatus.value = true;
	statusMessage.value = "";

	try {
		const status = await gamificationService.getLuckyWheelStatus();
		canSpinToday.value = Boolean(status.can_spin_today);
		if (status.today_spin) {
			selectedPrize.value = normalizePrize(status.today_spin);
		}
	} catch (error) {
		canSpinToday.value = false;
		statusMessage.value =
			error?.message || "Failed to load lucky wheel status.";
	} finally {
		isLoadingStatus.value = false;
	}
};

const spin = async () => {
	if (
		isSpinning.value ||
		!canSpinToday.value ||
		isLoadingStatus.value ||
		isAuthRequired.value
	)
		return;

	isSpinning.value = true;
	statusMessage.value = "";
	selectedPrize.value = null;

	try {
		const result = await gamificationService.spinLuckyWheel();
		const prize = normalizePrize(result.prize);
		const prizeIndex = Math.max(
			prizes.findIndex((item) => item.code === prize.code),
			0,
		);

		const targetRotation =
			rotation.value +
			360 * 5 +
			prizeIndex * segmentAngle.value +
			segmentAngle.value / 2;

		rotation.value = targetRotation;

		const revealDelay = prefersReducedMotion.value ? 160 : 3600;
		setTimeout(() => {
			isSpinning.value = false;
			canSpinToday.value = false;
			selectedPrize.value = prize;
			emit("spin-complete", prize);
		}, revealDelay);
	} catch (error) {
		isSpinning.value = false;
		statusMessage.value = error?.message || "Failed to spin lucky wheel.";
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

onUnmounted(() => {
	motionMediaQuery?.removeEventListener?.("change", handleMotionChange);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="scale-up">
      <div v-if="isVisible" class="wheel-overlay" @click.self="hide">
        <div
          :class="['wheel-modal', isDarkMode ? 'bg-zinc-900' : 'bg-white']"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lucky-wheel-title"
        >
          <button
            type="button"
            aria-label="Close lucky wheel modal"
            class="absolute right-4 top-4 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            @click="hide"
          >
            ✕
          </button>

          <!-- Header -->
          <div class="text-center mb-4">
            <h2
              id="lucky-wheel-title"
              :class="[
                'text-2xl font-black',
                isDarkMode ? 'text-white' : 'text-gray-900',
              ]"
            >
              🎰 Lucky Spin
            </h2>
          </div>

          <!-- Wheel -->
          <div class="wheel-container">
            <!-- Pointer -->
            <div class="wheel-pointer">▼</div>

            <!-- Wheel -->
            <div
              class="wheel"
              :style="{
                transform: `rotate(${rotation}deg)`,
                transition: isSpinning
                  ? prefersReducedMotion
                    ? 'transform 120ms linear'
                    : 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
                  : 'none',
              }"
            >
              <div
                v-for="(prize, i) in prizes"
                :key="prize.id"
                class="wheel-segment"
                :style="{
                  '--color': prize.color,
                  '--rotation': `${i * segmentAngle}deg`,
                  '--skew': `${90 - segmentAngle}deg`,
                }"
              >
                <span
                  class="segment-label"
                  :style="{ transform: `rotate(${segmentAngle / 2}deg)` }"
                >
                  {{ prize.icon }}
                </span>
              </div>
            </div>

            <!-- Center button -->
            <button
              @click="spin"
              :disabled="isSpinning || !canSpinToday || isLoadingStatus || isAuthRequired"
              class="wheel-center"
              :class="{ 'animate-pulse': !isSpinning && canSpinToday && !selectedPrize }"
            >
              {{
                isSpinning
                  ? "🎲"
                  : isLoadingStatus
                    ? "…"
                    : isAuthRequired
                      ? "LOCK"
                      : canSpinToday
                        ? "SPIN"
                        : "DONE"
              }}
            </button>
          </div>

          <!-- Result -->
          <Transition name="bounce">
            <div
              v-if="selectedPrize && !isSpinning"
              class="mt-4 p-4 rounded-2xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-center"
              aria-live="polite"
            >
              <div class="text-4xl mb-2">{{ selectedPrize.icon }}</div>
              <div
                :class="[
                  'text-lg font-black',
                  isDarkMode ? 'text-white' : 'text-gray-900',
                ]"
              >
                {{ selectedPrize.label }}!
              </div>
            </div>
          </Transition>

          <div
            v-if="statusMessage"
            class="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300"
            aria-live="polite"
          >
            {{ statusMessage }}
          </div>

          <!-- Close button -->
          <button
            @click="hide"
            :class="[
              'mt-4 w-full rounded-xl py-3 font-bold transition-[background-color,color,box-shadow,transform]',
              isDarkMode
                ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
          >
            Close
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.wheel-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
}

.wheel-modal {
  position: relative;
  width: 100%;
  max-width: 320px;
  padding: 24px;
  border-radius: 24px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.wheel-container {
  position: relative;
  width: 250px;
  height: 250px;
  margin: 0 auto;
}

.wheel {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 30px rgba(139, 92, 246, 0.5);
}

.wheel-segment {
  position: absolute;
  width: 50%;
  height: 50%;
  left: 50%;
  top: 0;
  transform-origin: 0% 100%;
  transform: rotate(var(--rotation)) skewY(var(--skew));
  background: var(--color);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.segment-label {
  position: absolute;
  left: -20px;
  top: 30px;
  font-size: 20px;
  transform-origin: center;
}

.wheel-pointer {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 24px;
  color: #ffd700;
  z-index: 10;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}

.wheel-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: white;
  font-weight: 900;
  font-size: 14px;
  border: 4px solid white;
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.5);
  cursor: pointer;
  z-index: 5;
}

.wheel-center:disabled {
  cursor: not-allowed;
}

.scale-up-enter-active,
.scale-up-leave-active {
  transition-property: opacity, transform;
  transition-duration: 0.3s;
  transition-timing-function: ease;
}

.scale-up-enter-from,
.scale-up-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.bounce-enter-active {
  animation: bounce 0.5s;
}

@keyframes bounce {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scale-up-enter-active,
  .scale-up-leave-active,
  .bounce-enter-active,
  .wheel-center {
    animation: none !important;
    transition: none !important;
  }

  .scale-up-enter-from,
  .scale-up-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
