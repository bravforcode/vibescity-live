<template>
  <div
    class="fixed inset-0 z-[9999] bg-dark flex flex-col items-center justify-center transition-opacity duration-700"
    :class="{ 'opacity-0 pointer-events-none': !isLoading }"
    data-testid="splash-screen"
  >
    <!-- Logo Area -->
    <div class="flex items-center gap-3 mb-12 animate-fade-in-up">
      <div
        class="w-12 h-12 rounded-full bg-vibe-pink flex items-center justify-center shadow-glow"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-6 h-6 text-white"
        >
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      </div>
      <h1 class="text-3xl font-black text-white tracking-tight">Live City</h1>
    </div>

    <!-- Spinner -->
    <div class="relative w-10 h-10">
      <div class="absolute inset-0 border-4 border-white/10 rounded-full"></div>
      <div
        class="absolute inset-0 border-4 border-vibe-pink rounded-full border-t-transparent animate-spin"
      ></div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  isLoading: {
    type: Boolean,
    required: true,
  },
});
</script>

<style scoped>
.shadow-glow {
  box-shadow: 0 0 20px rgba(219, 39, 119, 0.5);
}

.animate-fade-in-up {
  animation: fadeInUp 0.8s ease-out forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
