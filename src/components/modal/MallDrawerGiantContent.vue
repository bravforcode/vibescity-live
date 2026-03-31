<script setup>
import {
	ArrowRight,
	Building2,
	Heart,
	Image as ImageIcon,
	MapPin,
	Navigation,
	Play,
	Sparkles,
	Store,
} from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useGiantPinSelection } from "@/composables/useGiantPinSelection";
import { resolveVenueMedia } from "@/domain/venue/viewModel";
import ImageLoader from "../ui/ImageLoader.vue";

const props = defineProps({
	context: {
		type: Object,
		default: null,
	},
	building: {
		type: Object,
		default: null,
	},
	shops: {
		type: Array,
		default: () => [],
	},
	favorites: {
		type: Array,
		default: () => [],
	},
});

const emit = defineEmits([
	"preview-shop-change",
	"open-shop-detail",
	"toggle-favorite",
	"open-ride-modal",
]);

const { t } = useI18n();

const normalizeId = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const {
	selectedShop,
	selectedShopId,
	selectedShopMedia,
	heroImage,
	preloadTargets,
	shopsInBuilding,
	selectShop,
	hasResolvedBuilding,
} = useGiantPinSelection({
	context: computed(() => props.context),
	shops: computed(() => props.shops),
});

const buildingLabel = computed(
	() =>
		props.context?.buildingName || props.building?.name || t("giant_pin.venue"),
);

const selectedShopIndex = computed(() => {
	const currentId = normalizeId(selectedShopId.value);
	const index = shopsInBuilding.value.findIndex(
		(shop) => normalizeId(shop?.id) === currentId,
	);
	return index >= 0 ? index + 1 : 1;
});

const selectedFloorLabel = computed(
	() => selectedShop.value?.Floor || selectedShop.value?.floor || null,
);

const selectedStatusLabel = computed(() => {
	const normalizedStatus = String(
		selectedShop.value?.status || "",
	).toUpperCase();
	if (normalizedStatus === "LIVE") return t("status.live");
	if (normalizedStatus === "OPEN" || normalizedStatus === "OPEN NOW") {
		return t("common.open_now");
	}
	return "";
});

const galleryCount = computed(() => {
	const countFromMedia = Number(
		selectedShopMedia.value?.counts?.images ||
			selectedShopMedia.value?.images?.length ||
			0,
	);
	return Number.isFinite(countFromMedia) ? countFromMedia : 0;
});

const videoCount = computed(() => {
	const countFromMedia = Number(
		selectedShopMedia.value?.counts?.videos ||
			selectedShopMedia.value?.videos?.length ||
			(selectedShopMedia.value?.videoUrl ? 1 : 0),
	);
	return Number.isFinite(countFromMedia) ? countFromMedia : 0;
});

const shopCountLabel = computed(() =>
	t("giant_pin.shops_inside", { count: shopsInBuilding.value.length }),
);

const heroDescription = computed(
	() =>
		selectedShop.value?.description ||
		t("giant_pin.default_about", { place: buildingLabel.value }),
);

const onSelectShop = (shop) => {
	selectShop(shop);
	emit("preview-shop-change", shop);
};

const isFavorited = (shopId) => {
	const normalizedId = normalizeId(shopId);
	if (!normalizedId) return false;
	return (props.favorites || []).some(
		(value) => normalizeId(value) === normalizedId,
	);
};

const getShopImage = (shop) => {
	const media = resolveVenueMedia(shop || {});
	return media.primaryImage || shop?.Image_URL1 || "";
};

const getCardCaption = (shop) => {
	const parts = [
		shop?.category || t("giant_pin.shop"),
		shop?.Floor || shop?.floor || null,
	];
	return parts.filter(Boolean).join(" • ");
};

const isSelectedCard = (shop) =>
	normalizeId(selectedShopId.value) === normalizeId(shop?.id);
</script>

