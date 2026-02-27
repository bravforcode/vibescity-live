<!-- src/components/layout/SmartHeader.vue -->

<script setup lang="ts">
import {
	Coins,
	MapPin,
	Menu,
	Search,
	SlidersHorizontal,
	Sparkles,
	X,
} from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useCoinStore } from "../../store/coinStore";

// ═══════════════════════════════════════════════════════════════
// 📋 TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

interface Shop {
	id: string | number;
	name: string;
	category?: string;
	Image_URL1?: string;
	rating?: number;
	distance?: string;
	isOpen?: boolean;
	priceLevel?: number;
}

interface Props {
	isVibeNowCollapsed?: boolean;
	isDarkMode?: boolean;
	globalSearchQuery?: string;
	showSearchResults?: boolean;
	globalSearchResults?: Shop[];
	isImmersive?: boolean;
	isLoading?: boolean;
	layoutMode?: "split" | "full";
	safeTopInsetOverride?: number | null;
	splitWidth?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// 📦 PROPS & EMITS
// ═══════════════════════════════════════════════════════════════

const props = withDefaults(defineProps<Props>(), {
	isVibeNowCollapsed: false,
	isDarkMode: false,
	globalSearchQuery: "",
	showSearchResults: false,
	globalSearchResults: () => [],
	isImmersive: false,
	isLoading: false,
	layoutMode: "split",
	safeTopInsetOverride: null,
	splitWidth: null,
});

const emit = defineEmits<{
	"open-sidebar": [];
	"open-filter": [];
	"update:globalSearchQuery": [value: string];
	"update:showSearchResults": [value: boolean];
	"select-search-result": [shop: Shop];
	"haptic-tap": [];
	"open-daily-checkin": [];
}>();

// ═══════════════════════════════════════════════════════════════
// 🏪 STORES
// ═══════════════════════════════════════════════════════════════

const coinStore = useCoinStore();
const { t, te } = useI18n();
const tt = (key: string, fallback: string) => (te(key) ? t(key) : fallback);

// ═══════════════════════════════════════════════════════════════
// 📊 STATE
// ═══════════════════════════════════════════════════════════════

const localSearchQuery = ref(props.globalSearchQuery);
const searchInputRef = ref<HTMLInputElement | null>(null);
const resultsContainerRef = ref<HTMLDivElement | null>(null);
const selectedResultIndex = ref(-1);
const isSearchFocused = ref(false);
const isInteractingWithResults = ref(false);

// Debounce timeout reference for cleanup
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
let blurTimeout: ReturnType<typeof setTimeout> | null = null;
let lastHapticAt = 0;
const HAPTIC_COOLDOWN_MS = 80;

// ═══════════════════════════════════════════════════════════════
// 🧮 COMPUTED
// ═══════════════════════════════════════════════════════════════

const sortedSearchResults = computed(() => {
	if (!props.globalSearchResults?.length) return [];

	const deduped = [];
	const seen = new Set<string>();
	for (const item of props.globalSearchResults) {
		const key = `${String(item?.id ?? "").trim()}|${String(item?.name ?? "")
			.trim()
			.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(item);
	}

	return deduped
		.slice(0, 50) // Limit for performance
		.sort((a, b) => {
			// Sort by open status first, then by name
			if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
			return (a.name || "").localeCompare(b.name || "");
		});
});

// Show results only when appropriate
const hasSearchQuery = computed(() => localSearchQuery.value.trim().length > 0);
const shouldShowResults = computed(() => {
	return (
		props.showSearchResults && isSearchFocused.value && hasSearchQuery.value
	);
});

// Translated placeholder with fallback
const searchPlaceholder = computed(() => {
	return tt("nav.search", "Search vibes, events...");
});

const searchShortcutLabel = computed(() => {
	const nav =
		typeof navigator !== "undefined"
			? (navigator as Navigator & { userAgentData?: { platform?: string } })
			: null;
	const platform =
		nav != null
			? `${nav.userAgentData?.platform || ""} ${nav.userAgent || ""}`
			: "";
	return /(mac|iphone|ipad|ipod)/i.test(platform) ? "⌘K" : "Ctrl+K";
});
const filterAriaLabel = computed(() =>
	import.meta.env.VITE_E2E_MAP_REQUIRED === "true"
		? "Open filter menu"
		: tt("nav.openFilter", "เปิดตัวกรอง"),
);

const normalizedLayoutMode = computed(() =>
	props.layoutMode === "full" ? "full" : "split",
);

const headerStyle = computed(() => {
	const styleVars: Record<string, string> = {};
	const safeInset = Number(props.safeTopInsetOverride);
	if (Number.isFinite(safeInset)) {
		styleVars["--safe-top-inset"] = `${Math.max(0, safeInset)}px`;
	}
	const splitWidth = String(props.splitWidth || "").trim();
	if (splitWidth) {
		styleVars["--split-width"] = splitWidth;
	}
	return styleVars;
});

// Coin display with animation trigger and formatting
const displayCoins = computed(() => {
	const coins = coinStore.coins ?? 0;
	if (coins < 1000) {
		return coins.toString();
	} else if (coins < 1000000) {
		return `${(coins / 1000).toFixed(1).replace(/\.0$/, "")}K`;
	} else {
		return `${(coins / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
	}
});

const coinAnimationClass = ref("");

// Watch for coin changes to trigger animation
watch(
	() => coinStore.coins,
	(newVal, oldVal) => {
		if (newVal == null || oldVal == null) return;

		const diff = newVal - oldVal;
		if (diff > 0) {
			// Coins increased - trigger pulse animation
			coinAnimationClass.value =
				diff >= 10 ? "header-coins--celebrate" : "header-coins--earning";

			// Remove class after animation completes
			setTimeout(
				() => {
					coinAnimationClass.value = "";
				},
				diff >= 10 ? 1000 : 600,
			);
		}
	},
);

// ═══════════════════════════════════════════════════════════════
// 🔧 UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a debounced version of a function.
 */
const createDebouncedEmit = (delay: number) => {
	return (value: string) => {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}
		debounceTimeout = setTimeout(() => {
			emit("update:globalSearchQuery", value);
		}, delay);
	};
};

const debouncedEmit = createDebouncedEmit(150);
const clearBlurTimeout = () => {
	if (blurTimeout) {
		clearTimeout(blurTimeout);
		blurTimeout = null;
	}
};
const closeSearchResults = () => {
	isSearchFocused.value = false;
	emit("update:showSearchResults", false);
	selectedResultIndex.value = -1;
};

/**
 * Trigger haptic feedback if available
 */
const triggerHaptic = () => {
	emit("haptic-tap");

	const now = Date.now();
	if (now - lastHapticAt < HAPTIC_COOLDOWN_MS) return;
	lastHapticAt = now;
	if (typeof navigator !== "undefined" && "vibrate" in navigator) {
		navigator.vibrate(10);
	}
};

const formatDistance = (value: unknown) => {
	const distanceNum = Number(value);
	if (!Number.isFinite(distanceNum)) {
		return typeof value === "string" ? value : "";
	}
	if (distanceNum <= 0) return "";
	if (distanceNum < 1) return `${Math.round(distanceNum * 1000)}m`;
	return `${distanceNum.toFixed(1).replace(/\.0$/, "")}km`;
};

// ═══════════════════════════════════════════════════════════════
// 🎮 EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Handle search input with debouncing.
 */
const handleSearchInput = (event: Event) => {
	const target = event.target as HTMLInputElement;
	const value = target.value;

	localSearchQuery.value = value;
	debouncedEmit(value);

	// Reset selection when typing
	selectedResultIndex.value = -1;
};

/**
 * Handle search focus
 */
const handleSearchFocus = () => {
	clearBlurTimeout();
	isSearchFocused.value = true;
	emit("update:showSearchResults", true);
};

const markSearchResultPointerDown = () => {
	isInteractingWithResults.value = true;
	clearBlurTimeout();
};

const releaseSearchResultPointer = () => {
	requestAnimationFrame(() => {
		isInteractingWithResults.value = false;
	});
};

/**
 * Handle search blur with delay for click handling.
 */
const handleSearchBlur = () => {
	clearBlurTimeout();
	blurTimeout = setTimeout(() => {
		if (isInteractingWithResults.value) {
			blurTimeout = setTimeout(() => {
				if (
					typeof document === "undefined" ||
					document.activeElement !== searchInputRef.value
				) {
					closeSearchResults();
				}
			}, 120);
			return;
		}
		closeSearchResults();
	}, 260);
};

/**
 * Clear search input
 */
const clearSearch = () => {
	localSearchQuery.value = "";
	emit("update:globalSearchQuery", "");
	selectedResultIndex.value = -1;
	searchInputRef.value?.focus();
	triggerHaptic();
};

/**
 * Handle keyboard navigation in search results.
 */
const handleKeyDown = (event: KeyboardEvent) => {
	const resultsLength = sortedSearchResults.value.length;

	if (!shouldShowResults.value || resultsLength === 0) return;

	switch (event.key) {
		case "ArrowDown":
			event.preventDefault();
			selectedResultIndex.value = Math.min(
				selectedResultIndex.value + 1,
				resultsLength - 1,
			);
			scrollToSelectedResult();
			break;

		case "ArrowUp":
			event.preventDefault();
			selectedResultIndex.value = Math.max(selectedResultIndex.value - 1, -1);
			scrollToSelectedResult();
			break;

		case "Enter":
			event.preventDefault();
			if (selectedResultIndex.value >= 0) {
				selectResult(sortedSearchResults.value[selectedResultIndex.value]);
			}
			break;

		case "Escape":
			event.preventDefault();
			closeSearchResults();
			searchInputRef.value?.blur();
			break;
	}
};

/**
 * Scroll to keep selected result visible
 */
const scrollToSelectedResult = async () => {
	await nextTick();

	if (!resultsContainerRef.value || selectedResultIndex.value < 0) return;

	const selectedEl = resultsContainerRef.value.querySelector(
		`[data-result-index="${selectedResultIndex.value}"]`,
	) as HTMLElement;

	selectedEl?.scrollIntoView({
		block: "nearest",
		behavior: "smooth",
	});
};

/**
 * Select a search result
 */
const selectResult = (shop: Shop) => {
	clearBlurTimeout();
	emit("select-search-result", shop);
	emit("update:globalSearchQuery", shop.name || "");
	localSearchQuery.value = shop.name || "";
	closeSearchResults();
	releaseSearchResultPointer();
	triggerHaptic();
};

/**
 * Open sidebar with haptic
 */
const openSidebar = () => {
	emit("open-sidebar");
	triggerHaptic();
};

/**
 * Open filter with haptic
 */
const openFilter = () => {
	emit("open-filter");
	triggerHaptic();
};

// ═══════════════════════════════════════════════════════════════
// 👀 WATCHERS
// ═══════════════════════════════════════════════════════════════

// Sync local query with prop changes
watch(
	() => props.globalSearchQuery,
	(newVal) => {
		if (newVal !== localSearchQuery.value) {
			localSearchQuery.value = newVal;
		}
	},
);

// Reset selection when results change
watch(
	() => props.globalSearchResults,
	() => {
		selectedResultIndex.value = -1;
	},
);

const handleGlobalKeyDown = (e: KeyboardEvent) => {
	if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) return;
	e.preventDefault();
	const input = searchInputRef.value;
	if (!input) return;
	if (document.activeElement === input && isSearchFocused.value) {
		clearBlurTimeout();
		closeSearchResults();
		input.blur();
		return;
	}
	input.focus();
	isSearchFocused.value = true;
	emit("update:showSearchResults", true);
};

// ═══════════════════════════════════════════════════════════════
// 🔄 LIFECYCLE
// ═══════════════════════════════════════════════════════════════

onMounted(() => {
	if (typeof window === "undefined") return;
	window.addEventListener("keydown", handleGlobalKeyDown);
});

onUnmounted(() => {
	if (typeof window !== "undefined") {
		window.removeEventListener("keydown", handleGlobalKeyDown);
	}
	if (debounceTimeout) {
		clearTimeout(debounceTimeout);
		debounceTimeout = null;
	}
	clearBlurTimeout();
});
</script>

<template>
  <header
    data-testid="header"
    role="banner"
    class="smart-header"
    :style="headerStyle"
    :class="{
      'smart-header--collapsed': isVibeNowCollapsed,
      'smart-header--immersive': isImmersive,
      'smart-header--dark': isDarkMode,
      'smart-header--split': normalizedLayoutMode === 'split',
      'smart-header--full': normalizedLayoutMode === 'full',
    }"
  >
    <!-- ═══════════════════════════════════════════════════════════════
         🔝 TOP ROW: Navigation + Search + Actions
         ═══════════════════════════════════════════════════════════════ -->
    <div class="header-row">
      <button
        data-testid="btn-menu"
        type="button"
        :aria-label="tt('nav.openMenu', 'เปิดเมนู')"
        aria-haspopup="true"
        class="header-btn header-btn--menu"
        @click="openSidebar"
      >
        <Menu class="header-btn__icon header-btn__icon--rotate" />
        <span class="header-btn__pulse" />
      </button>

      <!-- Search Bar -->
      <div class="search-wrapper" role="search">
        <div
          class="search-container"
          :class="{ 'search-container--focused': isSearchFocused }"
        >
          <!-- Search Icon -->
          <Search class="search-icon" aria-hidden="true" />

          <!-- Search Input -->
          <input
            ref="searchInputRef"
            data-testid="search-input"
            type="search"
            :value="localSearchQuery"
            :placeholder="searchPlaceholder"
            :aria-label="searchPlaceholder"
            aria-autocomplete="both"
            role="combobox"
            aria-haspopup="listbox"
            :aria-expanded="shouldShowResults"
            aria-controls="search-results"
            class="search-input"
            @input="handleSearchInput"
            @focus="handleSearchFocus"
            @blur="handleSearchBlur"
            @keydown="handleKeyDown"
          />

          <!-- Keyboard Shortcut Hint -->
          <kbd
            v-if="!localSearchQuery && !isSearchFocused"
            class="search-kbd"
            aria-hidden="true"
          >
            {{ searchShortcutLabel }}
          </kbd>

          <!-- Clear Button -->
          <Transition name="scale-fade">
            <button
              v-if="localSearchQuery"
              type="button"
              :aria-label="tt('nav.clearSearch', 'ล้างการค้นหา')"
              class="search-clear"
              @click="clearSearch"
            >
              <X class="search-clear__icon" />
            </button>
          </Transition>

          <!-- Loading Indicator -->
          <div
            v-if="isLoading"
            class="search-loader"
            role="status"
            :aria-label="tt('nav.searching', 'กำลังค้นหา...')"
          >
            <Sparkles class="search-loader__icon" />
          </div>
        </div>

        <!-- Search Results Dropdown -->
        <Transition name="dropdown">
          <div
            v-if="shouldShowResults"
            id="search-results"
            ref="resultsContainerRef"
            role="listbox"
            :aria-label="tt('nav.searchResults', 'ผลการค้นหา')"
            class="search-results"
          >
            <!-- Results Header -->
            <div class="search-results__header">
              <span class="search-results__count">
                {{ sortedSearchResults.length }}
                {{ tt("nav.placesFound", "places") }}
              </span>
            </div>

            <!-- Result Items -->
            <button
              v-for="(shop, index) in sortedSearchResults"
              :key="shop.id"
              data-testid="search-result"
              type="button"
              :data-result-index="index"
              role="option"
              :aria-selected="selectedResultIndex === index"
              class="search-result"
              :class="{
                'search-result--selected': selectedResultIndex === index,
              }"
              @pointerdown="markSearchResultPointerDown"
              @mousedown="markSearchResultPointerDown"
              @touchstart.passive="markSearchResultPointerDown"
              @click="selectResult(shop)"
              @mouseleave="releaseSearchResultPointer"
              @mouseenter="selectedResultIndex = index"
            >
              <!-- Shop Image -->
              <div class="search-result__image">
                <img
                  v-if="shop.Image_URL1"
                  :src="shop.Image_URL1"
                  :alt="shop.name || ''"
                  loading="lazy"
                  class="search-result__img"
                />
                <MapPin
                  v-else
                  class="search-result__placeholder"
                  aria-hidden="true"
                />
              </div>

              <!-- Shop Info -->
              <div class="search-result__info">
                <h4 class="search-result__name">
                  {{ shop.name }}
                </h4>
                <div class="search-result__meta">
                  <span v-if="shop.category" class="search-result__category">
                    {{ shop.category }}
                  </span>
                  <span
                    v-if="formatDistance(shop.distance)"
                    class="search-result__distance"
                  >
                    {{ formatDistance(shop.distance) }}
                  </span>
                </div>
              </div>

              <!-- Status Badge -->
              <div
                v-if="shop.isOpen !== undefined"
                class="search-result__status"
                :class="
                  shop.isOpen
                    ? 'search-result__status--open'
                    : 'search-result__status--closed'
                "
              >
                {{
                  shop.isOpen
                    ? tt("common.open_now", "Open Now")
                    : tt("common.closed", "Closed")
                }}
              </div>
            </button>

            <!-- No Results State -->
            <div
              v-if="sortedSearchResults.length === 0"
              class="search-results__empty"
            >
              <Search class="search-results__empty-icon" />
              <p>{{ tt("nav.noResults", "ไม่พบผลลัพธ์") }}</p>
            </div>
          </div>
        </Transition>
      </div>

      <button
        data-testid="coin-counter"
        :class="[
          'header-coins header-coins--compact header-coins--inline cursor-pointer active:scale-90 transition-transform',
          coinAnimationClass,
        ]"
        :aria-label="`${displayCoins} ${tt('nav.coins', 'เหรียญ')}`"
        role="button"
        @click="
          emit('open-daily-checkin');
          triggerHaptic();
        "
      >
        <Coins
          class="header-coins__icon header-coins__icon--small"
          aria-hidden="true"
        />
        <span class="header-coins__value header-coins__value--small">{{
          displayCoins
        }}</span>
      </button>

      <!-- Filter Button -->
      <button
        data-testid="btn-filter"
        type="button"
        :aria-label="filterAriaLabel"
        aria-haspopup="true"
        class="header-btn header-btn--filter"
        @click="openFilter"
      >
        <SlidersHorizontal class="header-btn__icon header-btn__icon--tilt" />
      </button>
    </div>
  </header>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════
   🎨 CSS CUSTOM PROPERTIES (Design Tokens)
   ═══════════════════════════════════════════════════════════════ */

