<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4"
  >
    <div
      class="bg-gray-800 rounded-2xl max-w-sm w-full p-6 text-center border border-neon-blue shadow-lg relative overflow-hidden"
    >
      <!-- Glow Effect -->
      <div
        class="absolute inset-0 pointer-events-none bg-gradient-to-tr from-neon-blue/10 to-neon-purple/10"
      ></div>

      <h2 class="text-2xl font-bold text-white mb-2">Claim Coupon?</h2>
      <p class="text-gray-300 mb-6">
        Redeem <strong>{{ couponName }}</strong> for
        <span class="text-yellow-400 font-bold">{{ cost }} Coins</span>?
      </p>

      <div class="flex gap-3 justify-center">
        <button
          @click="handleClaim"
          :disabled="loading"
          class="bg-gradient-to-r from-neon-blue to-neon-purple text-white px-6 py-2 rounded-full font-bold shadow-lg hover:shadow-neon-blue/50 transition transform hover:scale-105 disabled:opacity-50"
        >
          {{ loading ? "Claiming..." : "Yes, Claim It!" }}
        </button>
        <button
          @click="$emit('close')"
          class="bg-gray-700 text-white px-6 py-2 rounded-full font-semibold hover:bg-gray-600 transition"
        >
          Cancel
        </button>
      </div>

      <p v-if="error" class="mt-4 text-red-400 text-sm">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import { redemptionService } from "../services/redemptionService";
import { useUserStore } from "../store/userStore";

const props = defineProps({
	isOpen: Boolean,
	couponId: Number,
	couponName: String,
	cost: Number,
});

const emit = defineEmits(["close", "success"]);
const userStore = useUserStore();
const { notifySuccess, notifyError } = useNotifications();

const loading = ref(false);
const error = ref(null);

const handleClaim = async () => {
	if (userStore.profile.totalCoins < props.cost) {
		error.value = "Not enough coins!";
		return;
	}

	loading.value = true;
	error.value = null;

	try {
		const res = await redemptionService.claimCoupon(props.couponId);
		// Optimistic update (or refetch profile)
		userStore.profile.totalCoins -= props.cost;
		notifySuccess(res.message || "Coupon claimed!");
		emit("success");
		emit("close");
	} catch (e) {
		error.value = e.message;
		notifyError(e.message);
	} finally {
		loading.value = false;
	}
};
</script>
