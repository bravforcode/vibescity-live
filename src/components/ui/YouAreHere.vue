<script setup>
defineProps({
	visible: { type: Boolean, default: true },
	label: { type: String, default: "YOU ARE HERE" },
});
</script>

<template>
  <div
    v-show="visible"
    class="you-are-here"
    role="img"
    :aria-label="label"
  >
    <div class="yah-outer-ring" aria-hidden="true" />
    <div class="yah-dot" aria-hidden="true">
      <div class="yah-dot-inner" />
    </div>
    <span class="yah-label">{{ label }}</span>
  </div>
</template>

<style scoped>
.you-are-here {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  z-index: 200;
  transform: translate(-50%, -50%);
}

.yah-outer-ring {
  position: absolute;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid #00bfff;
  opacity: 0.5;
  animation: yah-pulse 2s ease-in-out infinite;
}

.yah-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #00bfff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 8px #00bfff;
}

.yah-dot-inner {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
}

.yah-label {
  margin-top: 20px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: #00e5ff;
  text-shadow: 0 0 4px #00e5ff;
  font-family: monospace;
  white-space: nowrap;
}

@keyframes yah-pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50%       { transform: scale(1.6); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .yah-outer-ring {
    animation: none;
  }
}
</style>