.smart-header {
  /* Colors - Entertainment/Festival Theme */
  --header-bg: rgba(10, 10, 20, 0.85);
  --header-border: var(--vc-color-border-glass);
  --header-blur: 24px;

  /* Button Colors */
  --btn-bg: rgba(255, 255, 255, 0.08);
  --btn-bg-hover: rgba(255, 255, 255, 0.15);
  --btn-border: rgba(255, 255, 255, 0.12);
  --btn-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);

  /* Search Colors */
  --search-bg: rgba(255, 255, 255, 0.06);
  --search-bg-focus: rgba(255, 255, 255, 0.1);
  --search-border-focus: rgba(0, 240, 255, 0.55);
  --search-glow: rgba(0, 240, 255, 0.25);

  /* Accent Colors - Vibrant Entertainment */
  --accent-primary: var(--vc-color-brand-primary);
  --accent-secondary: var(--vc-color-accent-pink);
  --accent-gold: var(--vc-color-accent-yellow);
  --accent-cyan: var(--vc-color-brand-primary);

  /* Text Colors */
  --text-primary: var(--vc-color-text-primary);
  --text-secondary: var(--vc-color-text-secondary);
  --text-muted: var(--vc-color-text-muted);

  /* Spacing */
  --header-padding-x: 1rem;
  --header-padding-y: 1rem;
  --safe-top-inset: env(safe-area-inset-top);
  --gap-sm: 0.5rem;
  --gap-md: 0.75rem;

  /* Sizing */
  --btn-size: 44px;
  --search-height: 44px;
  --split-width: clamp(320px, 52vw, 860px);
  --border-radius: 22px;
  --border-radius-lg: 1rem;

  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ═══════════════════════════════════════════════════════════════
   📦 HEADER CONTAINER
   ═══════════════════════════════════════════════════════════════ */

