<script setup>
/**
 * SidebarDrawer.vue
 * Mobile-first sidebar with a11y dialog behavior and lightweight motion.
 */

import {
	BarChart3,
	CalendarDays,
	ChevronRight,
	Gift,
	Handshake,
	Heart,
	Megaphone,
	Settings,
	Volume2,
	VolumeX,
	X,
	Zap,
} from "lucide-vue-next";
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogA11y } from "@/composables/useDialogA11y";
import { useHaptics } from "@/composables/useHaptics";
import LanguageToggle from "./LanguageToggle.vue";

const SettingsPanel = defineAsyncComponent(() => import("./SettingsPanel.vue"));

const { t } = useI18n();

const DEFAULT_USER = Object.freeze({
	name: "Explorer",
	level: 1,
	coins: 0,
	avatar: null,
});

const props = defineProps({
	isOpen: { type: Boolean, default: false },
	userStats: {
		type: Object,
		default: () => ({
			name: "Explorer",
			level: 1,
			coins: 0,
			avatar: null,
		}),
	},
	isMuted: { type: Boolean, default: false },
	currentLanguage: { type: String, default: "en" },
	showPartnerProgram: { type: Boolean, default: false },
});

const emit = defineEmits([
	"close",
	"navigate",
	"toggle-mute",
	"toggle-language",
	"open-merchant",
	"open-sos",
	"take-me-home",
	"open-dashboard",
	"open-partner",
	"open-daily-checkin",
	"open-lucky-wheel",
	"open-favorites",
]);

const { selectFeedback, successFeedback } = useHaptics();

// eslint-disable-next-line no-undef
const appVersion = __APP_VERSION__;

const safeUser = computed(() => {
	const incoming =
		props.userStats && typeof props.userStats === "object"
			? props.userStats
			: DEFAULT_USER;
	const name =
		typeof incoming.name === "string" && incoming.name.trim().length > 0
			? incoming.name.trim()
			: DEFAULT_USER.name;

	return {
		...DEFAULT_USER,
		...incoming,
		name,
	};
});

const userInitial = computed(() => safeUser.value.name.charAt(0).toUpperCase());
const userLevel = computed(() => Number(safeUser.value.level || 1));
const userCoins = computed(() => Number(safeUser.value.coins || 0));
const xpProgress = computed(() => Math.min(100, userCoins.value % 100));

const drawerRef = ref(null);
const showSettingsPanel = ref(false);

useDialogA11y({
	isOpen: () => props.isOpen,
	containerRef: drawerRef,
	onClose: () => emit("close"),
});

watch(
	() => props.isOpen,
	(open) => {
		if (!open) {
			showSettingsPanel.value = false;
		}
	},
);

const close = () => {
	selectFeedback();
	emit("close");
};

const go = (eventName) => {
	successFeedback();
	emit("close");
	requestAnimationFrame(() => emit(eventName));
};

defineExpose({ close });
</script>

