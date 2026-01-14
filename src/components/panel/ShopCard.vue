<script setup>
import { computed } from 'vue';
import { getStatusColorClass, isFlashActive } from '../../utils/shopUtils';

const props = defineProps({
  shop: {
    type: Object,
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isDarkMode: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['click', 'open-detail', 'hover']);

// Open Google Maps for directions
const openGoogleMaps = (e) => {
  e.stopPropagation();
  const url = `https://www.google.com/maps/dir/?api=1&destination=${props.shop.lat},${props.shop.lng}`;
  window.open(url, '_blank');
};

// Status display
const statusLabel = computed(() => {
  return props.shop.status || 'OFF';
});

// Status glow class for LIVE shops only
const statusGlowClass = computed(() => {
  const s = props.shop.status?.toUpperCase();
  if (s === 'LIVE') return 'shadow-[0_0_15px_rgba(239,68,68,0.3)] border-red-500/40';
  if (s === 'TONIGHT') return 'border-orange-500/30';
  return props.isDarkMode ? 'border-white/10' : 'border-gray-200';
});

// Handle mouse enter for hover sync
const handleMouseEnter = () => {
  emit('hover', props.shop);
};
</script>

<template>
  <div 
    :class="[
      'shop-card group relative border rounded-lg overflow-hidden cursor-pointer transition-all duration-200',
      isActive ? 'ring-2 ring-red-500/50' : '',
      isDarkMode ? 'bg-zinc-900/80 hover:bg-zinc-800/90' : 'bg-white hover:bg-gray-50',
      statusGlowClass
    ]"
    @click="emit('click', shop)"
    @mouseenter="handleMouseEnter"
  >
    <!-- Main Content -->
    <div class="p-3">
      <!-- Header Row -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <h3 :class="[
            'text-sm font-semibold truncate transition-colors',
            isDarkMode ? 'text-white group-hover:text-red-400' : 'text-gray-900 group-hover:text-red-600'
          ]">
            {{ shop.name }}
          </h3>
          <p :class="['text-[10px] mt-0.5', isDarkMode ? 'text-white/50' : 'text-gray-500']">
            {{ shop.category }}
          </p>
        </div>
        
        <!-- Status Badge -->
        <div class="flex flex-col items-end gap-1 shrink-0">
          <!-- Flash Sale Badge -->
          <div 
            v-if="isFlashActive(shop)" 
            class="flash-badge px-1.5 py-0.5 text-[8px] font-semibold text-white rounded"
          >
            🔥 FLASH
          </div>
          <!-- Golden Badge -->
          <div 
            v-else-if="shop.isGolden" 
            class="golden-badge px-1.5 py-0.5 text-[8px] font-semibold text-yellow-950 rounded"
          >
            ✨ HOT
          </div>
          <!-- Status -->
          <div 
            :class="[
              'px-1.5 py-0.5 text-[8px] font-semibold rounded text-white',
              getStatusColorClass(statusLabel)
            ]"
          >
            {{ statusLabel }}
          </div>
        </div>
      </div>

      <!-- Vibe Info -->
      <p v-if="shop.vibeTag" :class="['text-[11px] line-clamp-1 mt-1.5', isDarkMode ? 'text-white/60' : 'text-gray-600']">
        {{ shop.vibeTag }}
      </p>

      <!-- Time Row -->
      <div class="flex items-center gap-1 mt-2">
        <svg xmlns="http://www.w3.org/2000/svg" :class="['w-3 h-3', isDarkMode ? 'text-white/30' : 'text-gray-400']" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span :class="['text-[10px]', isDarkMode ? 'text-white/50' : 'text-gray-500']">
          {{ shop.openTime || '--' }} - {{ shop.closeTime || '--' }}
        </span>
      </div>
    </div>

    <!-- Bottom Action Bar -->
    <div :class="['flex border-t', isDarkMode ? 'border-white/5 bg-zinc-950/50' : 'border-gray-100 bg-gray-50']">
      <button 
        @click.stop="emit('open-detail', shop)"
        :class="[
          'flex-1 py-2 flex items-center justify-center gap-1 text-[10px] font-medium transition-all',
          isDarkMode ? 'text-white/60 hover:bg-white/5 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        ]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        ดูรายละเอียด
      </button>
      <div :class="['w-px', isDarkMode ? 'bg-white/5' : 'bg-gray-200']"></div>
      <button 
        @click.stop="openGoogleMaps"
        class="flex-1 py-2 flex items-center justify-center gap-1 text-[10px] font-medium text-green-600 hover:bg-green-500/10 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        นำทาง
      </button>
    </div>
  </div>
</template>

<style scoped>
.flash-badge {
  background: linear-gradient(270deg, #ff4d4d, #f97316, #ff4d4d);
  background-size: 200% 200%;
  animation: wave-gradient 2s linear infinite;
}

.golden-badge {
  background: linear-gradient(135deg, #fcd34d 0%, #fbbf24 100%);
}

@keyframes wave-gradient {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
