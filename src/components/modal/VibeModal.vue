<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { getMediaDetails } from "../../utils/linkHelper";
// --- REFACTOR: ใช้ browserUtils และ shopUtils ---
import {
  copyToClipboard,
  openGoogleMapsDir,
  openGrabApp,
  openBoltApp,
  openLinemanApp,
  shareLocation,
  isMobileDevice,
} from "../../utils/browserUtils";
import { getStatusColorClass } from "../../utils/shopUtils";

const props = defineProps({
  shop: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["close"]);

const media = computed(() => getMediaDetails(props.shop.videoUrl));

const processedImages = computed(() => {
  return (props.shop.images || []).map((imgUrl) => getMediaDetails(imgUrl).url);
});

const zoomedImage = ref(null);
const showRidePopup = ref(false);
const copyStatus = ref("");
const rideLoading = ref("");
const isMobile = ref(false);

// --- ระบบ Countdown โปรโมชั่น (ต้องเก็บไว้ในนี้เพราะมี State เวลาที่เปลี่ยนตลอด) ---
const timeLeft = ref("");
const isPromoActive = ref(false);
let timerInterval = null;

const updateCountdown = () => {
  if (!props.shop.promotionEndtime || !props.shop.promotionInfo) {
    isPromoActive.value = false;
    return;
  }

  const now = new Date();
  const [hours, minutes] = props.shop.promotionEndtime.split(":");

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

  timeLeft.value = `${mins}:${secs.toString().padStart(2, "0")}`;
  isPromoActive.value = true;
};

onMounted(() => {
  isMobile.value = isMobileDevice();
  updateCountdown();
  timerInterval = setInterval(updateCountdown, 1000);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

// --- REFACTOR: เรียกใช้ Utils Function ---
const handleCopy = async (text) => {
  const success = await copyToClipboard(text);
  if (success) {
    copyStatus.value = "Copied!";
    setTimeout(() => (copyStatus.value = ""), 3000);
  } else {
    copyStatus.value = "Manual search required";
  }
};

const openGoogleMaps = () => {
  openGoogleMapsDir(props.shop.lat, props.shop.lng);
};

// เปิดแอพ Grab พร้อม feedback
const openGrab = () => {
  rideLoading.value = "grab";

  // Fire-and-forget copy (don't await) to prevent blocking deep link
  copyToClipboard(props.shop.name).then(() => {
    copyStatus.value = "Copied!";
  });

  // Call immediately to satisfy browser security (Synchronous-like intent)
  const success = openGrabApp(props.shop);

  if (success) {
    copyStatus.value = "กำลังเปิด Grab...";
  } else {
    copyStatus.value = "ไม่พบ Grab";
  }

  // ปิด popup หลังจาก 1.5 วินาที
  setTimeout(() => {
    showRidePopup.value = false;
    rideLoading.value = "";
    setTimeout(() => (copyStatus.value = ""), 1000);
  }, 1500);
};

// เปิดแอพ Bolt พร้อม feedback
const openBolt = () => {
  rideLoading.value = "bolt";

  copyToClipboard(props.shop.name).then(() => {
    copyStatus.value = "Copied!";
  });

  const success = openBoltApp(props.shop);

  if (success) {
    copyStatus.value = "กำลังเปิด Bolt...";
  } else {
    copyStatus.value = "ไม่พบ Bolt";
  }

  setTimeout(() => {
    showRidePopup.value = false;
    rideLoading.value = "";
    setTimeout(() => (copyStatus.value = ""), 1000);
  }, 1500);
};

// เปิดแอพ Lineman
const openLineman = () => {
  rideLoading.value = "lineman";

  copyToClipboard(props.shop.name).then(() => {
    copyStatus.value = "Copied!";
  });

  const success = openLinemanApp(props.shop);

  if (success) {
    copyStatus.value = "กำลังเปิด Lineman...";
  } else {
    copyStatus.value = "ตไม่พบ Lineman";
  }

  setTimeout(() => {
    showRidePopup.value = false;
    rideLoading.value = "";
    setTimeout(() => (copyStatus.value = ""), 1000);
  }, 1500);
};
</script>

<template>
  <div
    class="fixed inset-0 z-[3000] flex items-center justify-center p-4 pointer-events-auto font-sans overflow-hidden"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/90 backdrop-blur-sm"
      @click="emit('close')"
    ></div>

    <!-- Main Modal -->
    <div class="relative w-full max-w-[340px] sm:max-w-[520px] animate-pop">
      <button
        @click="emit('close')"
        class="absolute -top-12 right-0 w-10 h-10 sm:w-11 sm:h-11 bg-white/15 hover:bg-white/25 backdrop-blur-xl border border-white/30 rounded-full flex items-center justify-center text-white transition-all active:scale-90 shadow-2xl z-[3010]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-5 h-5 sm:w-6 sm:h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div
        :class="[
          'relative w-full bg-zinc-950/70 backdrop-blur-2xl rounded-xl overflow-hidden border flex flex-col shadow-2xl max-h-[85vh] pointer-events-auto transition-all duration-300',
          shop.status === 'LIVE'
            ? 'border-cyan-400/50 shadow-[0_0_40px_rgba(34,211,238,0.3)]'
            : 'border-white/15',
        ]"
      >
        <!-- Header -->
        <div class="px-5 py-4 sm:px-6 sm:py-5 border-b border-white/10">
          <div class="flex items-start justify-between gap-2 sm:gap-4">
            <div class="flex-1 text-left min-w-0">
              <h2
                class="text-lg sm:text-2xl font-black text-white uppercase tracking-tighter leading-tight break-words"
              >
                {{ shop.name }}
              </h2>
            </div>

            <div class="flex flex-col items-end gap-1.5 shrink-0">
              <div class="flex flex-wrap justify-end gap-1.5">
                <transition name="fade">
                  <div
                    v-if="isPromoActive"
                    class="promo-status-badge text-[10px] sm:text-[12px] px-2 py-1 sm:px-2.5 sm:py-1"
                  >
                    FLASH SALE
                  </div>
                </transition>
                <div
                  :class="[
                    'px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-[12px] font-black rounded-md uppercase tracking-wider text-white shadow-lg shrink-0',
                    getStatusColorClass(shop.status),
                  ]"
                >
                  {{ shop.status }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Media Section -->
        <div
          class="relative w-full aspect-video bg-zinc-900 overflow-hidden flex-shrink-0"
        >
          <transition name="fade">
            <div
              v-if="isPromoActive"
              class="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 z-[3100] bg-gradient-to-r from-red-600 to-orange-600 p-3 sm:p-3 shadow-[0_4px_20px_rgba(220,38,38,0.6)] animate-pulse-slow border-l-[4px] border-white"
            >
              <div class="flex flex-col items-start">
                <span
                  class="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-[0.2em] leading-none mb-1"
                  >Limited Deal</span
                >
                <h3
                  class="text-base sm:text-lg font-black text-white tracking-tighter leading-none italic uppercase"
                >
                  {{ shop.promotionInfo }}
                </h3>
                <div
                  class="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 bg-black/40 px-2 py-1 rounded-sm"
                >
                  <span
                    class="text-[10px] sm:text-[11px] font-mono font-bold text-red-100 tracking-[0.1em]"
                    >ENDS IN: {{ timeLeft }}</span
                  >
                </div>
              </div>
            </div>
          </transition>

          <video
            v-if="media.type === 'video'"
            :src="media.url"
            autoplay
            loop
            muted
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <iframe
            v-else-if="media.type === 'youtube'"
            :src="media.url"
            class="w-full h-full scale-[1]"
            frameborder="0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
          ></iframe>
          <img
            v-else-if="media.type === 'image'"
            :src="media.url"
            class="w-full h-full object-cover"
          />
        </div>

        <!-- Content -->
        <div
          class="p-5 sm:p-6 flex flex-col gap-4 sm:gap-5 overflow-y-auto no-scrollbar"
        >
          <div class="flex flex-row justify-between items-start gap-3">
            <div class="flex-1 space-y-3 sm:space-y-2 text-left min-w-0">
              <div
                class="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2"
              >
                <span
                  class="text-[10px] sm:text-[11px] text-white/30 font-bold uppercase tracking-[0.15em] shrink-0"
                  >Crowd:</span
                >
                <p
                  class="text-[13px] sm:text-[15px] font-medium text-white/90 leading-snug break-words"
                >
                  {{ shop.crowdInfo || "-" }}
                </p>
              </div>
              <div
                class="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2"
              >
                <span
                  class="text-[10px] sm:text-[11px] text-white/30 font-bold uppercase tracking-[0.15em] shrink-0"
                  >Vibe:</span
                >
                <p
                  class="text-[13px] sm:text-[15px] font-medium text-white/90 leading-snug break-words"
                >
                  {{ shop.vibeTag || "-" }}
                </p>
              </div>
            </div>

            <div
              class="flex flex-row gap-2 shrink-0"
              v-if="processedImages.length > 0"
            >
              <div
                v-for="(img, idx) in processedImages.slice(0, 2)"
                :key="idx"
                @click="handleZoom(img)"
                class="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl overflow-hidden border border-white/10 cursor-pointer active:scale-95 transition-all shadow-lg bg-zinc-900"
              >
                <img
                  :src="img"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons - เปลี่ยนจาก 2 ปุ่มเป็น 3 ปุ่ม -->
        <div
          class="p-5 sm:p-6 pt-0 grid grid-cols-3 gap-2 sm:gap-3 flex-shrink-0"
        >
          <!-- แชร์ -->
          <button
            @click="handleShare"
            class="h-12 sm:h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-900/20 group relative overflow-hidden"
          >
            <div
              class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
            ></div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            <span
              class="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest relative z-10"
            >
              แชร์
            </span>
          </button>

          <!-- Google Maps -->
          <button
            @click="openGoogleMaps"
            class="h-12 sm:h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-lg shadow-indigo-900/20 group relative overflow-hidden"
          >
            <div
              class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
            ></div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span
              class="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest relative z-10"
            >
              นำทาง
            </span>
          </button>

          <!-- เรียกรถ -->
          <button
            @click="showRidePopup = true"
            class="h-12 sm:h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-lg shadow-green-900/20 group relative overflow-hidden"
          >
            <div
              class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
            ></div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2m2 0h10"
              />
              <circle cx="7" cy="17" r="2" />
              <circle cx="17" cy="17" r="2" />
            </svg>
            <span
              class="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest relative z-10"
            >
              เรียกรถ
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- ✅ Ride Popup -->
    <transition name="fade">
      <div
        v-if="showRidePopup"
        class="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
        @click.self="showRidePopup = false"
      >
        <div
          class="w-full max-w-[320px] bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl animate-pop relative"
        >
          <!-- Close Button -->
          <button
            @click="showRidePopup = false"
            class="absolute top-4 right-4 text-white/50 hover:text-white transition-all bg-white/5 hover:bg-white/10 rounded-full p-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <div class="mb-6 text-center">
            <div
              class="w-14 h-14 mx-auto mb-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-7 h-7 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2m2 0h10"
                />
                <circle cx="7" cy="17" r="2" />
                <circle cx="17" cy="17" r="2" />
              </svg>
            </div>
            <h3 class="text-lg font-black text-white uppercase tracking-tight">
              เรียกรวดเร็ว
            </h3>
            <p class="text-[11px] text-white/60 font-medium mt-1">
              {{ shop.name }}
            </p>
          </div>

          <div class="flex flex-col gap-3">
            <!-- Grab -->
            <button
              @click="openGrab"
              :disabled="rideLoading === 'grab'"
              class="w-full h-14 bg-gradient-to-r from-[#00B14F] to-[#00A84D] hover:from-[#009e47] hover:to-[#009441] rounded-2xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all duration-200 group relative overflow-hidden"
            >
              <div
                class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
              ></div>
              <div class="relative z-10 flex items-center justify-center gap-3">
                <div class="bg-white p-2 rounded-full">
                  <div
                    class="w-5 h-5 flex items-center justify-center text-green-600 font-bold text-xs"
                  >
                    G
                  </div>
                </div>
                <span class="font-bold text-white text-base tracking-wide">
                  {{ rideLoading === "grab" ? "กำลังเปิด..." : "Grab" }}
                </span>
              </div>
            </button>

            <!-- Bolt -->
            <button
              @click="openBolt"
              :disabled="rideLoading === 'bolt'"
              class="w-full h-14 bg-gradient-to-r from-[#34D186] to-[#2EC477] hover:from-[#2bc87d] hover:to-[#26b572] rounded-2xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all duration-200 group relative overflow-hidden"
            >
              <div
                class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
              ></div>
              <div class="relative z-10 flex items-center justify-center gap-3">
                <div class="bg-white p-2 rounded-full">
                  <div
                    class="w-5 h-5 flex items-center justify-center text-[#34D186] font-bold text-xs"
                  >
                    B
                  </div>
                </div>
                <span class="font-bold text-white text-base tracking-wide">
                  {{ rideLoading === "bolt" ? "กำลังเปิด..." : "Bolt" }}
                </span>
              </div>
            </button>

            <!-- Lineman -->
            <button
              @click="openLineman"
              :disabled="rideLoading === 'lineman'"
              class="w-full h-14 bg-gradient-to-r from-[#00B14F] to-[#009440] hover:from-[#009e47] hover:to-[#008439] rounded-2xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all duration-200 group relative overflow-hidden border-l-4 border-green-400"
            >
              <div
                class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
              ></div>
              <div class="relative z-10 flex items-center justify-center gap-3">
                <div class="bg-white p-2 rounded-full">
                  <div
                    class="w-5 h-5 flex items-center justify-center text-green-600 font-bold text-xs"
                  >
                    L
                  </div>
                </div>
                <span class="font-bold text-white text-base tracking-wide">
                  {{ rideLoading === "lineman" ? "กำลังเปิด..." : "Lineman" }}
                </span>
              </div>
            </button>
          </div>

          <div class="mt-6 text-center border-t border-white/10 pt-4">
            <transition name="fade">
              <p
                v-if="copyStatus"
                class="text-xs font-bold text-green-400 uppercase animate-pulse"
              >
                {{ copyStatus }}
              </p>
            </transition>
            <p class="text-[10px] text-white/40 mt-2 italic" v-if="isMobile">
              * ถ้าแอพไม่เปิดอัตโนมัติ กรุณาเปิดแอพด้วยตนเอง
            </p>
          </div>
        </div>
      </div>
    </transition>

    <!-- Zoomed Image -->
    <transition name="fade">
      <div
        v-if="zoomedImage"
        class="fixed inset-0 z-[6000] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md cursor-pointer"
        @click="zoomedImage = null"
      >
        <img
          :src="zoomedImage"
          class="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl object-contain animate-zoom"
        />
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* Existing styles remain */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
.animate-pop {
  animation: pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes zoom {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.animate-zoom {
  animation: zoom 0.2s ease-out forwards;
}

.promo-status-badge {
  @apply font-black rounded-md uppercase tracking-wider text-white shrink-0;
  background: linear-gradient(270deg, #ff4d4d, #f97316, #ff4d4d);
  background-size: 200% 200%;
  animation: wave-gradient 2s linear infinite;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

@keyframes wave-gradient {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

.animate-pulse-slow {
  animation: pulse-slow 3s infinite;
}
@keyframes pulse-slow {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.95;
    transform: scale(1.03);
  }
}

/* ปุ่ม disabled */
button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
