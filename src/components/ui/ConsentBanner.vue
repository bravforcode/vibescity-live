<!-- src/components/ui/ConsentBanner.vue -->
<!-- PDPA/GDPR consent banner — shown once on first visit, before any session data is written -->
<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// Self-hiding: only show if consent has not been granted yet
const showBanner = ref(!localStorage.getItem("pdpa_consent_ts"));

const emit = defineEmits(["accepted"]);

const handleAccept = () => {
	// 1. Persist consent timestamp
	localStorage.setItem("pdpa_consent_ts", new Date().toISOString());

	// 2. Signal analytics gate in main.js (line 74 listener)
	window.dispatchEvent(
		new CustomEvent("vibecity:consent", {
			detail: { analytics: "granted" },
		}),
	);

	// 3. Hide banner + notify parent
	showBanner.value = false;
	emit("accepted");
};
</script>

<template>
  <Transition name="consent-slide">
    <div
      v-if="showBanner"
      class="consent-banner"
      role="dialog"
      aria-modal="true"
      aria-label="Privacy Consent"
    >
      <div class="consent-inner">
        <p class="consent-message">{{ t("consent.message") }}</p>

        <div class="consent-actions">
          <button
            type="button"
            class="consent-accept"
            @click="handleAccept"
          >
            {{ t("consent.accept") }}
          </button>

          <a
            href="/privacy"
            class="consent-learn-more"
          >
            {{ t("consent.learn_more") }}
          </a>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.consent-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 950;
  background: rgba(10, 10, 20, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.consent-inner {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 640px;
  margin: 0 auto;
}

.consent-message {
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

.consent-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.consent-accept {
  flex: 1;
  min-height: 44px;
  background: #00c853;
  color: #000;
  font-size: 14px;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  letter-spacing: 0.02em;
}

.consent-accept:active {
  opacity: 0.85;
}

.consent-learn-more {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  text-decoration: underline;
  white-space: nowrap;
}

.consent-learn-more:hover {
  color: rgba(255, 255, 255, 0.8);
}

/* Slide-up transition */
.consent-slide-enter-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.consent-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.consent-slide-enter-from,
.consent-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* Disable animation for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  .consent-slide-enter-active,
  .consent-slide-leave-active {
    transition: none;
  }
  .consent-slide-enter-from,
  .consent-slide-leave-to {
    transform: none;
    opacity: 1;
  }
}
</style>
