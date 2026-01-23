<script setup>
/**
 * TiltCard.vue - 3D Tilt effect wrapper component
 * Feature #6: 3D Tilt Effect on Cards
 */
import { ref } from "vue";

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
  maxTilt: {
    type: Number,
    default: 10,
  },
  scale: {
    type: Number,
    default: 1.02,
  },
  perspective: {
    type: Number,
    default: 1000,
  },
});

const tiltStyle = ref({});
const isHovering = ref(false);

const handleMouseMove = (e) => {
  if (props.disabled) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  const rotateX = ((y - centerY) / centerY) * -props.maxTilt;
  const rotateY = ((x - centerX) / centerX) * props.maxTilt;

  tiltStyle.value = {
    transform: `perspective(${props.perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${props.scale})`,
    transition: "transform 0.1s ease-out",
  };
};

const handleMouseLeave = () => {
  isHovering.value = false;
  tiltStyle.value = {
    transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)",
    transition: "transform 0.4s ease-out",
  };
};

const handleMouseEnter = () => {
  isHovering.value = true;
};

// Touch support
const handleTouchMove = (e) => {
  if (props.disabled || !e.touches[0]) return;

  const touch = e.touches[0];
  const rect = e.currentTarget.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  const rotateX = ((y - centerY) / centerY) * -props.maxTilt * 0.5;
  const rotateY = ((x - centerX) / centerX) * props.maxTilt * 0.5;

  tiltStyle.value = {
    transform: `perspective(${props.perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${props.scale})`,
    transition: "transform 0.05s ease-out",
  };
};

const handleTouchEnd = () => {
  handleMouseLeave();
};
</script>

<template>
  <div
    class="tilt-card-wrapper"
    :style="tiltStyle"
    @mousemove="handleMouseMove"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @touchmove.passive="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <slot :isHovering="isHovering" />

    <!-- Subtle shine effect on hover -->
    <div v-if="isHovering && !disabled" class="tilt-shine" />
  </div>
</template>

<style scoped>
.tilt-card-wrapper {
  position: relative;
  will-change: transform;
  transform-style: preserve-3d;
}

.tilt-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.1) 0%,
    transparent 50%,
    rgba(255, 255, 255, 0.05) 100%
  );
  pointer-events: none;
  border-radius: inherit;
}
</style>
