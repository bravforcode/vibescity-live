<script setup>
/**
 * AchievementBadges.vue - Achievement badges display
 * Feature #30: Achievement Badges
 */
import { computed } from "vue";

const props = defineProps({
	isDarkMode: {
		type: Boolean,
		default: true,
	},
	stats: {
		type: Object,
		default: () => ({
			totalVisits: 0,
			liveVenuesVisited: 0,
			coinsCollected: 0,
			checkInStreak: 0,
			nightVisits: 0,
		}),
	},
});

const emit = defineEmits(["badge-unlock"]);

const badges = [
	{
		id: "first_visit",
		name: "First Steps",
		icon: "👣",
		description: "Visit your first venue",
		condition: (s) => s.totalVisits >= 1,
		tier: "bronze",
	},
	{
		id: "explorer",
		name: "Explorer",
		icon: "🧭",
		description: "Visit 10 different venues",
		condition: (s) => s.totalVisits >= 10,
		tier: "silver",
	},
	{
		id: "night_owl",
		name: "Night Owl",
		icon: "🦉",
		description: "Visit 5 venues after midnight",
		condition: (s) => s.nightVisits >= 5,
		tier: "gold",
	},
	{
		id: "live_hunter",
		name: "Live Hunter",
		icon: "🔴",
		description: "Visit 5 venues while LIVE",
		condition: (s) => s.liveVenuesVisited >= 5,
		tier: "gold",
	},
	{
		id: "coin_collector",
		name: "Coin Collector",
		icon: "💰",
		description: "Collect 100 coins",
		condition: (s) => s.coinsCollected >= 100,
		tier: "silver",
	},
	{
		id: "streak_master",
		name: "Streak Master",
		icon: "🔥",
		description: "7-day check-in streak",
		condition: (s) => s.checkInStreak >= 7,
		tier: "gold",
	},
	{
		id: "vip",
		name: "VIP",
		icon: "⭐",
		description: "Unlock all other badges",
		condition: () => false, // Special condition
		tier: "platinum",
	},
];

const tierColors = {
	bronze: "from-amber-700 to-amber-500",
	silver: "from-gray-400 to-gray-300",
	gold: "from-yellow-500 to-amber-400",
	platinum: "from-purple-500 to-pink-500",
};

const unlockedBadges = computed(() => {
	return badges.filter((b) => b.condition(props.stats)).map((b) => b.id);
});

const getBadgeStatus = (badge) => {
	return unlockedBadges.value.includes(badge.id);
};
</script>

<template>
  <div class="badges-container">
    <h3
      :class="[
        'text-lg font-black mb-4',
        isDarkMode ? 'text-white' : 'text-gray-900',
      ]"
    >
      🏆 Achievements
    </h3>

    <div class="grid grid-cols-3 gap-3">
      <div
        v-for="badge in badges"
        :key="badge.id"
        :class="[
          'badge-card border',
          getBadgeStatus(badge)
            ? 'badge-unlocked bg-surface-elevated border-neon-blue/30 shadow-glass'
            : 'badge-locked bg-surface-dark border-surface-border',
        ]"
      >
        <!-- Badge icon -->
        <div
          :class="[
            'badge-icon',
            getBadgeStatus(badge)
              ? `bg-gradient-to-br ${tierColors[badge.tier]} shadow-glow`
              : 'bg-surface-void border border-white/5',
          ]"
        >
          <span :class="{ 'grayscale opacity-30': !getBadgeStatus(badge) }">
            {{ badge.icon }}
          </span>
        </div>

        <!-- Badge name -->
        <div
          :class="[
            'text-[10px] font-bold text-center mt-1 leading-tight',
            getBadgeStatus(badge)
              ? isDarkMode
                ? 'text-white'
                : 'text-gray-900'
              : isDarkMode
                ? 'text-white/30'
                : 'text-gray-400',
          ]"
        >
          {{ badge.name }}
        </div>

        <!-- Lock icon -->
        <div
          v-if="!getBadgeStatus(badge)"
          class="absolute inset-0 flex items-center justify-center"
        >
          <span class="text-2xl opacity-20">🔒</span>
        </div>
      </div>
    </div>

    <!-- Progress summary -->
    <div
      :class="[
        'mt-4 text-center text-sm',
        isDarkMode ? 'text-white/50' : 'text-gray-500',
      ]"
    >
      {{ unlockedBadges.length }} / {{ badges.length }} badges unlocked
    </div>
  </div>
</template>

<style scoped>
.badge-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-radius: 16px;
  transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease;
}

.badge-unlocked {
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
}

.badge-locked {
  opacity: 0.6;
}

.badge-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.badge-unlocked .badge-icon {
  animation: badge-glow 2s ease-in-out infinite;
}

@keyframes badge-glow {
  0%,
  100% {
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
  }
  50% {
    box-shadow: 0 4px 20px rgba(139, 92, 246, 0.6);
  }
}
</style>