<template>
  <div class="sd-root" role="presentation" data-testid="sidebar-drawer-shell">
    <Transition name="sd-backdrop">
      <div
        v-if="isOpen"
        class="sd-backdrop"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <Transition name="sd-panel">
      <aside
        v-if="isOpen"
        ref="drawerRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sd-title"
        data-testid="sidebar-drawer"
        class="sd-panel"
      >
        <header class="sd-header">
          <div class="sd-avatar-ring">
            <div class="sd-avatar-inner">
              <img
                v-if="safeUser.avatar"
                :src="safeUser.avatar"
                alt="User avatar"
                class="sd-avatar-img"
              >
              <span v-else class="sd-avatar-initial" aria-hidden="true">{{ userInitial }}</span>
            </div>
          </div>

          <div class="sd-user-info">
            <h2 id="sd-title" class="sd-user-name">{{ safeUser.name }}</h2>
            <div class="sd-user-meta">
              <span class="sd-level-badge">
                <Zap class="w-3 h-3" aria-hidden="true" />
                Lv.{{ userLevel }}
              </span>
              <span class="sd-coin-badge" :aria-label="`${userCoins} coins`">
                🪙 {{ userCoins.toLocaleString() }}
              </span>
            </div>
            <div
              class="sd-xp-track"
              role="progressbar"
              :aria-valuenow="xpProgress"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="`XP progress ${xpProgress}%`"
            >
              <div class="sd-xp-fill" :style="{ width: `${xpProgress}%` }" />
            </div>
          </div>

          <button class="sd-close-btn" aria-label="Close sidebar" @click="close">
            <X class="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div class="sd-body" role="navigation">
          <section class="sd-section">
            <h3 class="sd-section-title">{{ t("sidebar.rewards") }}</h3>

            <button
              type="button"
              class="sd-item sd-item--purple"
              data-testid="sidebar-action-daily-checkin"
              aria-label="Open daily check-in"
              @click="go('open-daily-checkin')"
            >
              <span class="sd-item-icon sd-item-icon--purple">
                <CalendarDays class="w-5 h-5" aria-hidden="true" />
              </span>
              <span class="sd-item-text">
                <span class="sd-item-label">{{ t("checkin.title") }}</span>
                <span class="sd-item-sub">{{ t("sidebar.claim_streak") }}</span>
              </span>
              <ChevronRight class="sd-item-chevron" aria-hidden="true" />
            </button>

            <button
              type="button"
              class="sd-item sd-item--amber"
              aria-label="Open lucky wheel"
              @click="go('open-lucky-wheel')"
            >
              <span class="sd-item-icon sd-item-icon--amber">
                <Gift class="w-5 h-5" aria-hidden="true" />
              </span>
              <span class="sd-item-text">
                <span class="sd-item-label">{{ t("sidebar.lucky_wheel") }}</span>
                <span class="sd-item-sub">{{ t("sidebar.spin_prizes") }}</span>
              </span>
              <ChevronRight class="sd-item-chevron" aria-hidden="true" />
            </button>
          </section>

          <section class="sd-section">
            <h3 class="sd-section-title">{{ t("sidebar.my_vibes") }}</h3>

            <button
              type="button"
              class="sd-item sd-item--rose"
              data-testid="sidebar-action-favorites"
              :aria-label="t('sidebar.favorites')"
              @click="go('open-favorites')"
            >
              <span class="sd-item-icon sd-item-icon--rose">
                <Heart class="w-5 h-5" aria-hidden="true" />
              </span>
              <span class="sd-item-text">
                <span class="sd-item-label">{{ t("sidebar.favorites") }}</span>
                <span class="sd-item-sub">{{ t("sidebar.favorites_desc") }}</span>
              </span>
              <ChevronRight class="sd-item-chevron" aria-hidden="true" />
            </button>
          </section>

          <section class="sd-section">
            <h3 class="sd-section-title">{{ t("sidebar.business") || "Business" }}</h3>

            <button
              type="button"
              class="sd-item sd-item--blue"
              data-testid="sidebar-action-promote-shop"
              aria-label="Promote your shop"
              @click="go('open-merchant')"
            >
              <span class="sd-item-icon sd-item-icon--blue">
                <Megaphone class="w-5 h-5" aria-hidden="true" />
              </span>
              <span class="sd-item-text">
                <span class="sd-item-label">{{ t("sidebar.promote_shop") }}</span>
                <span class="sd-item-sub">{{ t("sidebar.promote_desc") }}</span>
              </span>
              <ChevronRight class="sd-item-chevron" aria-hidden="true" />
            </button>

            <button
              type="button"
              class="sd-item sd-item--amber"
              data-testid="sidebar-action-owner-dashboard"
              aria-label="Owner dashboard"
              @click="go('open-dashboard')"
            >
              <span class="sd-item-icon sd-item-icon--amber">
                <BarChart3 class="w-5 h-5" aria-hidden="true" />
              </span>
              <span class="sd-item-text">
                <span class="sd-item-label">{{ t("sidebar.owner_dashboard") }}</span>
                <span class="sd-item-sub">{{ t("sidebar.owner_desc") }}</span>
              </span>
              <ChevronRight class="sd-item-chevron" aria-hidden="true" />
            </button>

            <button
              v-if="showPartnerProgram"
              type="button"
              class="sd-item sd-item--cyan"
              data-testid="sidebar-action-partner-program"
              aria-label="Partner program"
              @click="go('open-partner')"
            >
              <span class="sd-item-icon sd-item-icon--cyan">
                <Handshake class="w-5 h-5" aria-hidden="true" />
              </span>
              <span class="sd-item-text">
                <span class="sd-item-label">{{ t("sidebar.partner_program") }}</span>
                <span class="sd-item-sub">{{ t("sidebar.partner_desc") }}</span>
              </span>
              <ChevronRight class="sd-item-chevron" aria-hidden="true" />
            </button>
          </section>

          <section class="sd-section sd-section--system">
            <h3 class="sd-section-title">{{ t("profile.system") }}</h3>

            <button
              type="button"
              role="switch"
              :aria-checked="!isMuted"
              :aria-label="isMuted ? 'Enable sound' : 'Disable sound'"
              class="sd-item sd-item--ghost"
              @click="emit('toggle-mute'); selectFeedback();"
            >
              <span class="sd-item-icon sd-item-icon--ghost">
                <component :is="isMuted ? VolumeX : Volume2" class="w-5 h-5" aria-hidden="true" />
              </span>
              <span class="sd-item-text">
                <span class="sd-item-label">{{ isMuted ? t("menu.sound_off") : t("menu.sound_on") }}</span>
              </span>
              <span
                class="sd-toggle"
                :class="isMuted ? 'sd-toggle--off' : 'sd-toggle--on'"
                aria-hidden="true"
              >
                <span class="sd-toggle-thumb" :class="isMuted ? 'translate-x-0' : 'translate-x-5'" />
              </span>
            </button>

            <div class="px-1">
              <LanguageToggle :key="currentLanguage" class="w-full justify-between" />
            </div>

            <button
              type="button"
              class="sd-item sd-item--ghost"
              data-testid="sidebar-open-settings"
              aria-label="Open settings"
              @click="showSettingsPanel = true; selectFeedback();"
            >
              <span class="sd-item-icon sd-item-icon--ghost">
                <Settings class="w-5 h-5" aria-hidden="true" />
              </span>
              <span class="sd-item-text">
                <span class="sd-item-label">{{ t("nav.settings") }}</span>
              </span>
              <ChevronRight class="sd-item-chevron" aria-hidden="true" />
            </button>
          </section>
        </div>

        <SettingsPanel
          v-if="showSettingsPanel"
          :is-open="showSettingsPanel"
          @close="showSettingsPanel = false"
        />

        <footer class="sd-footer">
          <p class="sd-version">{{ t("profile.version", { version: appVersion }) }}</p>
        </footer>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.sd-root {
  position: relative;
  z-index: 6000;
  pointer-events: none;
}

