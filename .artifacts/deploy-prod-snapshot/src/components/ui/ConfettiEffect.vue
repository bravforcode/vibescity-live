<script setup>
/**
 * ConfettiEffect.vue - Celebration confetti animation
 * Feature #8: Confetti Animation for Coins
 */
import { onMounted, onUnmounted, ref } from "vue";

const props = defineProps({
	active: {
		type: Boolean,
		default: false,
	},
	particleCount: {
		type: Number,
		default: 30,
	},
	duration: {
		type: Number,
		default: 2000,
	},
});

const emit = defineEmits(["complete"]);

const particles = ref([]);
const colors = [
	"#FFD700",
	"#FF6B6B",
	"#4ECDC4",
	"#A06CD5",
	"#FF9F43",
	"#2ECC71",
];

const generateParticles = () => {
	particles.value = Array.from({ length: props.particleCount }, (_, i) => ({
		id: i,
		x: 50 + (Math.random() - 0.5) * 20,
		color: colors[Math.floor(Math.random() * colors.length)],
		delay: Math.random() * 0.3,
		angle: Math.random() * 360,
		speed: 0.5 + Math.random() * 1,
		size: 4 + Math.random() * 6,
		type: Math.random() > 0.5 ? "circle" : "rect",
	}));

	setTimeout(() => {
		particles.value = [];
		emit("complete");
	}, props.duration);
};

// Watch for active prop
import { watch } from "vue";

watch(
	() => props.active,
	(isActive) => {
		if (isActive) {
			generateParticles();
		}
	},
);
</script>

<template>
  <div class="confetti-container" v-if="particles.length > 0">
    <div
      v-for="p in particles"
      :key="p.id"
      class="confetti-particle"
      :style="{
        '--x': `${p.x}%`,
        '--color': p.color,
        '--delay': `${p.delay}s`,
        '--angle': `${p.angle}deg`,
        '--speed': `${p.speed}s`,
        '--size': `${p.size}px`,
        'border-radius': p.type === 'circle' ? '50%' : '2px',
      }"
    />
  </div>
</template>

<style scoped>
.confetti-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}

.confetti-particle {
  position: absolute;
  left: var(--x);
  top: 50%;
  width: var(--size);
  height: var(--size);
  background: var(--color);
  animation: confetti-fall var(--speed) ease-out forwards;
  animation-delay: var(--delay);
  opacity: 0;
  transform-origin: center;
}

@keyframes confetti-fall {
  0% {
    opacity: 1;
    transform: translateY(0) rotate(0deg) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(300px) rotate(var(--angle)) scale(0.5)
      translateX(calc((var(--x) - 50%) * 3));
  }
}
</style>
