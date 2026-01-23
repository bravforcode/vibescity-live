<script setup>
/**
 * Leaderboard.vue - Top coin collectors leaderboard
 * Feature #31: Leaderboard UI
 */
import { computed, ref } from "vue";

const props = defineProps({
	isDarkMode: {
		type: Boolean,
		default: true,
	},
	currentUser: {
		type: Object,
		default: () => ({ name: "You", coins: 0, rank: 99 }),
	},
});

// Mock leaderboard data
const leaders = ref([
	{ rank: 1, name: "NightOwl_CM", coins: 2450, avatar: "🦉" },
	{ rank: 2, name: "PartyKing", coins: 2120, avatar: "👑" },
	{ rank: 3, name: "VibeHunter", coins: 1890, avatar: "🎯" },
	{ rank: 4, name: "ChiangMaiPro", coins: 1650, avatar: "🏔️" },
	{ rank: 5, name: "ClubMaster", coins: 1520, avatar: "🎧" },
	{ rank: 6, name: "NeonRider", coins: 1380, avatar: "🌙" },
	{ rank: 7, name: "BarHopper", coins: 1250, avatar: "🍻" },
	{ rank: 8, name: "DanceFloor", coins: 1100, avatar: "💃" },
	{ rank: 9, name: "MidnightWalker", coins: 980, avatar: "🌃" },
	{ rank: 10, name: "VibeSeeker", coins: 850, avatar: "✨" },
]);

const getRankColor = (rank) => {
	if (rank === 1) return "from-yellow-400 to-amber-500";
	if (rank === 2) return "from-gray-300 to-gray-400";
	if (rank === 3) return "from-amber-600 to-amber-700";
	return "";
};

const getRankIcon = (rank) => {
	if (rank === 1) return "🥇";
	if (rank === 2) return "🥈";
	if (rank === 3) return "🥉";
	return rank;
};
</script>

<template>
  <div class="leaderboard">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h3
        :class="[
          'text-lg font-black',
          isDarkMode ? 'text-white' : 'text-gray-900',
        ]"
      >
        🏆 Top Collectors
      </h3>
      <span
        :class="[
          'text-xs font-bold px-2 py-1 rounded-full',
          isDarkMode
            ? 'bg-zinc-800 text-white/50'
            : 'bg-gray-100 text-gray-500',
        ]"
      >
        This Week
      </span>
    </div>

    <!-- Top 3 podium -->
    <div class="flex items-end justify-center gap-2 mb-6">
      <!-- 2nd place -->
      <div class="flex flex-col items-center">
        <div class="text-3xl mb-1">{{ leaders[1]?.avatar }}</div>
        <div
          :class="[
            'w-16 h-20 rounded-t-xl flex flex-col items-center justify-start pt-2',
            'bg-gradient-to-b from-gray-300 to-gray-400',
          ]"
        >
          <span class="text-2xl">🥈</span>
          <span class="text-[10px] font-bold text-white/80">
            {{ leaders[1]?.coins }}
          </span>
        </div>
      </div>

      <!-- 1st place -->
      <div class="flex flex-col items-center -mt-4">
        <div class="text-4xl mb-1">{{ leaders[0]?.avatar }}</div>
        <div
          :class="[
            'w-20 h-28 rounded-t-xl flex flex-col items-center justify-start pt-2',
            'bg-gradient-to-b from-yellow-400 to-amber-500',
          ]"
        >
          <span class="text-3xl">🥇</span>
          <span class="text-xs font-bold text-white/90">
            {{ leaders[0]?.coins }}
          </span>
        </div>
      </div>

      <!-- 3rd place -->
      <div class="flex flex-col items-center">
        <div class="text-3xl mb-1">{{ leaders[2]?.avatar }}</div>
        <div
          :class="[
            'w-16 h-16 rounded-t-xl flex flex-col items-center justify-start pt-2',
            'bg-gradient-to-b from-amber-600 to-amber-700',
          ]"
        >
          <span class="text-2xl">🥉</span>
          <span class="text-[10px] font-bold text-white/80">
            {{ leaders[2]?.coins }}
          </span>
        </div>
      </div>
    </div>

    <!-- Rest of leaderboard -->
    <div class="space-y-2">
      <div
        v-for="leader in leaders.slice(3)"
        :key="leader.rank"
        :class="[
          'flex items-center gap-3 p-3 rounded-xl transition-colors',
          isDarkMode
            ? 'bg-zinc-800 hover:bg-zinc-700'
            : 'bg-gray-100 hover:bg-gray-200',
        ]"
      >
        <span
          :class="[
            'w-6 text-center font-bold',
            isDarkMode ? 'text-white/40' : 'text-gray-400',
          ]"
        >
          {{ leader.rank }}
        </span>
        <span class="text-xl">{{ leader.avatar }}</span>
        <span
          :class="[
            'flex-1 font-bold truncate',
            isDarkMode ? 'text-white' : 'text-gray-900',
          ]"
        >
          {{ leader.name }}
        </span>
        <span
          :class="[
            'font-mono font-bold',
            isDarkMode ? 'text-yellow-400' : 'text-yellow-600',
          ]"
        >
          🪙 {{ leader.coins }}
        </span>
      </div>
    </div>

    <!-- Current user -->
    <div
      :class="[
        'mt-4 p-3 rounded-xl border-2 border-purple-500/50',
        isDarkMode ? 'bg-purple-500/10' : 'bg-purple-50',
      ]"
    >
      <div class="flex items-center gap-3">
        <span :class="['w-6 text-center font-bold', 'text-purple-400']">
          #{{ currentUser.rank }}
        </span>
        <span class="text-xl">😎</span>
        <span
          :class="[
            'flex-1 font-bold',
            isDarkMode ? 'text-white' : 'text-gray-900',
          ]"
        >
          {{ currentUser.name }} (You)
        </span>
        <span class="font-mono font-bold text-purple-400">
          🪙 {{ currentUser.coins }}
        </span>
      </div>
    </div>
  </div>
</template>