.smart-header {
  position: fixed;
  top: 0;
  left: 0;
  right: auto;
  width: 100%;
  min-height: 84px;
  z-index: 5200;
  pointer-events: none;
  transform: translateY(0);
  transition: transform var(--transition-base);
  will-change: transform;
}

.smart-header--split {
  width: min(100vw, var(--split-width));
  max-width: 100vw;
}

.smart-header--full {
  right: 0;
  width: auto;
}

.smart-header--collapsed {
  transform: translateY(-100%);
}

.header-row {
  position: relative;
  z-index: 5300;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  min-height: 64px;
  gap: var(--gap-md);
  padding: var(--header-padding-y) var(--header-padding-x);
  padding-top: max(var(--header-padding-y), var(--safe-top-inset));
  width: 100%;
}

/* ═══════════════════════════════════════════════════════════════
   🔘 HEADER BUTTONS
   ═══════════════════════════════════════════════════════════════ */

.header-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--btn-size);
  height: var(--btn-size);
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--btn-bg);
  backdrop-filter: blur(var(--header-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--header-blur)) saturate(180%);
  border: 1px solid var(--btn-border);
  color: var(--text-primary);
  box-shadow: var(--btn-shadow);
  pointer-events: auto;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-spring),
    box-shadow var(--transition-base);
  will-change: transform;
  -webkit-tap-highlight-color: transparent;
}

