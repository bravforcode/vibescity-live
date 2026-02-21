<script setup>
import { Calendar, CheckCircle, CreditCard, XCircle } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import { useNotifications } from "@/composables/useNotifications";
import { getSupabaseEdgeBaseUrl } from "@/lib/runtimeConfig";
import { supabase } from "@/lib/supabase";

const props = defineProps({
	venueId: [String, Number],
});

const subscriptions = ref([]);
const loading = ref(true);
const processing = ref(null);
const confirmState = ref({
	isOpen: false,
	subscriptionId: "",
	action: "cancel",
});
const { notifyError, notifySuccess } = useNotifications();

const fetchSubscriptions = async () => {
	loading.value = true;
	const { data } = await supabase
		.from("subscriptions")
		.select("*")
		.eq("venue_id", props.venueId)
		.in("status", ["active", "trialing", "past_due"]); // Don't show fully canceled/expired ones unless requested

	subscriptions.value = data || [];
	loading.value = false;
};

const manageSub = async (subId, action) => {
	processing.value = subId;
	try {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session?.access_token)
			throw new Error("Please sign in to manage subscriptions.");

		const edgeUrl = getSupabaseEdgeBaseUrl();
		const res = await fetch(`${edgeUrl}/manage-subscription`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${session.access_token}`,
			},
			body: JSON.stringify({ action, subscriptionId: subId }),
		});

		const payload = await res.json().catch(() => ({}));
		if (!res.ok || payload?.success === false) {
			throw new Error(payload?.error || "Action failed");
		}

		await fetchSubscriptions(); // Refresh
		notifySuccess("Subscription updated");
	} catch (e) {
		notifyError(e.message);
	} finally {
		processing.value = null;
	}
};

const openManageConfirmation = (subId, action) => {
	confirmState.value = {
		isOpen: true,
		subscriptionId: String(subId || ""),
		action,
	};
};

const closeManageConfirmation = () => {
	confirmState.value.isOpen = false;
};

const confirmTitle = computed(() =>
	confirmState.value.action === "cancel"
		? "Stop auto-renewal?"
		: "Resume subscription?",
);

const confirmMessage = computed(() =>
	confirmState.value.action === "cancel"
		? "Your plan stays active until the end of the billing period."
		: "Auto-renewal will be turned back on for this subscription.",
);

const confirmAction = computed(() =>
	confirmState.value.action === "cancel" ? "Stop Renewal" : "Resume",
);

const submitManageAction = async () => {
	const { subscriptionId, action } = confirmState.value;
	closeManageConfirmation();
	if (!subscriptionId) return;
	await manageSub(subscriptionId, action);
};

const formatDate = (date) => new Date(date).toLocaleDateString();

onMounted(fetchSubscriptions);
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-sm font-bold text-white/50 uppercase tracking-widest mb-2">
      Active Subscriptions
    </h3>

    <div v-if="loading" class="text-white/30 text-xs">Loading...</div>
    <div v-else-if="subscriptions.length === 0" class="text-white/30 text-xs">
      No active subscriptions found.
    </div>

    <div
      v-for="sub in subscriptions"
      :key="sub.id"
      class="bg-zinc-900/50 border border-white/10 rounded-xl p-4 relative overflow-hidden"
    >
      <!-- Status Badge -->
      <div
        class="absolute top-0 right-0 px-2 py-1 text-[10px] font-bold uppercase rounded-bl-lg"
        :class="
          sub.cancel_at_period_end
            ? 'bg-yellow-500 text-black'
            : 'bg-green-500 text-black'
        "
      >
        {{ sub.cancel_at_period_end ? "Expiring" : "Auto-Renewing" }}
      </div>

      <div class="flex items-center gap-3 mb-3">
        <div
          class="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center text-pink-500"
        >
          <CreditCard class="w-5 h-5" />
        </div>
        <div>
          <div class="font-bold text-white text-sm">Primal Plan</div>
          <div class="text-xs text-white/50 font-mono">
            {{ sub.stripe_subscription_id.slice(-8) }}
          </div>
        </div>
      </div>

      <div
        class="flex items-center gap-2 text-xs text-white/70 mb-4 bg-black/20 p-2 rounded-lg"
      >
        <Calendar class="w-3 h-3" />
        <span v-if="sub.cancel_at_period_end"
          >Ends on {{ formatDate(sub.current_period_end) }}</span
        >
        <span v-else>Renews on {{ formatDate(sub.current_period_end) }}</span>
      </div>

      <!-- Actions -->
      <button
        v-if="!sub.cancel_at_period_end"
        @click="openManageConfirmation(sub.stripe_subscription_id, 'cancel')"
        :disabled="!!processing"
        class="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
      >
        <XCircle class="w-3 h-3" /> Cancel Auto-Renewal
      </button>
      <button
        v-else
        @click="openManageConfirmation(sub.stripe_subscription_id, 'resume')"
        :disabled="!!processing"
        class="w-full py-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/30 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
      >
        <CheckCircle class="w-3 h-3" /> Resume Subscription
      </button>
    </div>

    <ConfirmDialog
      :is-open="confirmState.isOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmAction"
      cancel-label="Cancel"
      variant="primary"
      :loading="!!processing"
      @confirm="submitManageAction"
      @cancel="closeManageConfirmation"
      @close="closeManageConfirmation"
    />
  </div>
</template>
