<script setup>
/**
 * FavoritesModal.vue
 * Bottom sheet favorites list with search and lightweight interactions.
 */

import {
	ChevronRight,
	Heart,
	MapPin,
	Search,
	Trash2,
	X,
} from "lucide-vue-next";
import { computed, defineAsyncComponent, ref } from "vue";
import { useHaptics } from "../../composables/useHaptics";
import { useFavoritesStore } from "../../store/favoritesStore";
import { useShopStore } from "../../store/shopStore";

const ImageLoader = defineAsyncComponent(() => import("../ui/ImageLoader.vue"));

defineProps({
	isOpen: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["close", "select-shop"]);

const { selectFeedback, successFeedback, impactFeedback } = useHaptics();
const favoritesStore = useFavoritesStore();
const shopStore = useShopStore();

const searchQuery = ref("");

const normalizeId = (id) => String(id ?? "").trim();

const shopById = computed(() => {
	const map = new Map();
	for (const shop of shopStore.processedShops || []) {
		map.set(normalizeId(shop.id), shop);
	}
	return map;
});

const favoriteShops = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();
	const ids = Array.from(favoritesStore.favoriteIds || []);

	return ids
		.map((id) => shopById.value.get(normalizeId(id)))
		.filter(Boolean)
		.filter((shop) => {
			if (!q) return true;
			const name = String(shop.name || "").toLowerCase();
			const category = String(shop.category || "").toLowerCase();
			return name.includes(q) || category.includes(q);
		});
});

const isEmpty = computed(() => (favoritesStore.favoriteIds || []).length === 0);

const selectShop = (shop) => {
	successFeedback();
	emit("select-shop", shop);
	emit("close");
};

const removeFavorite = (shopId) => {
	impactFeedback("light");
	favoritesStore.removeFavorite(shopId);
};

const close = () => {
	selectFeedback();
	emit("close");
};
</script>

<template>
  <Transition name="fm-overlay">
    <div
      v-if="isOpen"
      class="fm-backdrop"
      data-testid="favorites-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fm-title"
      @click.self="close"
    >
      <div class="fm-sheet" data-testid="favorites-modal-sheet">
        <div class="fm-handle" aria-hidden="true">
          <div class="fm-handle-bar" />
        </div>

        <header class="fm-header">
          <div class="fm-header-left">
            <span class="fm-icon-wrap" aria-hidden="true">
              <Heart class="w-5 h-5 text-rose-400 fill-rose-400" />
            </span>
            <div>
              <h2 id="fm-title" class="fm-title">Saved Vibes</h2>
              <p class="fm-subtitle">{{ favoritesStore.count }} places</p>
            </div>
          </div>
          <button
            class="fm-close-btn"
            aria-label="Close favorites"
            @click="close"
          >
            <X class="w-5 h-5" />
          </button>
        </header>

        <div v-if="!isEmpty" class="fm-search-wrap">
          <Search class="fm-search-icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search saved places..."
            class="fm-search"
            aria-label="Search favorites"
          />
        </div>

        <div class="fm-list">
          <div v-if="isEmpty" class="fm-empty">
            <div class="fm-empty-icon" aria-hidden="true">
              <Heart class="w-10 h-10 text-rose-500/40" />
            </div>
            <p class="fm-empty-title">No saved places yet</p>
            <p class="fm-empty-hint">
              Double-tap any venue card to save it here
            </p>
          </div>

          <div v-else-if="favoriteShops.length === 0" class="fm-empty">
            <p class="fm-empty-title">No results</p>
            <p class="fm-empty-hint">Try a different search term</p>
          </div>

          <TransitionGroup
            v-else
            tag="ul"
            name="fm-list-item"
            class="fm-cards"
            role="list"
          >
            <li v-for="shop in favoriteShops" :key="shop.id" class="fm-card">
              <button
                class="fm-card-main"
                data-testid="favorites-open-item"
                :aria-label="`Open ${shop.name || 'saved place'}`"
                @click="selectShop(shop)"
              >
                <div class="fm-thumb">
                  <ImageLoader
                    v-if="shop.Image_URL1 || shop.media?.primaryImage"
                    :src="shop.Image_URL1 || shop.media?.primaryImage"
                    :alt="shop.name || 'Venue image'"
                  />
                  <div v-else class="fm-thumb-placeholder" aria-hidden="true">
                    {{ (shop.name || "?").charAt(0).toUpperCase() }}
                  </div>

                  <span
                    v-if="shop.status === 'LIVE'"
                    class="fm-live-dot"
                    aria-label="Live now"
                  />
                </div>

                <div class="fm-card-info">
                  <p class="fm-card-name">{{ shop.name || "Unnamed venue" }}</p>
                  <p class="fm-card-category">{{ shop.category || "-" }}</p>
                  <div class="fm-card-meta">
                    <MapPin class="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                    <span>{{
                      shop.distance != null
                        ? `${Number(shop.distance).toFixed(1)} km`
                        : "Nearby"
                    }}</span>
                    <span v-if="shop.rating" class="fm-card-rating"
                      >★ {{ Number(shop.rating).toFixed(1) }}</span
                    >
                  </div>
                </div>

                <ChevronRight class="fm-card-chevron" aria-hidden="true" />
              </button>

              <button
                class="fm-remove-btn"
                data-testid="favorites-remove-item"
                :aria-label="`Remove ${shop.name || 'venue'} from favorites`"
                @click.stop="removeFavorite(shop.id)"
              >
                <Trash2 class="w-4 h-4" aria-hidden="true" />
                Remove
              </button>
            </li>
          </TransitionGroup>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0 0 0 / 0.6);
  backdrop-filter: blur(6px);
}