.header-btn:hover {
  background: var(--btn-bg-hover);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.1);
}

.header-btn:active {
  transform: scale(0.92);
}

.header-btn:focus-visible {
  outline: none;
  box-shadow:
    var(--btn-shadow),
    0 0 0 3px var(--search-glow);
}

.header-btn__icon {
  width: 20px;
  height: 20px;
  transition: transform var(--transition-spring);
}

.header-btn:hover .header-btn__icon--rotate {
  transform: rotate(180deg);
}

.header-btn:hover .header-btn__icon--tilt {
  transform: rotate(90deg);
}

/* Menu Button Pulse Effect */
.header-btn__pulse {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    var(--accent-primary),
    var(--accent-secondary)
  );
  opacity: 0;
  z-index: -1;
  animation: pulse-ring 2s ease-out infinite;
}

@keyframes pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.4;
  }
  100% {
    transform: scale(1.3);
    opacity: 0;
  }
}

/* ═══════════════════════════════════════════════════════════════
   🔍 SEARCH BAR
   ═══════════════════════════════════════════════════════════════ */

.search-wrapper {
  flex: 1;
  min-width: 0;
  width: 0;
  max-width: clamp(220px, 44vw, 760px);
  position: relative;
  z-index: 5400;
  pointer-events: auto;
}

