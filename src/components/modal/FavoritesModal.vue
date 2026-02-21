<script setup>
// --- C:\vibecity.live\src\components\modal\FavoritesModal.vue ---
// ✅ Favorites Modal - Display all favorited shops

import { ChevronRight, Heart, MapPin, X } from "lucide-vue-next";
import { computed } from "vue";
import { useHaptics } from "../../composables/useHaptics";
import { useFavoritesStore } from "../../store/favoritesStore";
import { useShopStore } from "../../store/shopStore";

const props = defineProps({
	isOpen: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["close", "select-shop"]);

const { selectFeedback, successFeedback } = useHaptics();
const favoritesStore = useFavoritesStore();
const shopStore = useShopStore();

// Get full shop data for favorites
const favoriteShops = computed(() => {
	const ids = Array.from(favoritesStore.favoriteIds);
	return ids
		.map((id) => shopStore.rawShops.find((s) => s.id === id))
		.filter(Boolean);
});

const selectShop = (shop) => {
	successFeedback();
	emit("select-shop", shop);
	emit("close");
};

const removeFavorite = (shopId) => {
	selectFeedback();
	favoritesStore.removeFavorite(shopId);
};

const close = () => {
	selectFeedback();
	emit("close");
};
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      @click.self="close"
    >
      <div
        class="w-full max-w-md max-h-[80vh] bg-zinc-900 rounded-t-3xl overflow-hidden shadow-2xl flex flex-col safe-area-bottom"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center"
            >
              <Heart class="w-5 h-5 text-pink-400 fill-pink-400" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">Favorites</h2>
              <p class="text-xs text-white/50">
                {{ favoritesStore.count }} saved places
              </p>
            </div>
          </div>
          <button
            @click="close"
            class="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95 focus-ring"
            aria-label="Close favorites"
          >
            <X class="w-5 h-5 text-white" />
          </button>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div
            v-if="favoriteShops.length === 0"
            class="text-center py-12 text-white/40"
          >
            <Heart class="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p class="text-sm">No favorites yet</p>
            <p class="text-xs mt-1">Double-tap a card to save it here</p>
          </div>

          <div
            v-for="shop in favoriteShops"
            :key="shop.id"
            class="bg-white/5 rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors"
          >
            <button
              @click="selectShop(shop)"
              class="w-full p-4 flex items-center gap-4 active:bg-white/5 transition-colors"
            >
              <!-- Image -->
              <div
                class="w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 shrink-0"
              >
                <img
                  :src="
                    shop.Image_URL1 ||
                    `https://placehold.co/200x200/0f0f1a/3b82f6?text=${encodeURIComponent(shop.name?.charAt(0) || '?')}`
                  "
                  :alt="shop.name"
                  class="w-full h-full object-cover"
                />
              </div>

              <!-- Info -->
              <div class="flex-1 text-left min-w-0">
                <h3 class="text-white font-bold text-sm truncate">
                  {{ shop.name }}
                </h3>
                <p class="text-white/50 text-xs truncate">
                  {{ shop.category }}
                </p>
                <div class="flex items-center gap-1 mt-1 text-white/40 text-xs">
                  <MapPin class="w-3 h-3" />
                  <span v-if="shop.distance">
                    {{ Number(shop.distance).toFixed(1) }}km
                  </span>
                  <span v-else>Nearby</span>
                </div>
              </div>

              <ChevronRight class="w-5 h-5 text-white/30 shrink-0" />
            </button>

            <!-- Remove Button -->
            <div class="px-4 pb-3">
              <button
                @click.stop="removeFavorite(shop.id)"
                class="w-full py-2 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove from favorites
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.19, 1, 0.22, 1),
    transform 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
