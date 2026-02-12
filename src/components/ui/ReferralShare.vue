<script setup>
/**
 * ReferralShare.vue - Referral and social sharing
 * Feature #32: Referral System UI
 */
import { computed, ref } from "vue";
import { openExternal } from "../../utils/browserUtils";

const props = defineProps({
	isDarkMode: {
		type: Boolean,
		default: true,
	},
	referralCode: {
		type: String,
		default: "VIBE2024",
	},
	referralCount: {
		type: Number,
		default: 0,
	},
});

const emit = defineEmits(["share", "copy"]);

const isCopied = ref(false);

const shareUrl = computed(() => {
	return `https://vibecity.live/?ref=${props.referralCode}`;
});

const copyCode = async () => {
	try {
		await navigator.clipboard.writeText(shareUrl.value);
		isCopied.value = true;
		emit("copy", shareUrl.value);
		setTimeout(() => {
			isCopied.value = false;
		}, 2000);
	} catch (e) {
		console.error("Failed to copy:", e);
	}
};

const shareNative = async () => {
	if (navigator.share) {
		try {
			await navigator.share({
				title: "Join VibeCity!",
				text: "Discover the best nightlife in Chiang Mai 🎉",
				url: shareUrl.value,
			});
			emit("share", "native");
		} catch (e) {
			// User cancelled
		}
	}
};

const shareToApp = (app) => {
	const text = encodeURIComponent(
		"Discover the best nightlife in Chiang Mai! 🎉",
	);
	const url = encodeURIComponent(shareUrl.value);

	const urls = {
		facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
		twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
		line: `https://social-plugins.line.me/lineit/share?url=${url}`,
		whatsapp: `https://wa.me/?text=${text}%20${url}`,
	};

	openExternal(urls[app], "width=600,height=400");
	emit("share", app);
};
</script>

<template>
  <div
    :class="[
      'referral-card p-6 rounded-3xl',
      isDarkMode ? 'bg-zinc-800' : 'bg-gray-100',
    ]"
  >
    <!-- Header -->
    <div class="text-center mb-6">
      <div class="text-4xl mb-2">🎁</div>
      <h3
        :class="[
          'text-xl font-black',
          isDarkMode ? 'text-white' : 'text-gray-900',
        ]"
      >
        Invite Friends, Get Coins!
      </h3>
      <p :class="['text-sm', isDarkMode ? 'text-white/50' : 'text-gray-500']">
        Earn 50 coins for each friend who joins
      </p>
    </div>

    <!-- Referral code -->
    <div
      :class="[
        'flex items-center gap-2 p-3 rounded-xl mb-4',
        isDarkMode ? 'bg-zinc-900' : 'bg-white',
      ]"
    >
      <div class="flex-1">
        <div
          :class="[
            'text-xs font-medium mb-1',
            isDarkMode ? 'text-white/40' : 'text-gray-400',
          ]"
        >
          Your referral code
        </div>
        <div
          :class="[
            'text-lg font-mono font-black tracking-wider',
            isDarkMode ? 'text-white' : 'text-gray-900',
          ]"
        >
          {{ referralCode }}
        </div>
      </div>
      <button
        @click="copyCode"
        :class="[
          'px-4 py-2 rounded-lg font-bold text-sm transition-all',
          isCopied
            ? 'bg-green-500 text-white'
            : 'bg-purple-500 text-white hover:bg-purple-600',
        ]"
      >
        {{ isCopied ? "✓ Copied!" : "Copy" }}
      </button>
    </div>

    <!-- Share buttons -->
    <div class="grid grid-cols-4 gap-2 mb-4">
      <button
        @click="shareToApp('line')"
        class="flex flex-col items-center gap-1 p-3 rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors"
      >
        <span class="text-xl">💬</span>
        <span class="text-[10px] font-bold">LINE</span>
      </button>

      <button
        @click="shareToApp('facebook')"
        class="flex flex-col items-center gap-1 p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      >
        <span class="text-xl">📘</span>
        <span class="text-[10px] font-bold">Facebook</span>
      </button>

      <button
        @click="shareToApp('twitter')"
        class="flex flex-col items-center gap-1 p-3 rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition-colors"
      >
        <span class="text-xl">🐦</span>
        <span class="text-[10px] font-bold">Twitter</span>
      </button>

      <button
        @click="shareNative"
        :class="[
          'flex flex-col items-center gap-1 p-3 rounded-xl transition-colors',
          isDarkMode
            ? 'bg-zinc-700 text-white hover:bg-zinc-600'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        ]"
      >
        <span class="text-xl">📤</span>
        <span class="text-[10px] font-bold">More</span>
      </button>
    </div>

    <!-- Stats -->
    <div
      :class="[
        'text-center p-3 rounded-xl',
        isDarkMode ? 'bg-purple-500/10' : 'bg-purple-50',
      ]"
    >
      <div
        :class="[
          'text-2xl font-black',
          'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400',
        ]"
      >
        {{ referralCount }}
      </div>
      <div :class="['text-xs', isDarkMode ? 'text-white/50' : 'text-gray-500']">
        Friends invited • {{ referralCount * 50 }} coins earned
      </div>
    </div>
  </div>
</template>