.smart-header--split .search-wrapper {
  max-width: min(100%, 640px);
}

.smart-header--full .search-wrapper {
  max-width: none;
}

.search-container {
  display: flex;
  align-items: center;
  height: var(--search-height);
  padding: 0 1rem;
  border-radius: var(--border-radius);
  background: var(--search-bg);
  backdrop-filter: blur(var(--header-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--header-blur)) saturate(180%);
  border: 1px solid var(--header-border);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-base);
}

.search-container--focused {
  background: var(--search-bg-focus);
  border-color: var(--search-border-focus);
  box-shadow:
    0 4px 32px rgba(0, 0, 0, 0.3),
    0 0 0 4px var(--search-glow),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.search-icon {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-right: var(--gap-sm);
  transition: color var(--transition-fast);
}

.search-container--focused .search-icon {
  color: var(--accent-primary);
}

.search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  caret-color: var(--accent-primary);
}

.search-input::placeholder {
  color: var(--text-muted);
}

/* Remove default search styling */
.search-input::-webkit-search-cancel-button,
.search-input::-webkit-search-decoration {
  display: none;
}

.search-kbd {
  display: flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-muted);
  font-family: var(--font-body, "Prompt", "Sarabun", system-ui, sans-serif);
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: var(--gap-sm);
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

