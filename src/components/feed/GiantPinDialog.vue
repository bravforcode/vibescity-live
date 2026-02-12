<script setup>
import { Navigation, Phone, X } from "lucide-vue-next";
import { defineAsyncComponent } from "vue";

const VisitorCount = defineAsyncComponent(
	() => import("../ui/VisitorCount.vue"),
);

const props = defineProps({
	activeGiantPin: {
		type: Object,
		required: true,
	},
	giantPinShops: {
		type: Array,
		default: () => [],
	},
	selectedGiantShop: Object,
	selectedGiantVideoUrl: String,
	selectedGiantImage: String,
	getShopPreviewImage: Function,
	isDarkMode: Boolean,
});

const emit = defineEmits(["exit", "select-shop", "open-ride"]);
</script>

<template>
  <dialog
    class="fixed inset-0 z-[2500] flex flex-col md:flex-row bg-black pointer-events-auto p-0 m-0"
    open
    role="dialog"
    aria-modal="true"
    aria-labelledby="giant-pin-title"
  >
    <!-- Left/Top Side (Details) -->
    <div
      class="flex-1 md:w-[70%] flex flex-col overflow-hidden border-b md:border-b-0 md:border-r border-white/10"
    >
      <!-- Header -->
      <div class="p-4 glass-header flex items-center justify-between">
        <div>
          <h2 id="giant-pin-title" class="text-lg font-black text-white">
            {{ activeGiantPin.name }}
          </h2>
          <p class="text-xs text-white/60">
            {{ giantPinShops.length }} shops inside
          </p>
        </div>
        <button
          @click="emit('exit')"
          aria-label="Close giant pin view"
          class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Selected Shop Content -->
      <div v-if="selectedGiantShop" class="flex-1 overflow-y-auto">
        <!-- Video/Image -->
        <div class="relative aspect-video bg-zinc-900">
          <video
            v-if="selectedGiantVideoUrl"
            :src="selectedGiantVideoUrl"
            :poster="selectedGiantImage || undefined"
            muted
            loop
            playsinline
            autoplay
            class="w-full h-full object-cover"
          >
            <track kind="captions" />
          </video>
          <img
            v-else-if="selectedGiantImage"
            :src="selectedGiantImage"
            :alt="selectedGiantShop.name"
            class="w-full h-full object-cover ken-burns-slow"
          />
          <div
            v-else
            class="absolute inset-0 bg-gradient-to-br from-cyan-900 via-indigo-900 to-purple-900"
          ></div>
        </div>

        <!-- Shop Info -->
        <div class="p-4 space-y-4">
          <div>
            <h3 class="text-xl font-black text-white mb-1">
              {{ selectedGiantShop.name }}
            </h3>
            <p class="text-sm text-white/60">
              {{ selectedGiantShop.category }}
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-2">
            <button
              @click="emit('open-ride', selectedGiantShop)"
              class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              <Navigation class="w-4 h-4" />
              Directions
            </button>
            <button
              class="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              <Phone class="w-4 h-4" />
              Call
            </button>
          </div>

          <!-- Description -->
          <div class="p-4 rounded-xl bg-white/5 border border-white/10">
            <h4
              class="text-xs font-black text-white/40 uppercase tracking-widest mb-2"
            >
              About
            </h4>
            <p class="text-sm text-white/80 leading-relaxed">
              {{
                selectedGiantShop.description ||
                "Discover this amazing venue inside " + activeGiantPin.name
              }}
            </p>
          </div>

          <!-- Visitor Count -->
          <div class="p-4 rounded-xl bg-white/5 border border-white/10">
            <h4
              class="text-xs font-black text-white/40 uppercase tracking-widest mb-2"
            >
              Current Vibe
            </h4>
            <VisitorCount :shopId="selectedGiantShop.id" :isDarkMode="true" />
          </div>
        </div>
      </div>
    </div>

    <!-- Right/Bottom Side (Shop List) -->
    <div class="h-1/3 md:h-full md:w-[30%] flex flex-col bg-zinc-900/95">
      <div class="p-3 border-b border-white/10">
        <h3
          class="text-xs font-black text-white/40 uppercase tracking-widest"
        >
          Shops in Building
        </h3>
      </div>
      <div class="flex-1 overflow-y-auto p-2 space-y-2">
        <button
          v-for="shop in giantPinShops"
          :key="shop.id"
          @click="emit('select-shop', shop)"
          :aria-label="`Select ${shop.name}`"
          type="button"
          class="shop-list-item relative rounded-xl overflow-hidden cursor-pointer transition-transform active:scale-95 text-left"
          :class="
            selectedGiantShop?.id === shop.id
              ? 'ring-2 ring-blue-500'
              : 'opacity-70 hover:opacity-100'
          "
        >
          <div class="aspect-[4/3] relative">
            <img
              v-if="getShopPreviewImage(shop)"
              :src="getShopPreviewImage(shop)"
              :alt="shop.name"
              class="w-full h-full object-cover"
            />
            <div
              class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"
            ></div>
            <div class="absolute bottom-2 left-2 right-2">
              <h4 class="text-xs font-bold text-white truncate">
                {{ shop.name }}
              </h4>
              <p class="text-[10px] text-white/60">{{ shop.category }}</p>
            </div>
          </div>
        </button>

        <div
          v-if="giantPinShops.length === 0"
          class="p-4 text-center text-white/40 text-xs"
        >
          No shops found in this building
        </div>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.glass-header {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.ken-burns-slow {
  animation: kenBurns 14s ease-in-out infinite alternate;
}

@keyframes kenBurns {
  0% {
    transform: scale(1) translate(0, 0);
  }
  100% {
    transform: scale(1.1) translate(-2%, -1%);
  }
}

.shop-list-item:hover {
  transform: scale(1.02);
}
</style>
