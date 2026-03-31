<script setup>
import { ChevronRight, MapPin, X } from "lucide-vue-next";
import { computed } from "vue";
import { resolveVenueMedia } from "@/domain/venue/viewModel";

const props = defineProps({
	isOpen: Boolean,
	shops: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "select-shop"]);

const displayShops = computed(() =>
	(props.shops || []).slice(0, 20).map((shop) => {
		const media = resolveVenueMedia(shop || {});
		const rawCounts = shop?.media_counts || media.counts || {};
		const imageCount = Number(rawCounts?.images || 0);
		const videoCount = Number(rawCounts?.videos || 0);
		const totalCount = Number(rawCounts?.total || imageCount + videoCount);

		return {
			shop,
			imageUrl: media.primaryImage || "",
			imageCount,
			videoCount,
			totalCount,
		};
	}),
);
</script>

<template>
  <div class="relative z-[5000]">
    <!-- Backdrop -->
    <transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-300"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        @click="$emit('close')"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm"
      ></div>
    </transition>

    <!-- Side Panel -->
    <transition
      enter-active-class="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isOpen"
        class="fixed top-0 right-0 bottom-0 w-[85%] max-w-[320px] bg-zinc-900 border-l border-white/10 shadow-2xl flex flex-col pt-safe-top pb-safe-bottom"
      >
        <!-- Header -->
        <div
          class="p-4 border-b border-white/10 flex items-center justify-between bg-black/20"
        >
          <div>
            <h2 class="text-sm font-black text-white uppercase tracking-widest">
              More Vibes
            </h2>
            <p class="text-[10px] text-gray-400">
              Related to your current view
            </p>
          </div>
          <button
            @click="$emit('close')"
            class="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div
            v-for="entry in displayShops"
            :key="entry.shop.id"
            @click="
              $emit('select-shop', entry.shop);
              $emit('close');
            "
            class="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 active:scale-95 transition cursor-pointer"
          >
            <!-- Thumbnail -->
            <div
              class="w-16 h-16 rounded-lg bg-gray-800 flex-shrink-0 overflow-hidden"
            >
              <img
                v-if="entry.imageUrl"
                :src="entry.imageUrl"
                :alt="entry.shop.name || 'Shop image'"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-black"
              >
                <span
                  class="text-[8px] font-black uppercase tracking-[0.2em] text-white/35"
                >
                  {{ entry.totalCount > 0 ? `Gallery ${entry.totalCount}` : "No Media" }}
                </span>
              </div>
            </div>
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-bold text-white truncate">
                {{ entry.shop.name }}
              </h4>
              <div
                class="flex items-center gap-1 text-[10px] text-gray-400 mt-1"
              >
                <MapPin class="w-3 h-3" />
                <span>{{
                  entry.shop.distance
                    ? entry.shop.distance.toFixed(1) + "km"
                    : "Nearby"
                }}</span>
                <span class="mx-1">•</span>
                <span>{{ entry.shop.category }}</span>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-1">
                <span
                  v-if="entry.imageCount > 0"
                  class="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-cyan-200"
                >
                  IMG {{ entry.imageCount }}
                </span>
                <span
                  v-if="entry.videoCount > 0"
                  class="inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-fuchsia-200"
                >
                  VID {{ entry.videoCount }}
                </span>
              </div>
            </div>
            <ChevronRight class="w-4 h-4 text-white/30 self-center" />
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.pt-safe-top {
  padding-top: env(safe-area-inset-top, 20px);
}
.pb-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 20px);
}
</style>
