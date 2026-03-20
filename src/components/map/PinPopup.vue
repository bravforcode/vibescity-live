<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({
	shop: { type: Object, default: null },
	x: { type: Number, default: 0 },
	y: { type: Number, default: 0 },
});

const emit = defineEmits(["open-detail", "close"]);

const statusLabel = computed(() => {
	const s = String(props.shop?.status || "").toUpperCase();
	if (s === "LIVE") return "LIVE";
	if (s === "OPEN" || s === "ACTIVE") return "OPEN";
	if (s === "TONIGHT") return "TONIGHT";
	return "CLOSED";
});

const statusClass = computed(() => {
	const s = statusLabel.value;
	if (s === "LIVE") return "bg-red-500";
	if (s === "OPEN") return "bg-emerald-500";
	if (s === "TONIGHT") return "bg-amber-500";
	return "bg-zinc-600";
});

const category = computed(() => {
	return (
		props.shop?.category ||
		props.shop?.primary_category ||
		props.shop?.type ||
		""
	);
});
</script>

<template>
  <Transition name="popup-fade">
    <div role="button" tabindex="0"
      v-if="shop"
      class="pin-popup"
      :style="{
        left: `${x}px`,
        top: `${y}px`,
      }"
      @click.stop="emit('open-detail', shop)"
    >
      <!-- Arrow -->
      <div class="pin-popup__arrow" />

      <!-- Card -->
      <div class="pin-popup__card">
        <div class="pin-popup__header">
          <span :class="['pin-popup__status', statusClass]">
            {{ statusLabel }}
          </span>
          <button
            class="pin-popup__close"
            @click.stop="emit('close')"
            :aria-label="t('auto.k_close', 'Close')"
          >
            ×
          </button>
        </div>

        <h4 class="pin-popup__name">
          {{ shop?.name || "Unknown" }}
        </h4>

        <p v-if="category" class="pin-popup__category">
          {{ category }}
        </p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pin-popup {
  position: absolute;
  z-index: 1500;
  transform: translate(-50%, -100%);
  pointer-events: auto;
  cursor: pointer;
  filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.5));
  margin-top: -12px;
}

.pin-popup__arrow {
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid rgba(24, 24, 27, 0.95);
  margin: 0 auto;
}

.pin-popup__card {
  background: rgba(24, 24, 27, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(103, 232, 249, 0.25);
  border-radius: 12px;
  padding: 8px 12px;
  min-width: 120px;
  max-width: 200px;
}

.pin-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
}

.pin-popup__status {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}

.pin-popup__close {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}

.pin-popup__close:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.pin-popup__name {
  font-size: 13px;
  font-weight: 700;
  color: white;
  margin: 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pin-popup__category {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  margin: 2px 0 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Transition */
.popup-fade-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.popup-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.popup-fade-enter-from {
  opacity: 0;
  transform: translate(-50%, -90%) scale(0.9);
}
.popup-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -100%) scale(0.95);
}
</style>
