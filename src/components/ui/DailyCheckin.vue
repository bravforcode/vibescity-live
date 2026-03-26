<script setup>
/**
 * DailyCheckin.vue
 * Server-authoritative check-in modal.
 */

import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { gamificationService } from "@/services/gamificationService";

const { t } = useI18n();

defineProps({
	isDarkMode: {
		type: Boolean,
		default: true,
	},
});

const emit = defineEmits(["claim", "close"]);

const isVisible = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");
const dialogRef = ref(null);

const checkinData = ref({
	streak: 0,
	lastCheckin: null,
	totalDays: 0,
	balance: 0,
});

const canClaimToday = ref(false);
const justClaimed = ref(false);
const claimedCoins = ref(0);

const rewards = [
	{ day: 1, coins: 10, label: "Day 1" },
	{ day: 2, coins: 15, label: "Day 2" },
	{ day: 3, coins: 20, label: "Day 3" },
	{ day: 4, coins: 25, label: "Day 4" },
	{ day: 5, coins: 30, label: "Day 5" },
	{ day: 6, coins: 40, label: "Day 6" },
	{ day: 7, coins: 100, label: "Day 7" },
];

const streakCount = computed(() => Number(checkinData.value.streak || 0));
const currentDayIdx = computed(() => streakCount.value % 7);

const completedDaysInCycle = computed(() => {
	if (streakCount.value <= 0) return 0;
	if (!canClaimToday.value && currentDayIdx.value === 0) return 7;
	return currentDayIdx.value;
});

const currentDayReward = computed(() => rewards[currentDayIdx.value]);

const streakDisplay = computed(() => {
	if (streakCount.value <= 0) return "Start your streak";
	return `${streakCount.value} day streak`;
});

const applyStatus = (status = {}) => {
	checkinData.value = {
		streak: Number(status.streak || 0),
		lastCheckin: status.last_checkin_at || null,
		totalDays: Number(status.total_days || 0),
		balance: Number(status.balance || 0),
	};

	canClaimToday.value = Boolean(status.can_claim_today);
};

const loadCheckinData = async () => {
	isLoading.value = true;
	errorMessage.value = "";

	try {
		const status = await gamificationService.getDailyCheckinStatus();
		applyStatus(status);
	} catch (error) {
		errorMessage.value =
			error?.message || "Failed to load daily check-in status.";
		canClaimToday.value = false;
	} finally {
		isLoading.value = false;
	}
};

const claim = async () => {
	if (!canClaimToday.value || isLoading.value) return;

	isLoading.value = true;
	errorMessage.value = "";

	try {
		const result = await gamificationService.claimDailyCheckin();

		applyStatus({
			streak: result.streak,
			total_days: result.total_days,
			last_checkin_at: result.claimed_at,
			balance: result.balance,
			can_claim_today: false,
		});

		claimedCoins.value = Number(
			result.reward_coins || currentDayReward.value.coins,
		);
		justClaimed.value = !result.already_claimed;

		emit("claim", {
			coins: claimedCoins.value,
			streak: Number(result.streak || 0),
			balance: Number(result.balance || 0),
		});
	} catch (error) {
		errorMessage.value = error?.message || "Failed to claim daily reward.";
	} finally {
		isLoading.value = false;
	}
};

const show = async () => {
	justClaimed.value = false;
	isVisible.value = true;
	await nextTick();
	dialogRef.value?.focus();
	await loadCheckinData();
};

const hide = () => {
	isVisible.value = false;
	emit("close");
};

defineExpose({ show, hide });
</script>