.fm-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 84dvh;
  display: flex;
  flex-direction: column;
  border-radius: 24px 24px 0 0;
  overflow: hidden;
  background: linear-gradient(
    170deg,
    rgba(18 24 52 / 0.98) 0%,
    rgba(8 12 24 / 0.99) 100%
  );
  border-top: 1px solid rgba(255 255 255 / 0.1);
  box-shadow:
    0 -8px 40px rgba(0 0 0 / 0.5),
    0 -1px 0 rgba(255 255 255 / 0.06) inset;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  contain: layout paint style;
}

.fm-handle {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
  flex-shrink: 0;
}

.fm-handle-bar {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255 255 255 / 0.25);
}

.fm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 12px;
  border-bottom: 1px solid rgba(255 255 255 / 0.06);
  flex-shrink: 0;
}

.fm-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fm-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(244 63 94 / 0.2);
  border: 1px solid rgba(244 63 94 / 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.fm-title {
  font-size: 1.05rem;
  font-weight: 900;
  color: #fff;
}

.fm-subtitle {
  font-size: 10px;
  color: rgba(255 255 255 / 0.45);
  margin-top: 1px;
}

.fm-close-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255 255 255 / 0.55);
  background: rgba(255 255 255 / 0.06);
  border: 1px solid rgba(255 255 255 / 0.08);
  transition:
    background 0.15s,
    color 0.15s,
    transform 0.1s;
}

.fm-close-btn:hover {
  background: rgba(255 255 255 / 0.12);
  color: #fff;
}

.fm-close-btn:active {
  transform: scale(0.9);
}

.fm-close-btn:focus-visible {
  outline: 2px solid rgba(244 63 94 / 0.8);
  outline-offset: 2px;
}

.fm-search-wrap {
  position: relative;
  padding: 10px 16px;
  flex-shrink: 0;
}

.fm-search-icon {
  position: absolute;
  left: 27px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: rgba(255 255 255 / 0.35);
  pointer-events: none;
}

.fm-search {
  width: 100%;
  background: rgba(255 255 255 / 0.06);
  border: 1px solid rgba(255 255 255 / 0.1);
  border-radius: 12px;
  padding: 9px 12px 9px 36px;
  font-size: 0.875rem;
  color: #fff;
  outline: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.fm-search::placeholder {
  color: rgba(255 255 255 / 0.3);
}

.fm-search:focus {
  border-color: rgba(244 63 94 / 0.5);
  background: rgba(255 255 255 / 0.08);
}

.fm-search::-webkit-search-cancel-button {
  display: none;
}

.fm-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 12px 8px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}

