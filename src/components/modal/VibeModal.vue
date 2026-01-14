<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { getMediaDetails } from '../../utils/linkHelper';
// --- REFACTOR: ใช้ browserUtils และ shopUtils ---
import { copyToClipboard, openGoogleMapsDir, openGrabApp, openBoltApp } from '../../utils/browserUtils';
import { getStatusColorClass } from '../../utils/shopUtils';

const props = defineProps({
  shop: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close']);

const media = computed(() => getMediaDetails(props.shop.videoUrl));

const processedImages = computed(() => {
  return (props.shop.images || []).map(imgUrl => getMediaDetails(imgUrl).url);
});

const zoomedImage = ref(null);
const showRidePopup = ref(false); 
const copyStatus = ref(''); 

// --- ระบบ Countdown โปรโมชั่น (ต้องเก็บไว้ในนี้เพราะมี State เวลาที่เปลี่ยนตลอด) ---
const timeLeft = ref('');
const isPromoActive = ref(false);
let timerInterval = null;

const updateCountdown = () => {
  if (!props.shop.promotionEndtime || !props.shop.promotionInfo) {
    isPromoActive.value = false;
    return;
  }

  const now = new Date();
  const [hours, minutes] = props.shop.promotionEndtime.split(':');
  
  const target = new Date();
  target.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  const diff = target - now;
  const maxFlashWindow = 1200000; // 20 นาที

  if (diff <= 0 || diff > maxFlashWindow) {
    isPromoActive.value = false;
    return;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  timeLeft.value = `${mins}:${secs.toString().padStart(2, '0')}`;
  isPromoActive.value = true;
};

onMounted(() => {
  updateCountdown();
  timerInterval = setInterval(updateCountdown, 1000);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

// --- REFACTOR: เรียกใช้ Utils Function ---
const handleCopy = (text) => {
  const success = copyToClipboard(text);
  if (success) {
    copyStatus.value = 'Copied!';
    setTimeout(() => copyStatus.value = '', 3000);
  } else {
    copyStatus.value = 'Manual search required';
  }
};

const openGoogleMaps = () => {
  openGoogleMapsDir(props.shop.lat, props.shop.lng);
};

const openGrab = () => {
  copyToClipboard(props.shop.name); // Copy ชื่ออัตโนมัติก่อนเปิดแอพ
  openGrabApp(props.shop);
  showRidePopup.value = false;
};

const openBolt = () => {
  copyToClipboard(props.shop.name);
  openBoltApp(props.shop);
  showRidePopup.value = false;
};

const handleZoom = (url) => {
  zoomedImage.value = url;
};
</script>

<template>
  <div class="fixed inset-0 z-[3000] flex items-center justify-center p-4 pointer-events-auto font-sans overflow-hidden">
    <div class="absolute inset-0 bg-black/85 backdrop-blur-sm" @click="emit('close')"></div>

    <div class="relative w-full max-w-[340px] sm:max-w-[520px] animate-pop">
      
      <button 
        @click="emit('close')" 
        class="absolute -top-12 right-0 w-9 h-9 sm:w-11 sm:h-11 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 rounded-full flex items-center justify-center text-white transition-all active:scale-90 shadow-2xl z-[3010]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div class="relative w-full bg-zinc-950/60 backdrop-blur-3xl rounded-none overflow-hidden border border-white/10 flex flex-col shadow-2xl max-h-[82vh] pointer-events-auto">
        
        <div class="px-5 py-4 sm:px-6 sm:py-5 border-b border-white/5">
          <div class="flex items-start justify-between gap-2 sm:gap-4">
            <div class="flex-1 text-left min-w-0">
              <h2 class="text-lg sm:text-2xl font-black text-white uppercase tracking-tighter leading-tight break-words">
                {{ shop.name }} 
              </h2>
            </div>

            <div class="flex flex-col items-end gap-1.5 shrink-0">
              <div class="flex flex-wrap justify-end gap-1.5">
                <transition name="fade">
                  <div v-if="isPromoActive" class="promo-status-badge text-[10px] sm:text-[18px] px-2 py-0.5 sm:px-2.5 sm:py-1">
                    FLASH SALE
                  </div>
                </transition>
                <!-- REFACTOR: ใช้ getStatusColorClass จาก Utils -->
                <div :class="['px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-[18px] font-black rounded-md uppercase tracking-wider text-white shadow-lg shrink-0', getStatusColorClass(shop.status)]">
                  {{ shop.status }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="relative w-full aspect-video bg-zinc-900 overflow-hidden flex-shrink-0">
          <transition name="fade">
            <div v-if="isPromoActive" class="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 z-[3100] bg-red-600 p-2 sm:p-3 shadow-[0_4px_20px_rgba(220,38,38,0.6)] animate-pulse-slow border-l-[3px] sm:border-l-4 border-white">
              <div class="flex flex-col items-start">
                <span class="text-[7px] sm:text-[8px] font-black text-white/80 uppercase tracking-[0.2em] leading-none mb-1">Limited Deal</span>
                <h3 class="text-base sm:text-lg font-black text-white tracking-tighter leading-none italic uppercase">{{ shop.promotionInfo }}</h3>
                <div class="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 bg-black/40 px-1.5 py-0.5 rounded-sm">
                  <span class="text-[9px] sm:text-[10px] font-mono font-bold text-red-100 tracking-[0.1em]">ENDS IN: {{ timeLeft }}</span>
                </div>
              </div>
            </div>
          </transition>

          <video v-if="media.type === 'video'" :src="media.url" autoplay loop muted playsinline class="w-full h-full object-cover"></video>
          <iframe v-else-if="media.type === 'youtube'" :src="media.url" class="w-full h-full scale-[1]" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
          <img v-else-if="media.type === 'image'" :src="media.url" class="w-full h-full object-cover" />
        </div>

        <div class="p-5 sm:p-6 flex flex-col gap-4 sm:gap-5 overflow-y-auto no-scrollbar">
          <div class="flex flex-row justify-between items-start gap-3">
            <div class="flex-1 space-y-3 sm:space-y-2 text-left min-w-0">
              <div class="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2">
                <span class="text-[10px] sm:text-[11px] text-white/30 font-bold uppercase tracking-[0.15em] shrink-0">Crowd:</span>
                <p class="text-[13px] sm:text-[17px] font-medium text-white/90 leading-snug break-words">
                  {{ shop.crowdInfo || '-' }}
                </p>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2">
                <span class="text-[10px] sm:text-[11px] text-white/30 font-bold uppercase tracking-[0.15em] shrink-0">Vibe:</span>
                <p class="text-[13px] sm:text-[17px] font-medium text-white/90 leading-snug break-words">
                  {{ shop.vibeTag || '-' }}
                </p>
              </div>
            </div>

            <div class="flex flex-row gap-2 shrink-0" v-if="processedImages.length > 0">
              <div v-for="(img, idx) in processedImages.slice(0, 2)" :key="idx" @click="handleZoom(img)" class="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl overflow-hidden border border-white/10 cursor-pointer active:scale-95 transition-all shadow-lg bg-zinc-900">
                <img :src="img" class="w-full h-full object-cover" loading="lazy" />
              </div>
            </div>
          </div>
        </div>

        <div class="p-5 sm:p-6 pt-0 grid grid-cols-2 gap-2 sm:gap-3 flex-shrink-0">
          <button @click="openGoogleMaps" class="h-12 sm:h-14 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-lg shadow-indigo-900/20">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span class="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest">Maps</span>
          </button>
          <button @click="showRidePopup = true" class="h-12 sm:h-14 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-lg shadow-green-900/20">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2m2 0h10" />
              <circle cx="7" cy="17" r="2" />
              <circle cx="17" cy="17" r="2" />
            </svg>
            <span class="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest">CALL A RIDE</span>
          </button>
        </div>

        <transition name="fade">
          <div v-if="showRidePopup" class="absolute inset-0 z-[5000] flex items-center justify-center p-5 sm:p-6 bg-black/60 backdrop-blur-xl">
            <div class="w-full max-w-[280px] sm:max-w-[320px] bg-zinc-900 border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-pop">
              <div class="flex justify-between items-center mb-5 sm:mb-6">
                <span class="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Select Service</span>
                <button @click="showRidePopup = false" class="text-white/30 hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div class="flex flex-row gap-2 sm:gap-3">
                <button @click="openBolt" class="flex-1 h-12 sm:h-14 bg-white hover:bg-zinc-200 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                  <img src="/images/logo/bolt.svg" class="h-4 sm:h-5 w-auto object-contain" alt="Bolt" />
                </button>
                <button @click="openGrab" class="flex-1 h-12 sm:h-14 bg-white hover:bg-zinc-200 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                  <img src="/images/logo/grab.svg" class="h-3.5 sm:h-4 w-auto object-contain" alt="Grab" />
                </button>
              </div>
              <div class="pt-4 text-center">
                <p class="text-[10px] sm:text-[9px] text-white/40 italic">* Location name will be automatically copied to your clipborad for bolt.</p>
                <p v-if="copyStatus" class="mt-2 text-[10px] font-black text-green-400 uppercase animate-pulse">{{ copyStatus }}</p>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <transition name="fade">
      <div v-if="zoomedImage" class="fixed inset-0 z-[6000] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md cursor-pointer" @click="zoomedImage = null">
        <img :src="zoomedImage" class="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl object-contain animate-zoom" />
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* คง Style เดิมไว้ตามที่ขอ */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

@keyframes pop { 
  from { opacity: 0; transform: scale(0.97) translateY(10px); } 
  to { opacity: 1; transform: scale(1) translateY(0); } 
}
.animate-pop { animation: pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

@keyframes zoom { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
.animate-zoom { animation: zoom 0.2s ease-out forwards; }

.promo-status-badge {
  @apply font-black rounded-md uppercase tracking-wider text-white shrink-0;
  background: linear-gradient(270deg, #ff4d4d, #f97316, #ff4d4d);
  background-size: 200% 200%;
  animation: wave-gradient 2s linear infinite;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

@keyframes wave-gradient {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}

.animate-pulse-slow {
  animation: pulse-slow 3s infinite;
}
@keyframes pulse-slow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.95; transform: scale(1.03); }
}
</style>