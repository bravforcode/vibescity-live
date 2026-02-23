<script setup>
import { computed } from "vue";

const props = defineProps({
	isOpen: {
		type: Boolean,
		default: false,
	},
	title: {
		type: String,
		default: "Confirm action",
	},
	message: {
		type: String,
		default: "",
	},
	confirmLabel: {
		type: String,
		default: "Confirm",
	},
	cancelLabel: {
		type: String,
		default: "Cancel",
	},
	loading: {
		type: Boolean,
		default: false,
	},
	variant: {
		type: String,
		default: "danger", // danger | primary
	},
});

const emit = defineEmits(["confirm", "cancel", "close"]);

const confirmClass = computed(() =>
	props.variant === "primary"
		? "bg-blue-600 hover:bg-blue-500 border-blue-500/40"
		: "bg-red-600 hover:bg-red-500 border-red-500/40",
);

const closeDialog = () => {
	emit("cancel");
	emit("close");
};
</script>

<template>
	<Teleport to="body">
		<div
			v-if="isOpen"
			class="fixed inset-0 z-[9100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			data-testid="confirm-dialog"
			@click.self="closeDialog"
		>
			<div class="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl">
				<h3 class="text-lg font-bold text-white">{{ title }}</h3>
				<p v-if="message" class="mt-2 text-sm text-white/70">
					{{ message }}
				</p>
				<slot />

				<div class="mt-5 flex justify-end gap-2">
					<button
						type="button"
						:disabled="loading"
						class="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
						data-testid="confirm-dialog-cancel"
						@click="closeDialog"
					>
						{{ cancelLabel }}
					</button>
					<button
						type="button"
						:disabled="loading"
						:class="[
							'rounded-lg border px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60',
							confirmClass,
						]"
						data-testid="confirm-dialog-confirm"
						@click="$emit('confirm')"
					>
						{{ loading ? "Processing..." : confirmLabel }}
					</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>