.fm-list::-webkit-scrollbar {
  display: none;
}

.fm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  gap: 8px;
}

.fm-empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(244 63 94 / 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.fm-empty-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: rgba(255 255 255 / 0.55);
}

.fm-empty-hint {
  font-size: 0.78rem;
  color: rgba(255 255 255 / 0.3);
}

.fm-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.fm-card {
  background: rgba(255 255 255 / 0.04);
  border: 1px solid rgba(255 255 255 / 0.08);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color 0.15s;
}

.fm-card:hover {
  border-color: rgba(255 255 255 / 0.15);
}

.fm-card-main {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
  transition:
    background 0.15s,
    transform 0.12s;
  touch-action: manipulation;
}

.fm-card-main:hover {
  background: rgba(255 255 255 / 0.04);
}

.fm-card-main:active {
  background: rgba(255 255 255 / 0.07);
  transform: scale(0.99);
}

.fm-card-main:focus-visible {
  outline: 2px solid rgba(99 102 241 / 0.7);
  outline-offset: -2px;
  border-radius: 16px;
}

.fm-thumb {
  position: relative;
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255 255 255 / 0.08);
}

.fm-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.fm-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 900;
  color: rgba(255 255 255 / 0.4);
  background: linear-gradient(
    135deg,
    rgba(99 102 241 / 0.2),
    rgba(236 72 153 / 0.2)
  );
}

.fm-live-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid rgba(0 0 0 / 0.5);
  animation: live-pulse 1.4s ease-in-out infinite;
}

@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.fm-card-info {
  flex: 1;
  min-width: 0;
}

.fm-card-name {
  font-size: 0.9rem;
  font-weight: 800;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.fm-card-category {
  font-size: 10px;
  color: rgba(255 255 255 / 0.45);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
  margin-bottom: 4px;
}

.fm-card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: rgba(255 255 255 / 0.4);
}

.fm-card-rating {
  margin-left: 4px;
  color: #fbbf24;
  font-weight: 700;
}

.fm-card-chevron {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: rgba(255 255 255 / 0.2);
  transition:
    transform 0.15s,
    color 0.15s;
}

.fm-card-main:hover .fm-card-chevron {
  transform: translateX(2px);
  color: rgba(255 255 255 / 0.5);
}

.fm-remove-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(248 113 113 / 0.7);
  border-top: 1px solid rgba(255 255 255 / 0.05);
  transition:
    color 0.15s,
    background 0.15s;
}

.fm-remove-btn:hover {
  color: #f87171;
  background: rgba(239 68 68 / 0.08);
}

.fm-remove-btn:focus-visible {
  outline: 2px solid rgba(248 113 113 / 0.7);
  outline-offset: -2px;
}

.fm-overlay-enter-active {
  transition: opacity 0.3s ease;
}

.fm-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.fm-overlay-enter-from,
.fm-overlay-leave-to {
  opacity: 0;
}

.fm-overlay-enter-active .fm-sheet {
  transition: transform 0.42s cubic-bezier(0.16, 1, 0.3, 1);
}

.fm-overlay-leave-active .fm-sheet {
  transition: transform 0.28s cubic-bezier(0.7, 0, 0.84, 0);
}

.fm-overlay-enter-from .fm-sheet,
.fm-overlay-leave-to .fm-sheet {
  transform: translateY(100%);
}

.fm-list-item-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fm-list-item-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.fm-list-item-enter-from {
  opacity: 0;
  transform: translateX(-8px);
}

.fm-list-item-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

@media (min-width: 768px) {
  .fm-backdrop {
    align-items: center;
    padding: 24px;
  }

  .fm-sheet {
    border-radius: 24px;
    max-height: min(84dvh, 760px);
    border: 1px solid rgba(255 255 255 / 0.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fm-overlay-enter-active,
  .fm-overlay-leave-active,
  .fm-overlay-enter-active .fm-sheet,
  .fm-overlay-leave-active .fm-sheet,
  .fm-list-item-enter-active,
  .fm-list-item-leave-active,
  .fm-card-main {
    transition: none !important;
  }

  .fm-live-dot {
    animation: none;
  }
}
</style>
