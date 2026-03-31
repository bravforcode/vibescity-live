<!-- src/components/ui/ClaimFeedback.vue -->
<!-- Confetti + coin toast overlay shown after a successful vibe claim (GAME-03) -->
<script setup>
import confetti from "canvas-confetti";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({
	visible: {
		type: Boolean,
		default: false,
	},
	coinsAwarded: {
		type: Number,
		default: 10,
	},
	venueName: {
		type: String,
		default: "",
	},
});

const emit = defineEmits(["close"]);

const dismissTimer = ref(null);

const fireConfetti = () => {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	confetti({
		particleCount: 150,
		spread: 80,
		origin: { y: 0.6 },
		colors: ["#00c853", "#69f0ae", "#b9f6ca", "#ffffff", "#ffd600"],
	});
};

const triggerHaptic = () => {
	if (navigator.vibrate) navigator.vibrate([20, 10, 40]);
};

const dismiss = () => {
	if (dismissTimer.value) {
		clearTimeout(dismissTimer.value);
		dismissTimer.value = null;
	}
	emit("close");
};

watch(
	() => props.visible,
	(isVisible) => {
		if (isVisible) {
			fireConfetti();
			triggerHaptic();
			// Auto-dismiss after 3 seconds if user doesn't tap
			dismissTimer.value = setTimeout(() => {
				dismiss();
			}, 3000);
		} else {
			if (dismissTimer.value) {
				clearTimeout(dismissTimer.value);
				dismissTimer.value = null;
			}
		}
	},
);

onUnmounted(() => {
	if (dismissTimer.value) {
		clearTimeout(dismissTimer.value);
		dismissTimer.value = null;
	}
});
</script>

<template>
  <Transition name="claim-feedback-fade">
    <div
      v-if="visible"
      class="claim-feedback-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="t('claim.coins_awarded', { count: coinsAwarded })"
      @click.self="dismiss"
    >
      <div class="claim-feedback-card">
        <!-- Coin amount -->
        <div class="claim-feedback-coins">
          {{ t('claim.coins_awarded', { count: coinsAwarded }) }}
        </div>

        <!-- Venue name -->
        <div v-if="venueName" class="claim-feedback-venue">
          {{ venueName }}
        </div>

        <!-- Dismiss button -->
        <button
          class="claim-feedback-btn"
          type="button"
          @click="dismiss"
        >
          {{ t('claim.nice') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.claim-feedback-overlay {
  position: fixed;
  inset: 0;
  z-index: 960;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.claim-feedback-card {
  background: rgba(10, 10, 20, 0.95);
  border: 1px solid rgba(0, 200, 83, 0.35);
  border-radius: 20px;
  padding: 32px 28px 24px;
  text-align: center;
  max-width: 320px;
  width: 90vw;
  box-shadow:
    0 0 0 1px rgba(0, 200, 83, 0.12),
    0 8px 40px rgba(0, 0, 0, 0.6);
}

.claim-feedback-coins {
  font-size: 2.25rem;
  font-weight: 800;
  color: #00c853;
  letter-spacing: -0.5px;
  text-shadow: 0 0 20px rgba(0, 200, 83, 0.5);
  margin-bottom: 8px;
}

.claim-feedback-venue {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.claim-feedback-btn {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 0 16px;
  background: #00c853;
  color: #000;
  font-weight: 700;
  font-size: 1rem;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.claim-feedback-btn:hover {
  background: #00e676;
}

.claim-feedback-btn:active {
  transform: scale(0.97);
}

/* Fade transition */
.claim-feedback-fade-enter-active,
.claim-feedback-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.claim-feedback-fade-enter-from,
.claim-feedback-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

@media (prefers-reduced-motion: reduce) {
  .claim-feedback-fade-enter-active,
  .claim-feedback-fade-leave-active {
    transition: none;
  }
}
</style>
