<script setup>
/**
 * OnboardingTour.vue - First-time user tutorial
 * Feature #11: Onboarding Tour
 */
import { onMounted, ref } from "vue";

const props = defineProps({
	isDarkMode: {
		type: Boolean,
		default: true,
	},
});

const emit = defineEmits(["complete", "skip"]);

const STORAGE_KEY = "vibecity_onboarding_complete";
const currentStep = ref(0);
const isVisible = ref(false);

const steps = [
	{
		title: "Welcome to VibeCity! 🎉",
		description: "Discover the hottest nightlife spots in Chiang Mai",
		icon: "🗺️",
		target: null,
	},
	{
		title: "Live Venues 🔴",
		description: "Red pins show venues that are LIVE right now",
		icon: "📍",
		target: ".vibe-marker-live",
	},
	{
		title: "Collect Coins 🪙",
		description: "Visit venues to collect coins and unlock rewards",
		icon: "💰",
		target: ".coin-badge",
	},
	{
		title: "Call a Ride 🚗",
		description: "Tap any pin, then use Navigate or Call Ride",
		icon: "🚕",
		target: ".popup-ride-btn",
	},
	{
		title: "You're Ready! 🚀",
		description: "Start exploring the nightlife scene",
		icon: "✨",
		target: null,
	},
];

onMounted(() => {
	const completed = localStorage.getItem(STORAGE_KEY);
	if (!completed) {
		isVisible.value = true;
	}
});

const nextStep = () => {
	if (currentStep.value < steps.length - 1) {
		currentStep.value++;
	} else {
		complete();
	}
};

const prevStep = () => {
	if (currentStep.value > 0) {
		currentStep.value--;
	}
};

const complete = () => {
	localStorage.setItem(STORAGE_KEY, "true");
	isVisible.value = false;
	emit("complete");
};

const skip = () => {
	complete();
	emit("skip");
};

// Expose reset for testing
const reset = () => {
	localStorage.removeItem(STORAGE_KEY);
	currentStep.value = 0;
	isVisible.value = true;
};

defineExpose({ reset });
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isVisible"
        class="onboarding-overlay"
        @click.self="skip"
        tabindex="0"
        @keydown.enter.self="skip"
        @keydown.space.self="skip"
        @keydown.esc="skip"
        role="dialog"
        aria-modal="true"
        aria-label="Onboarding Tour"
      >
        <div
          :class="['onboarding-modal', isDarkMode ? 'bg-zinc-900' : 'bg-white']"
        >
          <!-- Progress dots -->
          <div class="flex justify-center gap-2 mb-6">
            <div
              v-for="(_, i) in steps"
              :key="i"
              :class="[
                'w-2 h-2 rounded-full transition duration-300',
                i === currentStep
                  ? 'w-6 bg-gradient-to-r from-purple-500 to-pink-500'
                  : i < currentStep
                    ? 'bg-purple-500'
                    : isDarkMode
                      ? 'bg-zinc-700'
                      : 'bg-gray-300',
              ]"
            />
          </div>

          <!-- Content -->
          <div class="text-center mb-8">
            <div class="text-6xl mb-4 animate-bounce">
              {{ steps[currentStep].icon }}
            </div>
            <h2
              :class="[
                'text-2xl font-black mb-2',
                isDarkMode ? 'text-white' : 'text-gray-900',
              ]"
            >
              {{ steps[currentStep].title }}
            </h2>
            <p
              :class="[
                'text-sm',
                isDarkMode ? 'text-white/60' : 'text-gray-600',
              ]"
            >
              {{ steps[currentStep].description }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              v-if="currentStep > 0"
              @click="prevStep"
              :class="[
                'flex-1 py-3 rounded-xl font-bold transition',
                isDarkMode
                  ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              ]"
            >
              Back
            </button>
            <button
              v-else
              @click="skip"
              :class="[
                'flex-1 py-3 rounded-xl font-bold transition',
                isDarkMode
                  ? 'bg-zinc-800 text-white/50 hover:bg-zinc-700'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
              ]"
            >
              Skip
            </button>

            <button
              @click="nextStep"
              class="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition active:scale-95"
            >
              {{ currentStep === steps.length - 1 ? "Let's Go!" : "Next" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
}

.onboarding-modal {
  width: 100%;
  max-width: 360px;
  padding: 32px 24px;
  border-radius: 24px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
