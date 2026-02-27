<!-- src/components/system/AppModals.vue -->
<script setup>
import { defineAsyncComponent } from "vue";
import PortalLayer from "./PortalLayer.vue"; // Adjust relative path if needed

// ✅ Async load heavy modals
const MallDrawer = defineAsyncComponent(
  () => import("../modal/MallDrawer.vue"),
);
const ProfileDrawer = defineAsyncComponent(
  () => import("../modal/ProfileDrawer.vue"),
);
const VibeModal = defineAsyncComponent(() => import("../modal/VibeModal.vue"));
const ConfettiEffect = defineAsyncComponent(
  () => import("../ui/ConfettiEffect.vue"),
);

defineProps({
  selectedShop: Object,
  rideModalShop: Object,
  showMallDrawer: Boolean,
  activeMall: Object,
  mallShops: {
    type: Array,
    default: () => [],
  },
  activeShopId: [Number, String],
  favorites: {
    type: Array,
    default: () => [],
  },
  showProfileDrawer: Boolean,
  isDarkMode: Boolean,
  isDataLoading: Boolean,
  errorMessage: String,
  showConfetti: Boolean,
});

const emit = defineEmits([
  "close-vibe-modal",
  "toggle-favorite",
  "close-ride-modal",
  "open-ride-app",
  "close-mall-drawer",
  "select-mall-shop",
  "open-ride-modal",
  "close-profile-drawer",
  "toggle-language",
  "clear-error",
  "retry",
]);
</script>