<template>
  <Teleport to="body">
    <Transition name="dc-overlay">
      <div
        v-if="isVisible"
        ref="dialogRef"
        class="dc-backdrop"
        data-testid="daily-checkin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dc-title"
        tabindex="-1"
        @click.self="hide"
        @keydown.esc="hide"
      >
        <div class="dc-modal">
          <button type="button" class="dc-close" aria-label="Close check-in" @click="hide">
            <span aria-hidden="true">✕</span>
          </button>

          <Transition name="dc-celebrate">
            <div v-if="justClaimed" class="dc-celebrate-banner" aria-live="polite">
              <span class="dc-celebrate-emoji" aria-hidden="true">🎉</span>
              <span class="dc-celebrate-text">+{{ claimedCoins }} coins!</span>
            </div>
          </Transition>

          <div class="dc-header" aria-hidden="true">
            <div class="dc-header-icon">📅</div>
          </div>

          <div class="dc-titles">
            <h2 id="dc-title" class="dc-title">{{ t("checkin.title") }}</h2>
            <p class="dc-streak">{{ streakDisplay }}</p>
          </div>

          <div class="dc-grid" role="list" aria-label="7-day reward schedule">
            <div
              v-for="(reward, i) in rewards"
              :key="reward.day"
              role="listitem"
              class="dc-day"
              :class="{
                'dc-day--done': i < completedDaysInCycle,
                'dc-day--current': i === currentDayIdx && canClaimToday,
                'dc-day--future': i >= completedDaysInCycle && !(i === currentDayIdx && canClaimToday),
              }"
              :aria-label="`Day ${reward.day}: ${reward.coins} coins${i < completedDaysInCycle ? ' (claimed)' : ''}`"
            >
              <span v-if="i < completedDaysInCycle" class="dc-day-check" aria-hidden="true">✓</span>
              <span class="dc-day-emoji" aria-hidden="true">{{ i === 6 ? "🎁" : "🪙" }}</span>
              <span class="dc-day-coins">+{{ reward.coins }}</span>
              <span class="dc-day-label">{{ reward.label }}</span>
            </div>
          </div>

          <div class="dc-balance-strip">
            <div class="dc-balance-item">
              <span class="dc-balance-label">Balance</span>
              <span class="dc-balance-value">🪙 {{ checkinData.balance.toLocaleString() }}</span>
            </div>
            <div class="dc-balance-divider" aria-hidden="true" />
            <div class="dc-balance-item">
              <span class="dc-balance-label">Total Days</span>
              <span class="dc-balance-value">{{ checkinData.totalDays }}</span>
            </div>
          </div>

          <button
            type="button"
            class="dc-cta"
            data-testid="daily-checkin-claim-btn"
            :class="{
              'dc-cta--active': canClaimToday && !isLoading,
              'dc-cta--inactive': !canClaimToday || isLoading,
            }"
            :disabled="!canClaimToday || isLoading"
            :aria-label="canClaimToday ? `Claim ${currentDayReward.coins} coins` : 'Already claimed today'"
            @click="claim"
          >
            <Transition name="dc-btn-text" mode="out-in">
              <span v-if="isLoading" key="loading" class="dc-cta-inner">
                <span class="dc-spinner" aria-hidden="true" />
                {{ t("checkin.loading") }}
              </span>
              <span v-else-if="canClaimToday" key="claim" class="dc-cta-inner">
                {{ t("checkin.claim", { coins: currentDayReward.coins }) }}
              </span>
              <span v-else key="claimed" class="dc-cta-inner">
                {{ t("checkin.claimed") }}
              </span>
            </Transition>
          </button>

          <Transition name="dc-fade">
            <div v-if="errorMessage" class="dc-error" role="alert" aria-live="polite">
              {{ errorMessage }}
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dc-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0 0 0 / 0.82);
  backdrop-filter: blur(10px);
}

.dc-modal {
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 28px 24px 24px;
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(22 28 58 / 0.99) 0%, rgba(10 14 32 / 0.99) 100%);
  border: 1px solid rgba(255 255 255 / 0.1);
  box-shadow: 0 32px 80px rgba(0 0 0 / 0.7), 0 0 0 0.5px rgba(255 255 255 / 0.05) inset;
  contain: layout paint style;
}

.dc-modal::before {
  content: "";
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(139 92 246 / 0.3), transparent 70%);
  pointer-events: none;
}

.dc-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: rgba(255 255 255 / 0.45);
  background: rgba(255 255 255 / 0.06);
  transition: background 0.15s, color 0.15s;
  z-index: 2;
}

.dc-close:hover {
  background: rgba(255 255 255 / 0.12);
  color: #fff;
}

.dc-close:focus-visible {
  outline: 2px solid rgba(139 92 246 / 0.8);
  outline-offset: 2px;
}

.dc-celebrate-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px 16px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(139 92 246 / 0.3), rgba(236 72 153 / 0.3));
  border: 1px solid rgba(139 92 246 / 0.4);
  animation: dc-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dc-celebrate-emoji {
  font-size: 1.2rem;
}

.dc-celebrate-text {
  font-size: 0.9rem;
  font-weight: 900;
  color: #d8b4fe;
}

@keyframes dc-pop {
  from {
    opacity: 0;
    transform: scale(0.7);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.dc-header {
  text-align: center;
  margin-bottom: 6px;
}

.dc-header-icon {
  font-size: 2.8rem;
  line-height: 1;
}

.dc-titles {
  text-align: center;
  margin-bottom: 20px;
}

.dc-title {
  font-size: 1.2rem;
  font-weight: 900;
  color: #fff;
  margin-bottom: 4px;
}

.dc-streak {
  font-size: 0.8rem;
  color: rgba(255 255 255 / 0.5);
  font-weight: 600;
}

.dc-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  margin-bottom: 16px;
}

.dc-day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 2px 6px;
  border-radius: 12px;
  border: 1px solid rgba(255 255 255 / 0.06);
  background: rgba(255 255 255 / 0.04);
  transition: transform 0.2s, box-shadow 0.2s;
  overflow: hidden;
}

.dc-day--done {
  background: rgba(34 197 94 / 0.15);
  border-color: rgba(34 197 94 / 0.25);
  opacity: 0.75;
}

.dc-day--current {
  background: linear-gradient(160deg, rgba(139 92 246 / 0.3), rgba(236 72 153 / 0.25));
  border-color: rgba(139 92 246 / 0.5);
  box-shadow: 0 0 20px rgba(139 92 246 / 0.3);
  transform: scale(1.08);
  z-index: 1;
}

