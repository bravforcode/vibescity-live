<template>
  <div class="fixed inset-0 pointer-events-none flex flex-col items-end px-4 py-6 gap-3 z-50" aria-live="assertive">
    <transition-group name="toast" tag="div" class="flex flex-col gap-3 w-full sm:w-96">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto rounded-xl border shadow-lg p-4 text-sm bg-gray-900/95 backdrop-blur border-gray-700"
        :class="typeClass(toast.type)"
      >
        <div class="flex items-start gap-3">
          <div class="mt-0.5 text-lg">
            <span v-if="toast.type === 'success'">✅</span>
            <span v-else-if="toast.type === 'error'">⚠️</span>
            <span v-else>🔔</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-white" v-if="toast.title">{{ toast.title }}</div>
            <div class="text-gray-200 whitespace-pre-line">{{ toast.message }}</div>
            <button
              v-if="toast.action && toast.actionLabel"
              class="mt-2 text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline"
              @click="handleAction(toast)"
            >
              {{ toast.actionLabel }}
            </button>
          </div>
          <button
            class="text-gray-400 hover:text-white text-lg"
            @click="dismiss(toast.id)"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useNotifications } from "@/composables/useNotifications";

const { state, dismiss } = useNotifications();

const toasts = computed(() => state.queue);

const typeClass = (type) => {
	if (type === "success") return "border-emerald-600/60 bg-emerald-600/10";
	if (type === "error") return "border-rose-600/60 bg-rose-600/10";
	return "border-sky-500/60 bg-sky-500/10";
};

const handleAction = (toast) => {
	try {
		toast.action?.();
	} finally {
		dismiss(toast.id);
	}
};
</script>

<style scoped>
.toast-enter-from { opacity: 0; transform: translateY(8px); }
.toast-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toast-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; opacity: 0; }
</style>