<template>
  <!-- ✅ PORTAL: ย้ายทุก Modal/Drawer/Overlay มาอยู่บนสุดของ DOM -->
  <PortalLayer>
    <!-- ✅ VIBE MODAL (รายละเอียดร้าน) -->
    <transition name="modal-fade">
      <div data-testid="vibe-modal" v-if="selectedShop">
        <VibeModal
          :shop="selectedShop"
          @close="emit('close-vibe-modal')"
          @toggle-favorite="(id) => emit('toggle-favorite', id)"
        />
      </div>
    </transition>

    <!-- ✅ Ride Service Modal Popup (ของเดิมคุณ) -->
    <transition name="fade">
      <div
        v-if="rideModalShop"
        class="fixed inset-0 z-[9000] flex items-center justify-center p-4"
        @click="emit('close-ride-modal')"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- Modal Content -->
        <transition name="modal-scale">
          <div
            v-if="rideModalShop"
            @click.stop
            :class="[
              'relative w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden',
              isDarkMode ? 'bg-zinc-900 border border-white/10' : 'bg-white',
            ]"
          >
            <!-- ✅ === เอาของเดิมทั้งหมดใน Ride Modal (Header + 3 ปุ่ม Grab/Bolt/Lineman) มาวางตรงนี้แบบเดิมเป๊ะ === -->
            <!-- ⚠️ ห้ามแก้อะไรข้างใน แค่ย้ายที่ render -->
            <div
              :class="[
                'px-4 py-3 border-b',
                isDarkMode ? 'border-white/10' : 'border-gray-100',
              ]"
            >
              <div class="flex items-center justify-between">
                <div>
                  <h3
                    :class="[
                      'text-sm font-bold',
                      isDarkMode ? 'text-white' : 'text-gray-900',
                    ]"
                  >
                    เรียกรถไป
                  </h3>
                  <p
                    :class="[
                      'text-xs mt-0.5',
                      isDarkMode ? 'text-white/60' : 'text-gray-500',
                    ]"
                  >
                    {{ rideModalShop.name }}
                  </p>
                </div>
                <button
                  @click="emit('close-ride-modal')"
                  :class="[
                    'w-8 h-8 flex items-center justify-center rounded-full transition-all',
                    isDarkMode
                      ? 'hover:bg-white/10 text-white/60'
                      : 'hover:bg-gray-100 text-gray-400',
                  ]"
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
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div class="p-3 space-y-2">
              <a
                :href="`https://grab.onelink.me/2695613898?af_dp=grab://open?screenType=BOOKING&dropOffLatitude=${rideModalShop.lat}&dropOffLongitude=${rideModalShop.lng}&dropOffName=${encodeURIComponent(rideModalShop.name)}`"
                target="_blank"
                @click="emit('close-ride-modal')"
                :class="[
                  'flex items-center gap-3 p-3 rounded-xl transition-all duration-200',
                  isDarkMode
                    ? 'bg-white/5 hover:bg-white/10 active:scale-95'
                    : 'bg-gray-50 hover:bg-gray-100 active:scale-95',
                ]"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-green-500/30"
                >
                  G
                </div>
                <div class="flex-1">
                  <div
                    :class="[
                      'font-semibold text-sm',
                      isDarkMode ? 'text-white' : 'text-gray-900',
                    ]"
                  >
                    Grab
                  </div>
                  <div
                    :class="[
                      'text-[10px]',
                      isDarkMode ? 'text-white/50' : 'text-gray-500',
                    ]"
                  >
                    เรียกรถแกร็บ
                  </div>
                </div>
              </a>

              <a
                :href="`bolt://google/navigate?q=${rideModalShop.lat},${rideModalShop.lng}`"
                target="_blank"
                @click="emit('close-ride-modal')"
                :class="[
                  'flex items-center gap-3 p-3 rounded-xl transition-all duration-200',
                  isDarkMode
                    ? 'bg-white/5 hover:bg-white/10 active:scale-95'
                    : 'bg-gray-50 hover:bg-gray-100 active:scale-95',
                ]"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-[#34D186] flex items-center justify-center shadow-lg shadow-[#34D186]/30"
                >
                  B
                </div>
                <div class="flex-1">
                  <div
                    :class="[
                      'font-semibold text-sm',
                      isDarkMode ? 'text-white' : 'text-gray-900',
                    ]"
                  >
                    Bolt
                  </div>
                  <div
                    :class="[
                      'text-[10px]',
                      isDarkMode ? 'text-white/50' : 'text-gray-500',
                    ]"
                  >
                    เรียกรถโบลท์
                  </div>
                </div>
              </a>

              <a
                :href="`https://lineman.asia/taxi?dropoff_lat=${rideModalShop.lat}&dropoff_lng=${rideModalShop.lng}`"
                target="_blank"
                @click="emit('close-ride-modal')"
                :class="[
                  'flex items-center gap-3 p-3 rounded-xl transition-all duration-200',
                  isDarkMode
                    ? 'bg-white/5 hover:bg-white/10 active:scale-95'
                    : 'bg-gray-50 hover:bg-gray-100 active:scale-95',
                ]"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-[#00B14F] flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-[#00B14F]/30"
                >
                  L
                </div>
                <div class="flex-1">
                  <div
                    :class="[
                      'font-semibold text-sm',
                      isDarkMode ? 'text-white' : 'text-gray-900',
                    ]"
                  >
                    Lineman
                  </div>
                  <div
                    :class="[
                      'text-[10px]',
                      isDarkMode ? 'text-white/50' : 'text-gray-500',
                    ]"
                  >
                    เรียกรถไลน์แมน
                  </div>
                </div>
              </a>
            </div>
          </div>
        </transition>
      </div>
    </transition>

    <!-- ✅ MALL DRAWER -->
    <MallDrawer
      :is-open="showMallDrawer"
      :building="activeMall"
      :shops="mallShops"
      :is-dark-mode="isDarkMode"
      :selected-shop-id="activeShopId"
      @close="emit('close-mall-drawer')"
      @select-shop="(shop) => emit('select-mall-shop', shop)"
      @open-ride-modal="(shop) => emit('open-ride-modal', shop)"
      @toggle-favorite="(id) => emit('toggle-favorite', id)"
      :favorites="favorites"
    />

    <!-- ✅ PROFILE DRAWER -->
    <ProfileDrawer
      :is-open="showProfileDrawer"
      :is-dark-mode="isDarkMode"
      @close="emit('close-profile-drawer')"
      @toggle-language="emit('toggle-language')"
    />

    <!-- ✅ Global Loading State -->
    <Transition
      enter-active-class="transition duration-500 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-300 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-105"
    >
      <div
        v-if="isDataLoading"
        class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#09090b]"
      >
        <div class="relative w-24 h-24">
          <div
            class="absolute inset-0 rounded-full border-4 border-white/5"
          ></div>
          <div
            class="absolute inset-0 rounded-full border-4 border-pink-500 border-t-transparent animate-spin"
          ></div>
          <div
            class="absolute inset-4 rounded-full border-4 border-blue-500 border-b-transparent animate-spin-slow"
          ></div>
        </div>
        <h2
          class="mt-8 text-xl font-black text-white tracking-[0.2em] animate-pulse"
        >
          VIBECITY
        </h2>
        <p
          class="mt-2 text-zinc-500 text-xs uppercase tracking-widest font-bold"
        >
          Synchronizing Vibe Engine...
        </p>
      </div>
    </Transition>

    <!-- ✅ Global Error Feedback -->
    <Transition
      enter-active-class="transition duration-500 ease-out"
      enter-from-class="opacity-0 translate-y-10"
      enter-to-class="opacity-100 translate-y-0"
    >
      <div
        v-if="errorMessage"
        class="fixed top-20 left-1/2 -translate-x-1/2 z-[8000] w-[90%] max-w-md"
      >
        <div
          class="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 backdrop-blur-xl flex items-center gap-4 shadow-2xl"
        >
          <div
            class="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-xl shrink-0"
          >
            ⚠️
          </div>
          <div class="flex-1">
            <h4 class="text-white font-bold text-sm">System Alert</h4>
            <p class="text-white/60 text-xs">{{ errorMessage }}</p>
          </div>
          <button
            @click="emit('clear-error')"
            class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/40"
          >
            ✕
          </button>
        </div>
      </div>
    </Transition>

    <!-- ✅ Confetti -->
    <ConfettiEffect v-if="showConfetti" />
  </PortalLayer>
</template>

<style scoped>
.animate-spin-slow {
  animation: spin 3s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active {
  transition: opacity 0.25s ease-out;
}
.modal-fade-leave-active {
  transition: opacity 0.2s ease-in;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-scale-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-scale-leave-active {
  transition: all 0.2s ease-in;
}
.modal-scale-enter-from {
  opacity: 0;
  transform: scale(0.85) translateY(20px);
}
.modal-scale-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(10px);
}
</style>
