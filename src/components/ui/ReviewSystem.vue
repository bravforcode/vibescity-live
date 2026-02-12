<script setup>
import { MessageSquare, Send, ShieldCheck, Star, User } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useHaptics } from "../../composables/useHaptics";
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

const rating = ref(0);
const comment = ref("");
const selectedTags = ref([]);
const isSubmitting = ref(false);
const showSuccess = ref(false);

const quickTags = [
	"Amazing Music",
	"Great Vibes",
	"Friendly Staff",
	"Cozy Decor",
	"Good Value",
	"Must Visit",
];

const toggleTag = (tag) => {
	tapFeedback();
	if (selectedTags.value.includes(tag)) {
		selectedTags.value = selectedTags.value.filter((t) => t !== tag);
	} else {
		selectedTags.value.push(tag);
	}
};

const shopReviews = computed(() => shopStore.getShopReviews(props.shopId));

const averageRating = computed(() => {
	if (shopReviews.value.length === 0) return 0;
	const sum = shopReviews.value.reduce((acc, rev) => acc + rev.rating, 0);
	return (sum / shopReviews.value.length).toFixed(1);
});

onMounted(() => {
	shopStore.fetchShopReviews(props.shopId);
});

const submitReview = async () => {
	if (rating.value === 0 || isSubmitting.value) return;

	isSubmitting.value = true;
	tapFeedback();

	// Simulate network delay for premium feel
	await new Promise((resolve) => setTimeout(resolve, 800));

	// Combine tags with comment for persistence
	const finalComment =
		selectedTags.value.length > 0
			? `${selectedTags.value.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}\n${comment.value}`
			: comment.value;

	await shopStore.addReviewToDB(props.shopId, {
		rating: rating.value,
		comment: finalComment,
		userName: userStore.userProfile?.name || "Vibe Explorer",
	});

	successFeedback();
	showSuccess.value = true;
	isSubmitting.value = false;

	// Reset form after delay
	setTimeout(() => {
		rating.value = 0;
		comment.value = "";
		selectedTags.value = [];
		showSuccess.value = false;
	}, 3000);
};

const setRating = (r) => {
	rating.value = r;
	tapFeedback();
};
</script>

<template>
  <div class="review-system flex flex-col gap-6 p-1">
    <!-- Header/Stats -->
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
          {{ shopReviews.length }} {{ t("reviews.count") || "REVIEWS" }} •
          {{ averageRating }} AGGREGATE
        </p>
      </div>

      <div v-if="averageRating > 0" class="flex flex-col items-end">
        <div class="flex gap-0.5 text-yellow-400">
          <Star
            v-for="i in 5"
            :key="i"
            :class="[
              'w-4 h-4',
              i <= Math.round(averageRating) ? 'fill-current' : 'opacity-20',
            ]"
          />
        </div>
      </div>
    </div>

    <!-- Review Form -->
    <div
      class="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-xl transition-all duration-500"
      :class="{ 'border-green-500/50 bg-green-500/5': showSuccess }"
    >
      <transition name="fade-slide" mode="out-in">
        <div v-if="!showSuccess" key="form">
          <div class="flex flex-col gap-4">
            <!-- Stars -->
            <div class="flex justify-center gap-3">
              <button
                v-for="r in 5"
                :key="r"
                @click="setRating(r)"
                class="transition-all duration-300 hover:scale-125 focus:outline-none"
                :class="
                  r <= rating ? 'text-yellow-400 scale-110' : 'text-zinc-600'
                "
              >
                <Star :class="['w-8 h-8', r <= rating ? 'fill-current' : '']" />
              </button>
            </div>

            <!-- Quick Tags (Phase 3) -->
            <div class="flex flex-wrap gap-2 py-1 justify-center">
              <button
                v-for="tag in quickTags"
                :key="tag"
                @click="toggleTag(tag)"
                class="px-3 py-1.5 rounded-full border text-[10px] font-bold transition-all active:scale-90"
                :class="
                  selectedTags.includes(tag)
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                "
              >
                {{ tag }}
              </button>
            </div>

            <!-- Comment -->
            <div class="relative">
              <textarea
                v-model="comment"
                :placeholder="t('reviews.placeholder') || 'Share the vibe...'"
                class="w-full h-24 bg-zinc-950/50 border border-white/5 rounded-2xl p-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-blue-500/50 transition-colors resize-none"
              ></textarea>
            </div>

            <!-- Submit -->
            <button
              @click="submitReview"
              :disabled="rating === 0 || isSubmitting"
              class="w-full h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 font-black text-sm text-white shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-30 disabled:grayscale transition-all flex items-center justify-center gap-2 overflow-hidden group"
            >
              <span v-if="!isSubmitting" class="flex items-center gap-2">
                {{ t("reviews.submit") || "POST REVIEW" }}
                <Send
                  class="w-4 h-4 group-hover:translate-x-1 transition-transform"
                />
              </span>
              <div
                v-else
                class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
              ></div>
            </button>
          </div>
        </div>

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
            {{
              t("reviews.success_msg") ||
              "Your contribution helps others find the best spots."
            }}
          </p>
        </div>
      </transition>
    </div>

    <!-- Review List -->
    <div class="flex flex-col gap-4 mt-2">
      <transition-group name="list-stagger">
        <div
          v-for="rev in shopReviews"
          :key="rev.id"
          class="p-4 rounded-2xl border border-white/5 bg-zinc-900/20 backdrop-blur-sm group hover:border-white/10 transition-colors"
        >
          <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5"
              >
                <User class="w-4 h-4 text-zinc-500" />
              </div>
              <div>
                <span class="text-xs font-black text-white block">{{
                  rev.userName
                }}</span>
                <span
                  class="text-[10px] text-zinc-600 font-bold uppercase tracking-tighter"
                  >{{ new Date(rev.timestamp).toLocaleDateString() }}</span
                >
              </div>
            </div>
            <div class="flex gap-0.5 mt-1">
              <Star
                v-for="i in 5"
                :key="i"
                :class="[
                  'w-2.5 h-2.5',
                  i <= rev.rating
                    ? 'text-yellow-400 fill-current'
                    : 'text-zinc-800',
                ]"
              />
            </div>
          </div>
          <p class="text-sm text-zinc-400 leading-relaxed pl-10">
            {{ rev.comment }}
          </p>
        </div>
      </transition-group>

      <div
        v-if="shopReviews.length === 0"
        class="py-8 flex flex-col items-center text-center opacity-40"
      >
        <MessageSquare class="w-10 h-10 text-zinc-600 mb-2" />
        <p class="text-xs font-bold uppercase tracking-widest text-zinc-500">
          No reviews yet. Be the first!
        </p>
      </div>
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

.list-stagger-enter-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.list-stagger-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

textarea::-webkit-scrollbar {
  width: 4px;
}
textarea::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
</style>
