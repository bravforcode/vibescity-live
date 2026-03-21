<script setup>
defineProps({
  shop:          { type: Object,  default: null },
  visible:       { type: Boolean, default: false },
  claimLabel:    { type: String,  default: 'CLAIM YOUR VIBE ✦✦' },
  navigateLabel: { type: String,  default: 'TAKE ME THERE 🚗' },
});

const emit = defineEmits(['claim', 'navigate', 'close']);
</script>

<template>
  <Transition name="vibe-sheet">
    <div
      v-if="visible && shop"
      class="vibe-action-sheet-wrap"
      role="dialog"
      :aria-label="shop.name"
      @click.self="emit('close')"
    >
      <div class="vibe-action-sheet">
        <button
          type="button"
          class="vibe-sheet-close"
          aria-label="Close"
          @click="emit('close')"
        >&#x2715;</button>

        <p class="vibe-sheet-name">{{ shop.name }}</p>

        <div class="vibe-sheet-actions">
          <button
            type="button"
            class="vibe-sheet-btn vibe-sheet-claim"
            @click="emit('claim')"
          >{{ claimLabel }}</button>

          <button
            type="button"
            class="vibe-sheet-btn vibe-sheet-nav"
            @click="emit('navigate')"
          >{{ navigateLabel }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.vibe-action-sheet-wrap {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.4);
}

.vibe-action-sheet {
  width: 100%;
  background: rgba(10, 10, 20, 0.95);
  border-top: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 16px 16px 0 0;
  padding: 20px 16px 80px;
  position: relative;
  backdrop-filter: blur(12px);
}

.vibe-sheet-close {
  position: absolute;
  top: 12px;
  right: 16px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
}

.vibe-sheet-name {
  font-size: 15px;
  font-weight: 900;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 16px;
  text-align: center;
}

.vibe-sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vibe-sheet-btn {
  min-height: 52px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
  width: 100%;
}

.vibe-sheet-btn:active {
  opacity: 0.8;
  transform: scale(0.98);
}

.vibe-sheet-claim {
  background: #00c853;
  color: #000;
}

.vibe-sheet-nav {
  background: #ffd600;
  color: #000;
}

.vibe-sheet-enter-active,
.vibe-sheet-leave-active {
  transition: transform 0.3s ease;
}

.vibe-sheet-enter-from,
.vibe-sheet-leave-to {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .vibe-sheet-enter-active,
  .vibe-sheet-leave-active {
    transition: none;
  }
}
</style>
