<script setup>
defineProps({
  text:    { type: String,  default: 'VIBE OF THE HOUR' },
  visible: { type: Boolean, default: true },
});
</script>

<template>
  <div
    v-show="visible"
    class="vibe-banner"
    role="marquee"
    aria-live="off"
    aria-atomic="false"
  >
    <div class="vibe-banner-track" aria-hidden="true">
      <span class="vibe-banner-item">{{ text }} &nbsp;✦&nbsp; </span>
      <span class="vibe-banner-item">{{ text }} &nbsp;✦&nbsp; </span>
    </div>
  </div>
</template>

<style scoped>
.vibe-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 500;
  overflow: hidden;
  height: 28px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  border-bottom: 1px solid rgba(0, 229, 255, 0.2);
  display: flex;
  align-items: center;
}

.vibe-banner-track {
  display: flex;
  white-space: nowrap;
  animation: vibe-marquee 18s linear infinite;
  will-change: transform;
}

.vibe-banner-item {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: #00e5ff;
  text-shadow: 0 0 6px #00e5ff;
  text-transform: uppercase;
  padding-right: 40px;
}

@keyframes vibe-marquee {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@media (prefers-reduced-motion: reduce) {
  .vibe-banner-track {
    animation: none;
  }
}
</style>
