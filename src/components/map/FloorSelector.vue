<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  building: { type: Object, default: null },
  selectedFloor: { type: String, default: null },
  isDarkMode: { type: Boolean, default: true },
  isVisible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'select-floor']);

// Get floor color based on selection state
const getFloorColor = (floor) => {
  if (floor === props.selectedFloor) {
    return 'bg-blue-500 text-white shadow-lg scale-105';
  }
  return props.isDarkMode 
    ? 'bg-zinc-800 text-white/70 hover:bg-zinc-700' 
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200';
};

const selectFloor = (floor) => {
  emit('select-floor', floor);
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <transition name="floor-bar">
    <div 
      v-if="isVisible && building"
      :class="[
        'fixed top-0 left-0 right-0 z-[5000] shadow-xl',
        isDarkMode 
          ? 'bg-zinc-900/95 border-b border-white/10 backdrop-blur-xl' 
          : 'bg-white/95 border-b border-gray-200 backdrop-blur-xl'
      ]"
    >
      <!-- Top Bar with Building Name + Back Arrow -->
      <div class="flex items-center justify-between px-4 py-2.5">
        <div class="flex items-center gap-3">
          <button 
            @click="handleClose"
            :class="[
              'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
              isDarkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-gray-100 text-gray-700'
            ]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 :class="[
              'text-sm font-bold',
              isDarkMode ? 'text-white' : 'text-gray-900'
            ]">
              {{ building.shortName || building.name }}
            </h2>
            <span :class="[
              'text-xs',
              isDarkMode ? 'text-white/60' : 'text-gray-500'
            ]">
              {{ building.floorNames?.[selectedFloor] || '選擇 Floor' }}
            </span>
          </div>
        </div>
        
        <!-- Building Hours Badge -->
        <div :class="[
          'text-xs px-2.5 py-1 rounded-full font-medium',
          isDarkMode ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-green-100 text-green-700'
        ]">
          {{ building.openTime }} - {{ building.closeTime }}
        </div>
      </div>

      <!-- Floor Tabs -->
      <div class="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-hide">
        <button
          v-for="floor in building.floors"
          :key="floor"
          @click="selectFloor(floor)"
          :class="[
            'px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap',
            getFloorColor(floor)
          ]"
        >
          {{ floor }}
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.floor-bar-enter-active {
  animation: slide-down 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.floor-bar-leave-active {
  animation: slide-up-out 0.25s ease-in;
}

@keyframes slide-down {
  0% {
    opacity: 0;
    transform: translateY(-100%);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slide-up-out {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-50%);
  }
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