.sd-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0 0 0 / 0.65);
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.sd-panel {
  position: fixed;
  inset-block: 0;
  left: 0;
  width: min(320px, 88vw);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  background: linear-gradient(160deg, rgba(18, 24, 52, 0.97) 0%, rgba(8, 12, 28, 0.98) 100%);
  border-right: 1px solid rgba(255 255 255 / 0.08);
  backdrop-filter: blur(24px) saturate(180%);
  box-shadow: 4px 0 40px rgba(0 0 0 / 0.6), 1px 0 0 rgba(255 255 255 / 0.04) inset;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  overflow: hidden;
  contain: layout paint style;
}

.sd-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 20px 16px 16px;
  border-bottom: 1px solid rgba(255 255 255 / 0.06);
  background: radial-gradient(ellipse 180% 120% at 50% -20%, rgba(99 102 241 / 0.15), transparent 60%);
}

.sd-avatar-ring {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  padding: 2px;
  background: linear-gradient(135deg, #6366f1, #ec4899, #06b6d4);
  box-shadow: 0 0 16px rgba(99 102 241 / 0.4);
}

.sd-avatar-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  background: #0a0e1e;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sd-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sd-avatar-initial {
  font-size: 1.25rem;
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.02em;
}

.sd-user-info {
  flex: 1;
  min-width: 0;
}

.sd-user-name {
  font-size: 0.95rem;
  font-weight: 800;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
  margin-bottom: 4px;
}

.sd-user-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.sd-level-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(99 102 241 / 0.25);
  border: 1px solid rgba(99 102 241 / 0.35);
  font-size: 10px;
  font-weight: 800;
  color: #a5b4fc;
}

.sd-coin-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(251 191 36 / 0.18);
  border: 1px solid rgba(251 191 36 / 0.3);
  font-size: 10px;
  font-weight: 800;
  color: #fcd34d;
}

.sd-xp-track {
  height: 4px;
  border-radius: 999px;
  background: rgba(255 255 255 / 0.08);
  overflow: hidden;
}

.sd-xp-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #6366f1, #ec4899);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.sd-close-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255 255 255 / 0.55);
  background: rgba(255 255 255 / 0.06);
  border: 1px solid rgba(255 255 255 / 0.08);
  transition: background 0.15s, color 0.15s, transform 0.12s;
}

.sd-close-btn:hover {
  background: rgba(255 255 255 / 0.12);
  color: #fff;
}

.sd-close-btn:active {
  transform: scale(0.9);
}

.sd-close-btn:focus-visible {
  outline: 2px solid rgba(99 102 241 / 0.7);
  outline-offset: 2px;
}

.sd-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 12px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scrollbar-width: none;
}

.sd-body::-webkit-scrollbar {
  display: none;
}

.sd-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 12px;
}

.sd-section--system {
  margin-top: auto;
}

.sd-section-title {
  padding: 0 8px 4px;
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(255 255 255 / 0.28);
}

.sd-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 10px;
  border-radius: 14px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.18s, border-color 0.18s, transform 0.12s, box-shadow 0.18s;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  will-change: transform;
}

.sd-item:active {
  transform: scale(0.98) translateZ(0);
}

.sd-item:focus-visible {
  outline: 2px solid rgba(99 102 241 / 0.7);
  outline-offset: 1px;
}

