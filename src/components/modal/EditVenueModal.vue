<script setup>
import { Loader2, Save, X } from "lucide-vue-next";
import { ref } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import { supabase } from "@/lib/supabase";

const props = defineProps({
	venue: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(["close"]);

const form = ref({
	name: props.venue.shop_name || props.venue.name,
	category: props.venue.category,
	description: props.venue.description,
});

const isSaving = ref(false);
const { notifySuccess, notifyError } = useNotifications();

const saveChanges = async () => {
	isSaving.value = true;
	try {
		const visitorId = localStorage.getItem("vibe_visitor_id");
		if (!visitorId) throw new Error("Visitor ID missing");

		const { error } = await supabase.rpc("update_venue_anonymous", {
			p_shop_id: props.venue.id,
			p_visitor_id: visitorId,
			p_updates: form.value,
		});

		if (error) throw error;

		notifySuccess("Venue updated successfully!");
		emit("close", true); // Refresh parent
	} catch (e) {
		notifyError(`Error updating: ${e.message}`);
	} finally {
		isSaving.value = false;
	}
};
</script>

<template>
  <div class="fixed inset-0 z-[8000] flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/80 backdrop-blur-md"
      @click="emit('close')"
    ></div>

    <!-- Modal -->
    <div
      class="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-6"
    >
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold text-white">Edit Venue</h3>
        <button
          @click="emit('close')"
          class="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-white/50 uppercase mb-1"
            >Venue Name</label
          >
          <input
            v-model="form.name"
            class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-white/50 uppercase mb-1"
            >Category</label
          >
          <select
            v-model="form.category"
            class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
          >
            <option value="Cafe">Cafe</option>
            <option value="Restaurant">Restaurant</option>
            <option value="Bar">Bar</option>
            <option value="Nightclub">Nightclub</option>
            <option value="Fashion">Fashion</option>
            <option value="Event">Event</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-white/50 uppercase mb-1"
            >Description</label
          >
          <textarea
            v-model="form.description"
            rows="3"
            class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none resize-none"
          ></textarea>
        </div>

        <button
          @click="saveChanges"
          :disabled="isSaving"
          class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition mt-4"
        >
          <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
          <Save v-else class="w-4 h-4" />
          {{ isSaving ? "Saving…" : "Save Changes" }}
        </button>
      </div>
    </div>
  </div>
</template>
