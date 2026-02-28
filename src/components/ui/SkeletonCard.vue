<script setup>
/**
 * SkeletonCard.vue - Premium shimmer loading placeholder
 * Feature #3: Skeleton Loading States
 */
defineProps({
	isDarkMode: {
		type: Boolean,
		default: true,
	},
	variant: {
		type: String,
		default: "card", // 'card' | 'carousel' | 'list'
	},
});
</script>

<template>
  <!-- Carousel Card Skeleton (Matches SwipeCard perfectly) -->
  <div
    v-if="variant === 'carousel'"
    :class="[
      'relative flex-shrink-0 rounded-[24px] overflow-hidden',
      isDarkMode
        ? 'bg-zinc-900 border border-white/10'
        : 'bg-gray-200 border border-black/10',
    ]"
  >
    <!-- Full background shimmer mimicking media layer -->
    <div
      :class="[
        'absolute inset-0 skeleton-shimmer',
        isDarkMode ? 'bg-zinc-800' : 'bg-gray-300',
      ]"
    />

    <!-- Gradient overlay mimicking sc-gradient -->
    <div
      class="absolute inset-0 z-10 pointer-events-none"
      style="
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.94) 0%,
          rgba(0, 0, 0, 0.35) 40%,
          transparent 80%
        );
      "
    />

    <!-- Content placeholder mimicking sc-info -->
    <div
      class="absolute bottom-0 left-0 right-0 p-4 pb-10 z-20 flex flex-col justify-end"
    >
      <!-- Title (sc-venue-name) -->
      <div
        :class="[
          'h-5 w-3/4 rounded skeleton-shimmer mb-2',
          isDarkMode ? 'bg-white/20' : 'bg-black/20',
        ]"
      />

      <!-- Meta Row -->
      <div class="flex items-center gap-2 mb-3">
        <!-- sc-chip -->
        <div
          :class="[
            'h-4 w-12 rounded skeleton-shimmer',
            isDarkMode ? 'bg-white/20' : 'bg-black/20',
          ]"
          style="animation-delay: 0.1s"
        />
        <!-- sc-meta-item -->
        <div
          :class="[
            'h-4 w-16 rounded skeleton-shimmer',
            isDarkMode ? 'bg-white/20' : 'bg-black/20',
          ]"
          style="animation-delay: 0.15s"
        />
      </div>

      <!-- Stats Badge -->
      <div class="flex items-center gap-2 mb-4">
        <div
          :class="[
            'h-[22px] w-12 rounded-full skeleton-shimmer',
            isDarkMode ? 'bg-white/20' : 'bg-black/20',
          ]"
          style="animation-delay: 0.2s"
        />
      </div>

      <!-- CTA (sc-cta) -->
      <div
        :class="[
          'h-[40px] w-full rounded-[14px] skeleton-shimmer',
          isDarkMode ? 'bg-white/20' : 'bg-black/20',
        ]"
        style="animation-delay: 0.3s"
      />
    </div>
  </div>

  <!-- Full Card Skeleton -->
  <div
    v-else-if="variant === 'card'"
    :class="[
      'rounded-2xl overflow-hidden',
      isDarkMode ? 'bg-zinc-800/50' : 'bg-gray-200',
    ]"
  >
    <!-- Image placeholder -->
    <div
      :class="[
        'h-40 w-full skeleton-shimmer',
        isDarkMode ? 'bg-zinc-700' : 'bg-gray-300',
      ]"
    />

    <!-- Content placeholder -->
    <div class="p-4 space-y-3">
      <div
        :class="[
          'h-5 w-4/5 rounded skeleton-shimmer',
          isDarkMode ? 'bg-zinc-700' : 'bg-gray-300',
        ]"
      />
      <div
        :class="[
          'h-4 w-2/3 rounded skeleton-shimmer',
          isDarkMode ? 'bg-zinc-700' : 'bg-gray-300',
        ]"
        style="animation-delay: 0.1s"
      />
      <div class="flex gap-2">
        <div
          :class="[
            'h-8 w-20 rounded-lg skeleton-shimmer',
            isDarkMode ? 'bg-zinc-700' : 'bg-gray-300',
          ]"
          style="animation-delay: 0.2s"
        />
        <div
          :class="[
            'h-8 w-20 rounded-lg skeleton-shimmer',
            isDarkMode ? 'bg-zinc-700' : 'bg-gray-300',
          ]"
          style="animation-delay: 0.3s"
        />
      </div>
    </div>
  </div>

  <!-- List Item Skeleton -->
  <div
    v-else
    :class="[
      'flex items-center gap-3 p-3 rounded-xl',
      isDarkMode ? 'bg-zinc-800/50' : 'bg-gray-200',
    ]"
  >
    <div
      :class="[
        'w-12 h-12 rounded-xl skeleton-shimmer',
        isDarkMode ? 'bg-zinc-700' : 'bg-gray-300',
      ]"
    />
    <div class="flex-1 space-y-2">
      <div
        :class="[
          'h-4 w-3/4 rounded skeleton-shimmer',
          isDarkMode ? 'bg-zinc-700' : 'bg-gray-300',
        ]"
      />
      <div
        :class="[
          'h-3 w-1/2 rounded skeleton-shimmer',
          isDarkMode ? 'bg-zinc-700' : 'bg-gray-300',
        ]"
        style="animation-delay: 0.1s"
      />
    </div>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.08) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer {
    animation: none;
  }
}
</style>