.sd-item--ghost {
  background: rgba(255 255 255 / 0.04);
  border-color: rgba(255 255 255 / 0.06);
}

.sd-item--ghost:hover {
  background: rgba(255 255 255 / 0.08);
}

.sd-item--purple {
  background: linear-gradient(100deg, rgba(109 40 217 / 0.22), rgba(192 38 211 / 0.18));
  border-color: rgba(139 92 246 / 0.25);
}

.sd-item--purple:hover {
  background: linear-gradient(100deg, rgba(109 40 217 / 0.35), rgba(192 38 211 / 0.3));
}

.sd-item--amber {
  background: linear-gradient(100deg, rgba(217 119 6 / 0.22), rgba(234 88 12 / 0.18));
  border-color: rgba(251 191 36 / 0.25);
}

.sd-item--amber:hover {
  background: linear-gradient(100deg, rgba(217 119 6 / 0.35), rgba(234 88 12 / 0.3));
}

.sd-item--rose {
  background: linear-gradient(100deg, rgba(225 29 72 / 0.22), rgba(236 72 153 / 0.18));
  border-color: rgba(244 63 94 / 0.25);
}

.sd-item--rose:hover {
  background: linear-gradient(100deg, rgba(225 29 72 / 0.35), rgba(236 72 153 / 0.3));
}

.sd-item--blue {
  background: linear-gradient(100deg, rgba(37 99 235 / 0.22), rgba(79 70 229 / 0.18));
  border-color: rgba(96 165 250 / 0.25);
}

.sd-item--blue:hover {
  background: linear-gradient(100deg, rgba(37 99 235 / 0.35), rgba(79 70 229 / 0.3));
}

.sd-item--cyan {
  background: linear-gradient(100deg, rgba(8 145 178 / 0.22), rgba(6 182 212 / 0.18));
  border-color: rgba(34 211 238 / 0.25);
}

.sd-item--cyan:hover {
  background: linear-gradient(100deg, rgba(8 145 178 / 0.35), rgba(6 182 212 / 0.3));
}

.sd-item-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.sd-item-icon--purple {
  background: rgba(109 40 217 / 0.55);
}

.sd-item-icon--amber {
  background: rgba(217 119 6 / 0.55);
}

.sd-item-icon--rose {
  background: rgba(225 29 72 / 0.55);
}

.sd-item-icon--blue {
  background: rgba(37 99 235 / 0.55);
}

.sd-item-icon--cyan {
  background: rgba(8 145 178 / 0.55);
}

.sd-item-icon--ghost {
  background: rgba(255 255 255 / 0.08);
  color: rgba(255 255 255 / 0.65);
}

.sd-item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sd-item-label {
  font-size: 0.875rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sd-item-sub {
  font-size: 10px;
  color: rgba(255 255 255 / 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sd-item-chevron {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: rgba(255 255 255 / 0.28);
  transition: transform 0.15s, color 0.15s;
}

.sd-item:hover .sd-item-chevron {
  transform: translateX(2px);
  color: rgba(255 255 255 / 0.55);
}

.sd-toggle {
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  padding: 2px;
  transition: background 0.2s;
}

.sd-toggle--on {
  background: #6366f1;
}

.sd-toggle--off {
  background: rgba(255 255 255 / 0.15);
}

.sd-toggle-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0 0 0 / 0.3);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.sd-footer {
  padding: 10px 16px 14px;
  border-top: 1px solid rgba(255 255 255 / 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sd-version {
  font-size: 9px;
  font-family: monospace;
  color: rgba(255 255 255 / 0.18);
  letter-spacing: 0.05em;
}

.sd-backdrop-enter-active {
  transition: opacity 0.35s ease;
}

.sd-backdrop-leave-active {
  transition: opacity 0.25s ease;
}

.sd-backdrop-enter-from,
.sd-backdrop-leave-to {
  opacity: 0;
}

.sd-panel-enter-active {
  transition: transform 0.48s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}

.sd-panel-leave-active {
  transition: transform 0.32s cubic-bezier(0.7, 0, 0.84, 0), opacity 0.25s ease;
}

.sd-panel-enter-from,
.sd-panel-leave-to {
  transform: translateX(-100%);
  opacity: 0.6;
}

@media (max-width: 480px) {
  .sd-panel {
    width: min(320px, 92vw);
  }

  .sd-header {
    padding: 16px 12px 12px;
  }

  .sd-body {
    padding: 10px 10px 4px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sd-backdrop-enter-active,
  .sd-backdrop-leave-active,
  .sd-panel-enter-active,
  .sd-panel-leave-active,
  .sd-xp-fill,
  .sd-toggle-thumb,
  .sd-item {
    transition: none !important;
    animation: none !important;
  }
}
</style>
