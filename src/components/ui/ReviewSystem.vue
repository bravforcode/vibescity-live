<script setup>
import { MessageSquare, ShieldCheck } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useHaptics } from "../../composables/useHaptics";
import { useMotionPreference } from "../../composables/useMotionPreference";
import { useShopStore } from "../../store/shopStore";
import { useUserStore } from "../../store/userStore";

const props = defineProps({
	shopId: {
		type: [String, Number],
		required: true,
	},
	shopName: {
		type: String,
		default: "",
	},
});

const { t } = useI18n();
const shopStore = useShopStore();
const userStore = useUserStore();
const { tapFeedback, successFeedback } = useHaptics();
const { shouldReduceMotion, getAnimationDuration } = useMotionPreference();

// Emoji reaction definitions
const REACTIONS = [
	{ emoji: "😍", key: "love", label: "reviews.reaction_love" },
	{ emoji: "❤️", key: "heart", label: "reviews.reaction_heart" },
	{ emoji: "😆", key: "haha", label: "reviews.reaction_haha" },
	{ emoji: "😮", key: "wow", label: "reviews.reaction_wow" },
	{ emoji: "😢", key: "sad", label: "reviews.reaction_sad" },
	{ emoji: "😡", key: "angry", label: "reviews.reaction_angry" },
];

const selectedReaction = ref(null);
const isSubmitting = ref(false);
const showSuccess = ref(false);
const animatingEmoji = ref(null);

const shopReviews = computed(() => shopStore.getShopReviews(props.shopId));

const REACTION_KEYS = new Set(["love", "heart", "haha", "wow", "sad", "angry"]);
const REACTION_REGEX =
	/\bReaction:\s*[^\s]+\s+(love|heart|haha|wow|sad|angry)\b/i;

const parseReactionKey = (comment) => {
	const raw = String(comment || "");
	const match = raw.match(REACTION_REGEX);
	const key = match ? match[1].toLowerCase() : null;
	return key && REACTION_KEYS.has(key) ? key : null;
};

const makeEmptyCounts = () => ({
	love: 0,
	heart: 0,
	haha: 0,
	wow: 0,
	sad: 0,
	angry: 0,
});

const computeCountsFromReviews = (reviews) => {
	const counts = makeEmptyCounts();

	for (const rev of Array.isArray(reviews) ? reviews : []) {
		const key = parseReactionKey(rev?.comment);
		if (key) counts[key] += 1;
	}
	return counts;
};

// Reaction counts derived from DB (reviews table) to avoid client-only drift.
const reactionCounts = computed(() =>
	computeCountsFromReviews(shopReviews.value),
);

const totalReactions = computed(() => {
	return Object.values(reactionCounts.value).reduce((sum, c) => sum + c, 0);
});

const topReaction = computed(() => {
	const entries = Object.entries(reactionCounts.value);
	const max = entries.reduce((a, b) => (a[1] > b[1] ? a : b), ["", 0]);
	return max[1] > 0 ? REACTIONS.find((r) => r.key === max[0]) : null;
});

onMounted(() => {
	shopStore.fetchShopReviews(props.shopId);
});

const selectReaction = async (reaction) => {
	if (isSubmitting.value) return;

	tapFeedback();
	animatingEmoji.value = reaction.key;

	// Toggle if same reaction
	if (selectedReaction.value === reaction.key) {
		selectedReaction.value = null;
		animatingEmoji.value = null;
		return;
	}

	selectedReaction.value = reaction.key;

	isSubmitting.value = true;

	try {
		// Save reaction to DB (encoded as a review comment; counts derived server-side)
		await shopStore.addReview(props.shopId, {
			rating: null,
			comment: `Reaction: ${reaction.emoji} ${reaction.key}`,
			userName: userStore.userProfile?.name || "Vibe Explorer",
		});

		// Re-fetch to keep counts consistent with DB
		await shopStore.fetchShopReviews(props.shopId);

		successFeedback();
		showSuccess.value = true;

		setTimeout(
			() => {
				showSuccess.value = false;
			},
			shouldReduceMotion.value ? 1000 : 2000,
		);
	} catch {
	} finally {
		isSubmitting.value = false;
		setTimeout(() => {
			animatingEmoji.value = null;
		}, getAnimationDuration(600));
	}
};
</script>

