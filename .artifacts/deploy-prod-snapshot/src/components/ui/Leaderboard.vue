<script setup>
/**
 * Leaderboard.vue - Top coin collectors leaderboard
 * Feature #31: Leaderboard UI
 */
import { onMounted, ref } from "vue";
import { supabase } from "../../lib/supabase";

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

const leaders = ref([]);
const loading = ref(true);

const fetchLeaderboard = async () => {
	try {
		loading.value = true;
		// Query the view created in v6 script
		const { data, error } = await supabase
			.from("leaderboard_view")
			.select("*")
			.limit(10); // Check top 10

		if (error) throw error;

		// Map to UI format
		leaders.value = data.map((user, index) => ({
			rank: index + 1,
			name: user.email
				? user.email.split("@")[0]
				: `User ${user.id.slice(0, 4)}`, // Mask email
			coins: user.xp, // We display XP as "Coins" or just XP
			avatar: getAvatarForRank(index + 1),
			id: user.id,
		}));
	} catch (e) {
		console.error("Error fetching leaderboard:", e);
		// No mock data in production — show empty state instead
		if (leaders.value.length === 0) {
			leaders.value = [];
		}
	} finally {
		loading.value = false;
	}
};

const getAvatarForRank = (rank) => {
	// Fun avatars based on rank
	const avatars = ["🦉", "👑", "🎯", "🏔️", "🎧", "🌙", "🍻", "💃", "🌃", "✨"];
	return avatars[rank - 1] || "👤";
};

onMounted(() => {
	fetchLeaderboard();
});

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
          'flex items-center gap-3 p-3 rounded-xl transition-colors border border-surface-border',
          'bg-surface-elevated hover:bg-surface-light',
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
        'mt-4 p-3 rounded-xl border border-neon-purple bg-surface-elevated shadow-neon-purple shadow-sm',
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
