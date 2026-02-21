<script setup>
/**
 * DailyCheckin.vue - Daily check-in bonus system
 * Feature #29: Daily Check-in Bonus (server-authoritative persistence)
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
	AUTH_REQUIRED_MESSAGE,
	gamificationService,
} from "@/services/gamificationService";

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
const checkinData = ref({
	streak: 0,
	lastCheckin: null,
	totalDays: 0,
	balance: 0,
});
const canClaimToday = ref(false);

const rewards = [
	{ day: 1, coins: 10, icon: "🪙" },
	{ day: 2, coins: 15, icon: "🪙" },
	{ day: 3, coins: 20, icon: "🪙" },
	{ day: 4, coins: 25, icon: "🪙" },
	{ day: 5, coins: 30, icon: "🪙" },
	{ day: 6, coins: 40, icon: "🪙" },
	{ day: 7, coins: 100, icon: "🎁" },
];

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

onMounted(() => {
	loadCheckinData();
});

const claim = async () => {
	if (!canClaimToday.value || isLoading.value) return;

	isLoading.value = true;
	errorMessage.value = "";
	try {
		const result = await gamificationService.claimDailyCheckin();

		if (result.already_claimed) {
			applyStatus({
				streak: result.streak,
				total_days: result.total_days,
				last_checkin_at: result.claimed_at,
				balance: result.balance,
				can_claim_today: false,
			});
			return;
		}

		applyStatus({
			streak: result.streak,
			total_days: result.total_days,
			last_checkin_at: result.claimed_at,
			balance: result.balance,
			can_claim_today: false,
		});

		emit("claim", {
			coins: Number(result.reward_coins || 0),
			streak: Number(result.streak || 0),
			balance: Number(result.balance || 0),
		});
	} catch (error) {
		errorMessage.value = error?.message || "Failed to claim daily reward.";
	} finally {
		isLoading.value = false;
	}
};

const currentDayReward = computed(() => {
	const dayIndex = checkinData.value.streak % 7;
	return rewards[dayIndex];
});

const show = async () => {
	isVisible.value = true;
	await loadCheckinData();
};
const hide = () => {
	isVisible.value = false;
	emit("close");
};

const isAuthRequired = computed(
	() => errorMessage.value === AUTH_REQUIRED_MESSAGE,
);

defineExpose({ show, hide });
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div v-if="isVisible" class="checkin-overlay" @click.self="hide">
        <div
          :class="['checkin-modal', isDarkMode ? 'bg-zinc-900' : 'bg-white']"
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-checkin-title"
        >
          <button
            type="button"
            aria-label="Close daily check-in modal"
            class="absolute right-4 top-4 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            @click="hide"
          >
            ✕
          </button>

          <!-- Header -->
          <div class="text-center mb-6">
            <div class="text-5xl mb-2">📅</div>
            <h2
              id="daily-checkin-title"
              :class="[
                'text-xl font-black',
                isDarkMode ? 'text-white' : 'text-gray-900',
              ]"
            >
              {{ t("checkin.title") }}
            </h2>
            <p
              :class="[
                'text-sm',
                isDarkMode ? 'text-white/50' : 'text-gray-500',
              ]"
            >
              {{ t("checkin.day_of", { day: checkinData.streak || 1 }) }}
            </p>
          </div>

          <!-- Rewards grid -->
          <div class="grid grid-cols-7 gap-1 sm:gap-2 mb-6">
            <div
              v-for="(reward, i) in rewards"
              :key="i"
              :class="[
                'flex flex-col items-center rounded-lg p-2 text-center transition-[transform,background-color,color,box-shadow]',
                i < checkinData.streak
                  ? 'bg-green-500/20 text-green-400'
                  : i === checkinData.streak && canClaimToday
                    ? 'bg-purple-500/30 ring-2 ring-purple-500 scale-105'
                    : isDarkMode
                      ? 'bg-zinc-800 text-white/40'
                      : 'bg-gray-100 text-gray-400',
              ]"
            >
              <span class="text-lg">{{ reward.icon }}</span>
              <span class="text-[10px] font-bold">+{{ reward.coins }}</span>
              <span class="text-[8px]">Day {{ reward.day }}</span>
            </div>
          </div>

          <!-- Claim button -->
          <button
            @click="claim"
            :disabled="!canClaimToday || isLoading || isAuthRequired"
            :class="[
              'w-full rounded-2xl py-4 text-lg font-black transition-[transform,background-color,color,box-shadow]',
              canClaimToday && !isAuthRequired
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 active:scale-95'
                : isDarkMode
                  ? 'bg-zinc-800 text-white/30 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            ]"
          >
            {{
              isLoading
                ? t("checkin.loading")
                : isAuthRequired
                  ? t("checkin.sign_in")
                  : canClaimToday
                ? t("checkin.claim", { coins: currentDayReward.coins })
                : t("checkin.claimed")
            }}
          </button>

          <!-- Stats -->
          <div
            :class="[
              'mt-4 text-center text-xs',
              isDarkMode ? 'text-white/30' : 'text-gray-400',
            ]"
            aria-live="polite"
          >
            {{ t("checkin.total_days", { count: checkinData.totalDays }) }}
          </div>
          <div
            :class="[
              'mt-1 text-center text-xs',
              isDarkMode ? 'text-white/40' : 'text-gray-500',
            ]"
            aria-live="polite"
          >
            {{ t("checkin.balance", { count: checkinData.balance }) }}
          </div>
          <div
            v-if="errorMessage"
            class="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            aria-live="polite"
          >
            {{ errorMessage }}
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.checkin-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
}

.checkin-modal {
  position: relative;
  width: 100%;
  max-width: 384px; /* sm:max-w-md = 448px, but use 384px for max-w-sm equivalent */
  padding: 24px;
  border-radius: 24px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

@media (min-width: 640px) {
  .checkin-modal {
    max-width: 448px; /* sm:max-w-md */
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition-property: opacity, transform;
  transition-duration: 0.3s;
  transition-timing-function: ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

@media (prefers-reduced-motion: reduce) {
  .slide-up-enter-active,
  .slide-up-leave-active {
    transition: none;
  }

  .slide-up-enter-from,
  .slide-up-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