<template>
  <div class="review-system flex flex-col gap-5 p-1">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3
          class="text-lg font-black tracking-tight text-white flex items-center gap-2"
        >
          <MessageSquare class="w-5 h-5 text-blue-400" />
          {{ t("reviews.title") || "Community Vibes" }}
        </h3>
        <p
          class="text-xs text-zinc-500 font-bold uppercase tracking-widest mt-1"
        >
          {{ totalReactions }}
          {{ t("reviews.reactions_count") || "reactions" }}
        </p>
      </div>

      <!-- Top Reaction Badge -->
      <div
        v-if="topReaction"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"
      >
        <span class="text-lg">{{ topReaction.emoji }}</span>
        <span class="text-xs font-bold text-white/60">{{
          t("reviews.most_popular") || "Most popular"
        }}</span>
      </div>
    </div>

    <!-- Emoji Reactions Grid -->
    <div
      class="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-xl transition duration-500"
      :class="{ 'border-green-500/50 bg-green-500/5': showSuccess }"
      role="region"
      :aria-label="t('reviews.title') || 'Community Vibes'"
      aria-live="polite"
    >
      <transition name="fade-slide" mode="out-in">
        <div v-if="!showSuccess" key="reactions">
          <p class="text-sm text-zinc-400 text-center mb-4 font-medium">
            {{ t("reviews.how_was_it") || "How was your experience?" }}
          </p>

          <!-- Emoji Grid -->
          <div class="grid grid-cols-6 gap-2" role="group" :aria-label="t('reviews.how_was_it') || 'How was your experience?'">
            <button
              v-for="reaction in REACTIONS"
              :key="reaction.key"
              type="button"
              @click="selectReaction(reaction)"
              :disabled="isSubmitting"
              :aria-label="`${reaction.emoji} ${t(reaction.label) || reaction.label}`"
              :aria-pressed="selectedReaction === reaction.key"
              class="group relative flex flex-col items-center gap-1.5 rounded-2xl py-3 transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              :class="[
                selectedReaction === reaction.key
                  ? 'bg-blue-500/20 border-blue-400/40 scale-105 shadow-lg shadow-blue-500/10'
                  : 'bg-white/5 hover:bg-white/10 border-transparent',
                'border',
              ]"
            >
              <!-- Emoji -->
              <span
                class="text-2xl transition-transform duration-300 group-hover:scale-125"
                :class="{
                  'animate-bounce-once': animatingEmoji === reaction.key,
                  'scale-110': selectedReaction === reaction.key,
                }"
              >
                {{ reaction.emoji }}
              </span>

              <!-- Count -->
              <span
                class="text-[10px] font-bold tabular-nums transition-colors"
                :class="
                  selectedReaction === reaction.key
                    ? 'text-blue-400'
                    : 'text-zinc-500'
                "
              >
                {{ reactionCounts[reaction.key] || 0 }}
              </span>
            </button>
          </div>
        </div>

        <!-- Success State -->
        <div
          v-else
          key="success"
          class="flex flex-col items-center justify-center py-6 text-center"
        >
          <div
            class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.4)] mb-4 animate-bounce"
          >
            <ShieldCheck class="w-8 h-8 text-white" />
          </div>
          <h4 class="text-lg font-black text-white capitalize">
            {{ t("reviews.success_title") || "Vibe Logged!" }}
          </h4>
          <p class="text-sm text-zinc-400 mt-1 max-w-[200px]">
            {{ t("reviews.success_msg") || "Thanks for sharing your vibe!" }}
          </p>
        </div>
      </transition>
    </div>

    <!-- Recent Reactions Summary -->
    <div v-if="totalReactions > 0" class="flex items-center gap-2 px-2">
      <div class="flex -space-x-1">
        <template v-for="reaction in REACTIONS" :key="reaction.key">
          <span
            v-if="reactionCounts[reaction.key] > 0"
            class="text-sm bg-zinc-800 rounded-full w-7 h-7 flex items-center justify-center border-2 border-zinc-900"
          >
            {{ reaction.emoji }}
          </span>
        </template>
      </div>
      <span class="text-xs text-zinc-500 font-medium">
        {{ totalReactions }}
        {{ t("reviews.people_reacted") || "people reacted" }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@keyframes bounce-once {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(1.4);
  }
  50% {
    transform: scale(0.9);
  }
  70% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1.1);
  }
}

.animate-bounce-once {
  animation: bounce-once 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>