<template>
  <div class="giant-shell" data-testid="giant-pin-shell">
    <div class="giant-shell__ambient" aria-hidden="true"></div>

    <div
      v-if="!hasResolvedBuilding || shopsInBuilding.length === 0"
      class="giant-empty"
      data-testid="giant-pin-empty-state"
    >
      <div class="giant-empty__icon">
        <Store class="h-8 w-8" />
      </div>
      <h3 class="giant-empty__title">{{ buildingLabel }}</h3>
      <p class="giant-empty__copy">
        {{ t("feed.no_venues") }}
      </p>
    </div>

    <template v-else>
      <section class="giant-hero">
        <div class="giant-hero__frame">
          <div class="giant-hero__media">
            <ImageLoader
              v-if="heroImage"
              :src="heroImage"
              :alt="selectedShop?.name || buildingLabel"
              class="giant-hero__image"
            />
            <div v-else class="giant-hero__fallback">
              <Store class="h-12 w-12" />
            </div>
          </div>

          <div class="giant-hero__scrim"></div>

          <div class="giant-hero__topbar">
            <div class="giant-chip giant-chip--solid">
              <Building2 class="h-3.5 w-3.5" />
              <span>{{ buildingLabel }}</span>
            </div>
            <div class="giant-chip giant-chip--muted">
              <Sparkles class="h-3.5 w-3.5" />
              <span>
                {{ t("giant_pin.featured_shop") }}
                {{ selectedShopIndex }}/{{ shopsInBuilding.length }}
              </span>
            </div>
          </div>

          <button
            v-if="selectedShop"
            type="button"
            class="giant-hero__favorite"
            :aria-label="`${t('common.favorite')} ${selectedShop.name}`"
            @click="emit('toggle-favorite', selectedShop.id)"
          >
            <Heart
              class="h-4.5 w-4.5"
              :class="{ 'fill-current text-[#ff8a5b]': isFavorited(selectedShop.id) }"
            />
          </button>

          <div class="giant-hero__panel">
            <div class="giant-hero__eyebrow">
              <div class="giant-chip giant-chip--accent">
                <Sparkles class="h-3.5 w-3.5" />
                <span>{{ t("giant_pin.current_vibe") }}</span>
              </div>
              <div v-if="selectedStatusLabel" class="giant-chip giant-chip--status">
                {{ selectedStatusLabel }}
              </div>
              <div v-if="selectedFloorLabel" class="giant-chip giant-chip--muted">
                {{ selectedFloorLabel }}
              </div>
            </div>

            <h2 class="giant-hero__title" data-testid="giant-pin-hero-title">
              {{ selectedShop?.name || buildingLabel }}
            </h2>

            <p class="giant-hero__meta">
              <MapPin class="h-3.5 w-3.5" />
              <span>{{ selectedShop?.category || t("giant_pin.shop") }}</span>
            </p>

            <p class="giant-hero__description">
              {{ heroDescription }}
            </p>

            <div class="giant-hero__stats">
              <div class="giant-stat">
                <ImageIcon class="h-4 w-4" />
                <span>{{ t("giant_pin.photo_count", { count: galleryCount }) }}</span>
              </div>
              <div v-if="videoCount > 0" class="giant-stat">
                <Play class="h-4 w-4" />
                <span>{{ t("giant_pin.video_count", { count: videoCount }) }}</span>
              </div>
              <div class="giant-stat">
                <Store class="h-4 w-4" />
                <span>{{ shopCountLabel }}</span>
              </div>
            </div>

            <div class="giant-hero__actions">
              <button
                type="button"
                class="giant-hero__cta giant-hero__cta--primary"
                data-testid="giant-pin-detail-cta"
                @click="selectedShop && emit('open-shop-detail', selectedShop)"
              >
                <span>{{ t("shop.details") }}</span>
                <ArrowRight class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="giant-hero__cta giant-hero__cta--secondary"
                @click="selectedShop && emit('open-ride-modal', selectedShop)"
              >
                <Navigation class="h-4 w-4" />
                <span>{{ t("common.directions") }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside class="giant-rail">
        <div class="giant-rail__header">
          <div class="giant-rail__heading">
            <p class="giant-rail__eyebrow">{{ t("giant_pin.shops_in_building") }}</p>
            <h3 class="giant-rail__title">{{ shopCountLabel }}</h3>
          </div>
          <p class="giant-rail__hint">
            {{ t("giant_pin.preview_hint") }}
          </p>
        </div>

        <div class="giant-rail__list">
          <div
            v-for="(shop, index) in shopsInBuilding"
            :key="shop.id"
            class="giant-card"
            role="button"
            tabindex="0"
            :aria-pressed="isSelectedCard(shop)"
            data-testid="giant-pin-card"
            :class="{ 'giant-card--active': isSelectedCard(shop) }"
            @click="onSelectShop(shop)"
            @keydown.enter.prevent="onSelectShop(shop)"
            @keydown.space.prevent="onSelectShop(shop)"
          >
            <div class="giant-card__index">
              {{ String(index + 1).padStart(2, "0") }}
            </div>

            <div class="giant-card__thumb">
              <ImageLoader
                v-if="getShopImage(shop)"
                :src="getShopImage(shop)"
                :alt="shop.name"
                loading="lazy"
                class="giant-card__image"
              />
              <div v-else class="giant-card__fallback">
                <Store class="h-5 w-5" />
              </div>
            </div>

            <div class="giant-card__copy">
              <div class="giant-card__heading">
                <p class="giant-card__name">{{ shop.name }}</p>
                <span v-if="isSelectedCard(shop)" class="giant-card__active-pill">
                  {{ t("giant_pin.now_showing") }}
                </span>
              </div>
              <p class="giant-card__category">{{ getCardCaption(shop) }}</p>
              <p class="giant-card__note">
                {{ isSelectedCard(shop) ? t("giant_pin.featured_shop") : t("giant_pin.preview_action") }}
              </p>
            </div>

            <button
              type="button"
              class="giant-card__favorite"
              :aria-label="`${t('common.favorite')} ${shop.name}`"
              @click.stop="emit('toggle-favorite', shop.id)"
            >
              <Heart
                class="h-4 w-4"
                :class="{ 'fill-current text-[#ff8a5b]': isFavorited(shop.id) }"
              />
            </button>
          </div>
        </div>

        <div class="giant-preload" aria-hidden="true">
          <img
            v-for="shop in preloadTargets.slice(1).filter((item) => getShopImage(item))"
            :key="`preload-${shop.id}`"
            :src="getShopImage(shop)"
            alt=""
          />
        </div>
      </aside>
    </template>
  </div>
</template>

<style scoped>
.giant-shell {
	--giant-bg: #060608;
	--giant-surface: rgba(14, 14, 18, 0.78);
	--giant-surface-strong: rgba(18, 18, 24, 0.92);
	--giant-border: rgba(255, 255, 255, 0.1);
	--giant-muted: rgba(255, 255, 255, 0.66);
	--giant-soft: rgba(255, 255, 255, 0.48);
	--giant-accent: #ff8a5b;
	--giant-accent-soft: rgba(255, 138, 91, 0.18);
	--giant-highlight: #ffd36e;
	position: relative;
	display: grid;
	grid-template-columns: 1fr;
	grid-template-rows: minmax(280px, 45svh) minmax(0, 1fr);
	height: 100%;
	background:
		radial-gradient(circle at top left, rgba(255, 138, 91, 0.18), transparent 34%),
		radial-gradient(circle at bottom right, rgba(255, 211, 110, 0.14), transparent 30%),
		var(--giant-bg);
}

.giant-shell__ambient {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background:
		linear-gradient(135deg, rgba(255, 255, 255, 0.03), transparent 32%),
		linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.2) 100%);
}