.dc-day--future {
  opacity: 0.45;
}

.dc-day-check {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 8px;
  color: #4ade80;
  font-weight: 900;
}

.dc-day-emoji {
  font-size: 1rem;
  line-height: 1;
}

.dc-day-coins {
  font-size: 8px;
  font-weight: 900;
  color: #fbbf24;
}

.dc-day-label {
  font-size: 6px;
  color: rgba(255 255 255 / 0.45);
  text-align: center;
  letter-spacing: 0.02em;
}

.dc-balance-strip {
  display: flex;
  align-items: center;
  background: rgba(255 255 255 / 0.04);
  border: 1px solid rgba(255 255 255 / 0.07);
  border-radius: 14px;
  padding: 10px 16px;
  margin-bottom: 14px;
}

.dc-balance-item {
  flex: 1;
  text-align: center;
}

.dc-balance-divider {
  width: 1px;
  height: 28px;
  background: rgba(255 255 255 / 0.1);
}

.dc-balance-label {
  display: block;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255 255 255 / 0.35);
  margin-bottom: 2px;
}

.dc-balance-value {
  display: block;
  font-size: 0.85rem;
  font-weight: 900;
  color: #fff;
}

.dc-cta {
  width: 100%;
  min-height: 52px;
  border-radius: 16px;
  font-size: 0.95rem;
  font-weight: 900;
  letter-spacing: -0.01em;
  transition: filter 0.15s, transform 0.12s;
  will-change: transform;
  touch-action: manipulation;
}

.dc-cta--active {
  background: linear-gradient(100deg, #7c3aed, #db2777, #dc2626);
  color: #fff;
  box-shadow: 0 8px 24px rgba(139 92 246 / 0.45);
}

.dc-cta--active:hover {
  filter: brightness(1.1);
}

.dc-cta--active:active {
  transform: scale(0.97);
}

.dc-cta--inactive {
  background: rgba(255 255 255 / 0.06);
  color: rgba(255 255 255 / 0.3);
  cursor: not-allowed;
}

.dc-cta:focus-visible {
  outline: 2px solid rgba(139 92 246 / 0.8);
  outline-offset: 2px;
}

.dc-cta-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.dc-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255 255 255 / 0.2);
  border-top-color: #fff;
  animation: dc-spin 0.7s linear infinite;
}

@keyframes dc-spin {
  to {
    transform: rotate(360deg);
  }
}

.dc-error {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(239 68 68 / 0.12);
  border: 1px solid rgba(239 68 68 / 0.25);
  font-size: 0.78rem;
  color: #fca5a5;
  font-weight: 600;
}

.dc-overlay-enter-active {
  transition: opacity 0.3s ease;
}

.dc-overlay-leave-active {
  transition: opacity 0.22s ease;
}

.dc-overlay-enter-active .dc-modal {
  transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}

.dc-overlay-leave-active .dc-modal {
  transition: transform 0.25s ease, opacity 0.2s ease;
}

.dc-overlay-enter-from {
  opacity: 0;
}

.dc-overlay-enter-from .dc-modal {
  transform: translateY(24px) scale(0.96);
  opacity: 0;
}

.dc-overlay-leave-to {
  opacity: 0;
}

.dc-overlay-leave-to .dc-modal {
  transform: translateY(16px);
  opacity: 0;
}

.dc-celebrate-enter-active {
  transition: opacity 0.2s, transform 0.2s;
}

.dc-celebrate-leave-active {
  transition: opacity 0.15s;
}

.dc-celebrate-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.dc-celebrate-leave-to {
  opacity: 0;
}

.dc-btn-text-enter-active {
  transition: opacity 0.15s, transform 0.15s;
}

.dc-btn-text-leave-active {
  transition: opacity 0.1s;
}

.dc-btn-text-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.dc-btn-text-leave-to {
  opacity: 0;
}

.dc-fade-enter-active,
.dc-fade-leave-active {
  transition: opacity 0.2s;
}

.dc-fade-enter-from,
.dc-fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .dc-backdrop {
    align-items: flex-end;
    padding: 12px;
  }

  .dc-modal {
    max-width: 100%;
    border-radius: 24px;
    padding: 22px 16px 16px;
  }

  .dc-grid {
    gap: 4px;
  }

  .dc-day {
    padding: 7px 1px 5px;
  }

  .dc-day--current {
    transform: scale(1.04);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dc-overlay-enter-active,
  .dc-overlay-leave-active,
  .dc-overlay-enter-active .dc-modal,
  .dc-overlay-leave-active .dc-modal,
  .dc-celebrate-enter-active,
  .dc-celebrate-leave-active,
  .dc-btn-text-enter-active,
  .dc-btn-text-leave-active,
  .dc-cta,
  .dc-day,
  .dc-spinner {
    transition: none !important;
    animation: none !important;
  }
}
</style>
