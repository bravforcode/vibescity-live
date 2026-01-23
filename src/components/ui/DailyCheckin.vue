<script setup>
/**
 * DailyCheckin.vue - Daily check-in bonus system
 * Feature #29: Daily Check-in Bonus
 */
import { ref, computed, onMounted } from "vue";

const props = defineProps({
  isDarkMode: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["claim", "close"]);

const STORAGE_KEY = "vibecity_checkin";
const isVisible = ref(false);
const checkinData = ref({
  streak: 0,
  lastCheckin: null,
  totalDays: 0,
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

onMounted(() => {
  loadCheckinData();
  checkCanClaim();
});

const loadCheckinData = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    checkinData.value = JSON.parse(stored);
  }
};

const saveCheckinData = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(checkinData.value));
};

const checkCanClaim = () => {
  const lastCheckin = checkinData.value.lastCheckin;
  if (!lastCheckin) {
    canClaimToday.value = true;
    return;
  }

  const lastDate = new Date(lastCheckin).toDateString();
  const today = new Date().toDateString();
  canClaimToday.value = lastDate !== today;

  // Check if streak is broken
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (lastDate !== yesterday.toDateString() && lastDate !== today) {
    checkinData.value.streak = 0;
  }
};

const claim = () => {
  if (!canClaimToday.value) return;

  const today = new Date().toISOString();
  checkinData.value.lastCheckin = today;
  checkinData.value.streak = (checkinData.value.streak % 7) + 1;
  checkinData.value.totalDays++;

  const reward = rewards[(checkinData.value.streak - 1) % 7];

  saveCheckinData();
  canClaimToday.value = false;

  emit("claim", { coins: reward.coins, streak: checkinData.value.streak });
};

const currentDayReward = computed(() => {
  const dayIndex = checkinData.value.streak % 7;
  return rewards[dayIndex];
});

const show = () => {
  isVisible.value = true;
};
const hide = () => {
  isVisible.value = false;
  emit("close");
};

defineExpose({ show, hide });
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div v-if="isVisible" class="checkin-overlay" @click.self="hide">
        <div
          :class="['checkin-modal', isDarkMode ? 'bg-zinc-900' : 'bg-white']"
        >
          <!-- Header -->
          <div class="text-center mb-6">
            <div class="text-5xl mb-2">📅</div>
            <h2
              :class="[
                'text-xl font-black',
                isDarkMode ? 'text-white' : 'text-gray-900',
              ]"
            >
              Daily Check-in
            </h2>
            <p
              :class="[
                'text-sm',
                isDarkMode ? 'text-white/50' : 'text-gray-500',
              ]"
            >
              Day {{ checkinData.streak || 1 }} of 7
            </p>
          </div>

          <!-- Rewards grid -->
          <div class="grid grid-cols-7 gap-1 mb-6">
            <div
              v-for="(reward, i) in rewards"
              :key="i"
              :class="[
                'flex flex-col items-center p-2 rounded-lg text-center transition-all',
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
            :disabled="!canClaimToday"
            :class="[
              'w-full py-4 rounded-2xl font-black text-lg transition-all',
              canClaimToday
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 active:scale-95'
                : isDarkMode
                  ? 'bg-zinc-800 text-white/30 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            ]"
          >
            {{
              canClaimToday
                ? `Claim +${currentDayReward.coins} Coins!`
                : "Already Claimed ✓"
            }}
          </button>

          <!-- Stats -->
          <div
            :class="[
              'mt-4 text-center text-xs',
              isDarkMode ? 'text-white/30' : 'text-gray-400',
            ]"
          >
            Total days checked in: {{ checkinData.totalDays }}
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
  width: 100%;
  max-width: 360px;
  padding: 24px;
  border-radius: 24px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
