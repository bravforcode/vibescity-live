<script setup>
/**
 * LuckyWheel.vue - Spin to win rewards
 * Feature #33: Lucky Spin Wheel
 */
import { computed, ref } from "vue";

const props = defineProps({
	isDarkMode: {
		type: Boolean,
		default: true,
	},
});

const emit = defineEmits(["spin-complete", "close"]);

const isVisible = ref(false);
const isSpinning = ref(false);
const rotation = ref(0);
const selectedPrize = ref(null);

const prizes = [
	{ id: 1, label: "10 Coins", value: 10, color: "#8B5CF6", icon: "🪙" },
	{ id: 2, label: "20 Coins", value: 20, color: "#EC4899", icon: "🪙" },
	{ id: 3, label: "50 Coins", value: 50, color: "#10B981", icon: "💰" },
	{ id: 4, label: "Try Again", value: 0, color: "#6B7280", icon: "🔄" },
	{ id: 5, label: "5 Coins", value: 5, color: "#F59E0B", icon: "🪙" },
	{ id: 6, label: "100 Coins", value: 100, color: "#EF4444", icon: "🎁" },
	{ id: 7, label: "15 Coins", value: 15, color: "#3B82F6", icon: "🪙" },
	{ id: 8, label: "VIP Badge", value: "badge", color: "#8B5CF6", icon: "⭐" },
];

const segmentAngle = computed(() => 360 / prizes.length);

const spin = () => {
	if (isSpinning.value) return;

	isSpinning.value = true;
	selectedPrize.value = null;

	// Random prize selection (weighted)
	const randomIndex = Math.floor(Math.random() * prizes.length);
	const targetRotation =
		360 * 5 + randomIndex * segmentAngle.value + segmentAngle.value / 2;

	rotation.value = targetRotation;

	setTimeout(() => {
		isSpinning.value = false;
		selectedPrize.value = prizes[randomIndex];
		emit("spin-complete", selectedPrize.value);
	}, 4000);
};

const show = () => {
	isVisible.value = true;
};
const hide = () => {
	isVisible.value = false;
	rotation.value = 0;
	selectedPrize.value = null;
	emit("close");
};

defineExpose({ show, hide });
</script>

<template>
  <Teleport to="body">
    <Transition name="scale-up">
      <div v-if="isVisible" class="wheel-overlay" @click.self="hide">
        <div :class="['wheel-modal', isDarkMode ? 'bg-zinc-900' : 'bg-white']">
          <!-- Header -->
          <div class="text-center mb-4">
            <h2
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
                  ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
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
              :disabled="isSpinning"
              class="wheel-center"
              :class="{ 'animate-pulse': !isSpinning && !selectedPrize }"
            >
              {{ isSpinning ? "🎲" : "SPIN" }}
            </button>
          </div>

          <!-- Result -->
          <Transition name="bounce">
            <div
              v-if="selectedPrize && !isSpinning"
              class="mt-4 p-4 rounded-2xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-center"
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

          <!-- Close button -->
          <button
            @click="hide"
            :class="[
              'mt-4 w-full py-3 rounded-xl font-bold transition-all',
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
  transition: all 0.3s ease;
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
</style>