.search-clear:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.search-clear__icon {
  width: 14px;
  height: 14px;
}

.search-loader {
  margin-left: var(--gap-sm);
}

.search-loader__icon {
  width: 16px;
  height: 16px;
  color: var(--accent-primary);
  animation: sparkle 1s ease-in-out infinite;
}

@keyframes sparkle {
  0%,
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.9) rotate(180deg);
  }
}

/* ═══════════════════════════════════════════════════════════════
   📋 SEARCH RESULTS DROPDOWN
   ═══════════════════════════════════════════════════════════════ */

.search-results {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  width: 100%;
  z-index: 5500;
  max-height: min(60vh, calc(100vh - var(--safe-top-inset) - 120px));
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  border-radius: var(--border-radius-lg);
  background: rgba(10, 10, 20, 0.95);
  backdrop-filter: blur(32px) saturate(200%);
  -webkit-backdrop-filter: blur(32px) saturate(200%);
  border: 1px solid var(--header-border);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
}

.search-results__header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(10, 10, 20, 0.98);
  border-bottom: 1px solid var(--header-border);
  z-index: 1;
}

.search-results__count {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.search-result {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 56px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background var(--transition-fast);
}

.search-result:last-child {
  border-bottom: none;
}

.search-result:hover,
.search-result--selected {
  background: rgba(255, 255, 255, 0.06);
}

.search-result:focus-visible {
  outline: none;
  background: rgba(0, 240, 255, 0.14);
}

.search-result--selected {
  background: linear-gradient(
    90deg,
    rgba(0, 240, 255, 0.14),
    rgba(255, 0, 170, 0.1)
  );
}

.search-result__image {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 12px;
  background: linear-gradient(
    135deg,
    rgba(0, 240, 255, 0.18),
    rgba(188, 19, 254, 0.18)
  );
  overflow: hidden;
}

.search-result__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.search-result__placeholder {
  width: 24px;
  height: 24px;
  color: var(--text-muted);
}

.search-result__info {
  flex: 1;
  min-width: 0;
}

.search-result__name {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-result__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.search-result__category {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 132px;
}

.search-result__distance {
  font-size: 0.7rem;
  color: var(--accent-cyan);
  font-weight: 500;
  white-space: nowrap;
}

.search-result__status {
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.search-result__status--open {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.search-result__status--closed {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.search-results__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--text-muted);
}

.search-results__empty-icon {
  width: 32px;
  height: 32px;
  margin-bottom: 0.5rem;
  opacity: 0.5;
}

/* ═══════════════════════════════════════════════════════════════
   🪙 COIN COUNTER
   ═══════════════════════════════════════════════════════════════ */

.header-coins {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
  height: var(--btn-size);
  padding: 0 1rem;
  border-radius: var(--border-radius);
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.15),
    rgba(245, 158, 11, 0.1)
  );
  backdrop-filter: blur(var(--header-blur));
  -webkit-backdrop-filter: blur(var(--header-blur));
  border: 1px solid rgba(251, 191, 36, 0.25);
  pointer-events: auto;
  overflow: hidden;
}

.header-coins__icon {
  width: 18px;
  height: 18px;
  color: var(--accent-gold);
  filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.5));
  animation: coin-bounce 2s ease-in-out infinite;
}

