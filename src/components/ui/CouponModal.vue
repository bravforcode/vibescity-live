<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4"
  >
    <div
      class="bg-gray-800 rounded-2xl max-w-sm w-full p-6 text-center border border-neon-blue shadow-lg relative overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coupon-modal-title"
    >
      <!-- Glow Effect -->
      <div
        class="absolute inset-0 pointer-events-none bg-gradient-to-tr from-neon-blue/10 to-neon-cyan/10"
      ></div>

      <h2 id="coupon-modal-title" class="text-2xl font-bold text-white mb-2"> {{ $t("auto.k_b3371964") }} </h2>
      <p class="text-gray-300 mb-6">
        Redeem <strong>{{ couponName }}</strong> for
        <span class="text-yellow-400 font-bold">{{ cost }} Coins</span>?
      </p>

      <div class="flex gap-3 justify-center">
        <button
          @click="handleClaim"
          :disabled="loading"
          class="bg-gradient-to-r from-neon-blue to-neon-cyan text-white px-6 py-2 rounded-full font-bold shadow-lg hover:shadow-neon-blue/50 transition transform hover:scale-105 disabled:opacity-50"
        >
          {{ loading ? couponUiText("Claiming…", "กำลังแลก…") : couponUiText("Yes, Claim It!", "ยืนยันการแลก") }}
        </button>
        <button
          @click="$emit('close')"
          class="bg-gray-700 text-white px-6 py-2 rounded-full font-semibold hover:bg-gray-600 transition"
        >
          {{ couponUiText("Cancel", "ยกเลิก") }}
        </button>
      </div>

      <p v-if="error" class="mt-4 text-red-400 text-sm">{{ error }}</p>

      <div class="mt-6 text-left">
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
            {{ couponUiText("Recent redemptions", "การแลกล่าสุด") }}
          </h3>
          <span v-if="historyLoading" class="text-[11px] text-gray-500">
            {{ couponUiText("Loading...", "กำลังโหลด...") }}
          </span>
        </div>

        <p v-if="historyError" class="text-xs text-red-400">{{ historyError }}</p>
        <p
          v-else-if="historyItems.length === 0"
          class="text-xs text-gray-500"
        >
          {{ couponUiText("No redemptions yet.", "ยังไม่มีประวัติการแลก") }}
        </p>
        <ul v-else class="space-y-2">
          <li
            v-for="item in historyItems"
            :key="item.id"
            class="rounded-2xl border border-white/10 bg-black/20 px-3 py-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold text-white">
                {{ item.coupon_title || couponName }}
              </p>
              <span
                class="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200"
              >
                {{ item.status || "valid" }}
              </span>
            </div>
            <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
              <span class="truncate">{{ item.code || couponUiText("Code pending", "โค้ดกำลังอัปเดต") }}</span>
              <span>{{ formatHistoryDate(item.redeemed_at) }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import { runOptimisticMutation } from "@/composables/useOptimisticUpdate";
import i18n from "@/i18n.js";
import { redemptionService } from "@/services/redemptionService";
import { useUserStore } from "@/store/userStore";

const props = defineProps({
	isOpen: Boolean,
	couponId: Number,
	couponName: String,
	cost: Number,
});

const emit = defineEmits(["close", "success"]);
const userStore = useUserStore();
const { notify, notifySuccess, notifyError } = useNotifications();

const loading = ref(false);
const error = ref(null);
const historyLoading = ref(false);
const historyError = ref(null);
const historyItems = ref([]);

const couponUiText = (en, th) =>
	String(i18n.global.locale?.value || i18n.global.locale || "en")
		.toLowerCase()
		.startsWith("th")
		? th
		: en;

const formatHistoryDate = (value) => {
	if (!value) return couponUiText("Just now", "เมื่อสักครู่");
	try {
		return new Date(value).toLocaleDateString();
	} catch {
		return couponUiText("Just now", "เมื่อสักครู่");
	}
};

const loadHistory = async () => {
	if (!props.isOpen || !userStore.isAuthenticated) {
		historyItems.value = [];
		historyError.value = null;
		return;
	}

	historyLoading.value = true;
	historyError.value = null;
	try {
		historyItems.value = await redemptionService.getHistory(5);
	} catch (e) {
		historyError.value =
			e?.message ||
			couponUiText(
				"Failed to load redemption history",
				"โหลดประวัติการแลกไม่สำเร็จ",
			);
	} finally {
		historyLoading.value = false;
	}
};

const handleClaim = async () => {
	if (Number(userStore.profile.totalCoins || 0) < props.cost) {
		error.value = couponUiText("Not enough coins!", "เหรียญไม่พอ");
		notifyError(error.value);
		return;
	}

	loading.value = true;
	error.value = null;

	try {
		await runOptimisticMutation({
			capture: () => Number(userStore.profile.totalCoins || 0),
			applyOptimistic: () => {
				userStore.profile.totalCoins -= props.cost;
			},
			rollback: (snapshot) => {
				userStore.profile.totalCoins = Number.isFinite(snapshot)
					? snapshot
					: Number(userStore.profile.totalCoins || 0);
			},
			commit: () => redemptionService.claimCoupon(props.couponId),
			onSuccess: (res) => {
				historyItems.value = [
					{
						id: `coupon-redemption-${Date.now()}`,
						coupon_id: props.couponId,
						coupon_title: props.couponName,
						code: res?.data?.code || "",
						status: "valid",
						redeemed_at: new Date().toISOString(),
					},
					...historyItems.value,
				].slice(0, 5);
				notifySuccess(
					res?.message || couponUiText("Coupon claimed!", "แลกคูปองสำเร็จ"),
				);
				emit("success");
				emit("close");
			},
			onError: (e) => {
				error.value =
					e?.message ||
					couponUiText("Failed to claim coupon", "แลกคูปองไม่สำเร็จ");
			},
			notify,
			errorMessage: (e) =>
				e?.message || couponUiText("Failed to claim coupon", "แลกคูปองไม่สำเร็จ"),
		});
	} finally {
		loading.value = false;
	}
};

watch(
	() => props.isOpen,
	(isOpen) => {
		if (!isOpen) {
			error.value = null;
			return;
		}
		void loadHistory();
	},
	{ immediate: true },
);
</script>