.giant-empty {
	display: grid;
	place-items: center;
	gap: 0.85rem;
	height: 100%;
	padding: 2rem;
	text-align: center;
	color: rgba(255, 255, 255, 0.82);
}

.giant-empty__icon {
	display: grid;
	place-items: center;
	width: 4.5rem;
	height: 4.5rem;
	border-radius: 1.4rem;
	background: rgba(255, 255, 255, 0.08);
	border: 1px solid var(--giant-border);
	color: rgba(255, 255, 255, 0.42);
}

.giant-empty__title {
	font-size: 1.2rem;
	font-weight: 900;
	letter-spacing: -0.02em;
}

.giant-empty__copy {
	max-width: 28rem;
	font-size: 0.92rem;
	line-height: 1.6;
	color: var(--giant-muted);
}

.giant-hero {
	position: relative;
	min-height: 0;
	padding: 0.9rem 0.9rem 0 0.9rem;
}

.giant-hero__frame {
	position: relative;
	height: 100%;
	overflow: hidden;
	border-radius: 1.65rem;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid var(--giant-border);
	box-shadow:
		0 18px 40px rgba(0, 0, 0, 0.28),
		inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.giant-hero__media,
.giant-hero__fallback,
.giant-hero__scrim {
	position: absolute;
	inset: 0;
}

.giant-hero__image {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.giant-hero__fallback {
	display: grid;
	place-items: center;
	background:
		radial-gradient(circle at top, rgba(255, 138, 91, 0.18), transparent 40%),
		linear-gradient(180deg, rgba(24, 24, 27, 0.96), rgba(9, 9, 11, 1));
	color: rgba(255, 255, 255, 0.34);
}

.giant-hero__scrim {
	background:
		linear-gradient(180deg, rgba(9, 9, 11, 0.08) 0%, rgba(9, 9, 11, 0.28) 28%, rgba(9, 9, 11, 0.88) 100%),
		linear-gradient(90deg, rgba(9, 9, 11, 0.24) 0%, transparent 46%);
}

.giant-hero__topbar {
	position: absolute;
	inset: 1rem 1rem auto 1rem;
	display: flex;
	flex-wrap: wrap;
	gap: 0.6rem;
	align-items: flex-start;
	padding-right: 3.5rem;
	z-index: 1;
}

.giant-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	min-height: 2rem;
	padding: 0.45rem 0.75rem;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 800;
	letter-spacing: 0.01em;
}

.giant-chip--solid {
	background: rgba(8, 8, 10, 0.68);
	backdrop-filter: blur(16px);
	color: #fff;
	border: 1px solid rgba(255, 255, 255, 0.12);
}

.giant-chip--muted {
	background: rgba(255, 255, 255, 0.08);
	color: rgba(255, 255, 255, 0.84);
	border: 1px solid rgba(255, 255, 255, 0.1);
}

.giant-chip--accent {
	background: linear-gradient(
		135deg,
		rgba(255, 138, 91, 0.9),
		rgba(255, 211, 110, 0.88)
	);
	color: #140d07;
	box-shadow: 0 10px 22px rgba(255, 138, 91, 0.26);
}

.giant-chip--status {
	background: rgba(255, 255, 255, 0.08);
	color: #fff;
	border: 1px solid rgba(255, 255, 255, 0.1);
}

.giant-hero__favorite {
	position: absolute;
	top: 1rem;
	right: 1rem;
	z-index: 1;
	display: grid;
	place-items: center;
	width: 2.9rem;
	height: 2.9rem;
	border-radius: 999px;
	background: rgba(8, 8, 10, 0.66);
	color: rgba(255, 255, 255, 0.76);
	border: 1px solid rgba(255, 255, 255, 0.1);
	backdrop-filter: blur(14px);
}

.giant-hero__panel {
	position: absolute;
	inset: auto 1rem 1rem 1rem;
	display: grid;
	gap: 0.8rem;
	padding: 1rem;
	border-radius: 1.35rem;
	background:
		linear-gradient(180deg, rgba(20, 20, 24, 0.72), rgba(10, 10, 13, 0.94)),
		var(--giant-surface);
	border: 1px solid rgba(255, 255, 255, 0.08);
	backdrop-filter: blur(20px);
	color: #fff;
	z-index: 1;
}

.giant-hero__eyebrow {
	display: flex;
	flex-wrap: wrap;
	gap: 0.55rem;
	align-items: center;
}

.giant-hero__title {
	font-size: clamp(1.55rem, 3vw, 2.45rem);
	line-height: 0.98;
	font-weight: 950;
	letter-spacing: -0.04em;
	text-wrap: balance;
}

.giant-hero__meta {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	font-size: 0.82rem;
	font-weight: 700;
	color: rgba(255, 255, 255, 0.84);
}

.giant-hero__description {
	max-width: 54ch;
	font-size: 0.94rem;
	line-height: 1.62;
	color: rgba(255, 255, 255, 0.82);
}

.giant-hero__stats {
	display: flex;
	flex-wrap: wrap;
	gap: 0.55rem;
}

.giant-stat {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	min-height: 2rem;
	padding: 0.45rem 0.7rem;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(255, 255, 255, 0.08);
	font-size: 0.77rem;
	font-weight: 700;
	color: rgba(255, 255, 255, 0.82);
}

.giant-hero__actions {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.giant-hero__cta {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.55rem;
	min-height: 48px;
	padding: 0.92rem 1rem;
	border-radius: 1rem;
	font-size: 0.9rem;
	font-weight: 900;
	transition:
		transform 180ms ease,
		background-color 180ms ease,
		border-color 180ms ease,
		box-shadow 180ms ease;
}

.giant-hero__cta:hover {
	transform: translateY(-1px);
}

.giant-hero__cta:active {
	transform: scale(0.98);
}

.giant-hero__cta--primary {
	background: linear-gradient(135deg, #fff4ee, #ffffff);
	color: #120c07;
	box-shadow: 0 14px 30px rgba(0, 0, 0, 0.16);
}

.giant-hero__cta--secondary {
	background: rgba(255, 255, 255, 0.08);
	border: 1px solid rgba(255, 255, 255, 0.14);
	color: #fff;
}

.giant-rail {
	position: relative;
	min-height: 0;
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	padding: 0.95rem;
	background: linear-gradient(
		180deg,
		rgba(8, 8, 10, 0.86),
		rgba(8, 8, 10, 1)
	);
	border-top: 1px solid var(--giant-border);
}

.giant-rail__header {
	position: sticky;
	top: 0;
	z-index: 1;
	display: grid;
	gap: 0.35rem;
	padding: 0.2rem 0 1rem 0;
	background: linear-gradient(
		180deg,
		rgba(6, 6, 8, 0.98) 0%,
		rgba(6, 6, 8, 0.92) 78%,
		rgba(6, 6, 8, 0) 100%
	);
	backdrop-filter: blur(12px);
}

.giant-rail__heading {
	display: flex;
	align-items: end;
	justify-content: space-between;
	gap: 0.75rem;
}

.giant-rail__eyebrow {
	font-size: 0.72rem;
	font-weight: 800;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: rgba(255, 255, 255, 0.46);
}

.giant-rail__title {
	font-size: 1rem;
	font-weight: 900;
	letter-spacing: -0.02em;
	color: #fff;
}

.giant-rail__hint {
	max-width: 28rem;
	font-size: 0.8rem;
	line-height: 1.5;
	color: var(--giant-muted);
}

.giant-rail__list {
	min-height: 0;
	display: grid;
	gap: 0.75rem;
	overflow-y: auto;
	padding-right: 0.1rem;
	padding-bottom: 0.35rem;
	scroll-padding-top: 5rem;
}

.giant-card {
	display: grid;
	grid-template-columns: auto 104px minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.85rem;
	width: 100%;
	padding: 0.8rem;
	border-radius: 1.15rem;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.08);
	text-align: left;
	color: #fff;
	cursor: pointer;
	transition:
		transform 180ms ease,
		background-color 180ms ease,
		border-color 180ms ease,
		box-shadow 180ms ease;
}

.giant-card:hover {
	transform: translateY(-1px);
	background: rgba(255, 255, 255, 0.06);
}

.giant-card--active {
	background:
		linear-gradient(135deg, rgba(255, 138, 91, 0.12), rgba(255, 211, 110, 0.06)),
		rgba(255, 255, 255, 0.06);
	border-color: rgba(255, 138, 91, 0.34);
	box-shadow: 0 14px 28px rgba(0, 0, 0, 0.18);
}

.giant-card:active {
	transform: scale(0.99);
}

.giant-card__index {
	align-self: stretch;
	display: flex;
	align-items: center;
	font-size: 0.7rem;
	font-weight: 900;
	letter-spacing: 0.18em;
	color: rgba(255, 255, 255, 0.34);
}

.giant-card__thumb {
	width: 104px;
	height: 76px;
	border-radius: 1rem;
	overflow: hidden;
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(255, 255, 255, 0.08);
}

.giant-card__image {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.giant-card__fallback {
	width: 100%;
	height: 100%;
	display: grid;
	place-items: center;
	color: rgba(255, 255, 255, 0.28);
}

.giant-card__copy {
	min-width: 0;
	display: grid;
	gap: 0.24rem;
}

.giant-card__heading {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.45rem;
}

.giant-card__name {
	font-size: 0.98rem;
	font-weight: 850;
	line-height: 1.22;
	color: #fff;
}

.giant-card__active-pill {
	display: inline-flex;
	align-items: center;
	min-height: 1.45rem;
	padding: 0.2rem 0.55rem;
	border-radius: 999px;
	background: var(--giant-accent-soft);
	color: #ffd8c7;
	font-size: 0.68rem;
	font-weight: 900;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.giant-card__category,
.giant-card__note {
	font-size: 0.78rem;
	line-height: 1.45;
}

.giant-card__category {
	color: rgba(255, 255, 255, 0.74);
}

.giant-card__note {
	color: rgba(255, 255, 255, 0.46);
}

.giant-card__favorite {
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	border-radius: 999px;
	color: rgba(255, 255, 255, 0.58);
}

.giant-preload {
	display: none;
}

@media (max-width: 639px) {
	.giant-shell {
		grid-template-rows: minmax(300px, 48svh) minmax(0, 1fr);
	}

	.giant-hero {
		padding: 0.75rem 0.75rem 0 0.75rem;
	}

	.giant-hero__panel {
		inset: auto 0.8rem 0.8rem 0.8rem;
	}

	.giant-hero__actions {
		grid-template-columns: 1fr;
	}

	.giant-rail {
		padding: 0.8rem;
	}

	.giant-card {
		grid-template-columns: 92px minmax(0, 1fr) auto;
	}

	.giant-card__index {
		display: none;
	}

	.giant-card__thumb {
		width: 92px;
		height: 72px;
	}
}

@media (min-width: 960px) and (min-aspect-ratio: 11/10) {
	.giant-shell {
		grid-template-columns: minmax(0, 1fr) 388px;
		grid-template-rows: minmax(0, 1fr);
	}

	.giant-hero {
		padding: 1rem 0 1rem 1rem;
	}

	.giant-hero__panel {
		max-width: min(33rem, calc(100% - 2rem));
	}

	.giant-rail {
		border-top: none;
		border-left: 1px solid rgba(255, 255, 255, 0.08);
		padding: 1rem 1rem 1rem 0.95rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.giant-card,
	.giant-hero__cta {
		transition: none !important;
	}
}
</style>