@keyframes coin-bounce {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-2px) rotate(5deg);
  }
}

.header-coins__value {
  font-size: 0.8rem;
  font-weight: 800;
  color: #fef3c7;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  letter-spacing: 0.02em;
}

/* Compact Coin Counter (Below Menu Button) */
.header-coins--compact {
  height: auto;
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  gap: 0.25rem;
}

.header-coins--inline {
  flex-shrink: 0;
}

.header-coins__icon--small {
  width: 12px;
  height: 12px;
}

.header-coins__value--small {
  font-size: 0.65rem;
}

/* ═══════════════════════════════════════════════════════════════
   🎭 IMMERSIVE MODE
   ═══════════════════════════════════════════════════════════════ */

.smart-header--immersive .header-btn,
.smart-header--immersive .search-container,
.smart-header--immersive .header-coins {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

/* ═══════════════════════════════════════════════════════════════
   🎬 ANIMATIONS
   ═══════════════════════════════════════════════════════════════ */

/* Scale Fade for Clear Button */
.scale-fade-enter-active {
  transition:
    opacity 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.scale-fade-leave-active {
  transition:
    opacity 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.scale-fade-enter-from,
.scale-fade-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

/* Dropdown Animation */
.dropdown-enter-active {
  transition:
    opacity 350ms cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dropdown-leave-active {
  transition:
    opacity 200ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 200ms cubic-bezier(0.4, 0, 0.2, 1),
    filter 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.96);
  filter: blur(8px);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
  filter: blur(4px);
}

/* coin styles intentionally defined once above to keep layout stable */

/* Pulse Animation for Earning (add .header-coins--earning class via JS) */
.header-coins--earning {
  animation: coin-earn-pulse 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes coin-earn-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 rgba(251, 191, 36, 0);
  }
  50% {
    transform: scale(1.15);
    box-shadow:
      0 0 30px rgba(251, 191, 36, 0.6),
      0 0 60px rgba(251, 191, 36, 0.3);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 rgba(251, 191, 36, 0);
  }
}

/* Celebrate Animation (add .header-coins--celebrate for big wins) */
.header-coins--celebrate {
  animation: coin-celebrate 1s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes coin-celebrate {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
  }
  25% {
    transform: scale(1.2) rotate(-5deg);
  }
  50% {
    transform: scale(1.3) rotate(5deg);
  }
  75% {
    transform: scale(1.15) rotate(-3deg);
  }
}

/* ═══════════════════════════════════════════════════════════════
   📱 RESPONSIVE & ACCESSIBILITY
   ═══════════════════════════════════════════════════════════════ */

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Touch device optimizations */
@media (hover: none) and (pointer: coarse) {
  .header-btn:hover {
    transform: none;
    background: var(--btn-bg);
  }

  .header-btn:hover .header-btn__icon--rotate,
  .header-btn:hover .header-btn__icon--tilt {
    transform: none;
  }

  .header-btn:active {
    transform: scale(0.95);
    background: var(--btn-bg-hover);
  }

  .search-kbd {
    display: none;
  }
}

/* Small screens */
@media (max-width: 768px) {
  .smart-header {
    min-height: 84px;
  }
}

@media (max-width: 380px) {
  .header-row {
    gap: 0.5rem;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  .header-coins__value {
    font-size: 0.75rem;
  }

  .header-coins {
    padding: 0.2rem 0.45rem;
  }

  .search-kbd {
    display: none;
  }

  .search-container {
    padding: 0 0.65rem;
  }
}

/* Custom scrollbar for results */
.search-results::-webkit-scrollbar {
  width: 6px;
}

.search-results::-webkit-scrollbar-track {
  background: transparent;
}

.search-results::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.search-results::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
