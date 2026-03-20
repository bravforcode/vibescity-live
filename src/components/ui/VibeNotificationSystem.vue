<template>
  <div class="vibe-notification-system">
    <VibeNotification
      v-for="notification in notifications"
      :key="notification.id"
      :show="notification.show"
      :type="notification.type"
      :title="notification.title"
      :message="notification.message"
      :points="notification.points"
      :auto-dismiss="notification.autoDismiss"
      :duration="notification.duration"
      @close="removeNotification(notification.id)"
    />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import VibeNotification from "./VibeNotification.vue";

const notifications = ref([]);

const addNotification = (notification) => {
	const id = Date.now() + Math.random();
	const newNotification = {
		id,
		show: true,
		...notification,
	};

	notifications.value.push(newNotification);

	// Auto-remove after duration
	if (notification.autoDismiss !== false) {
		setTimeout(() => {
			removeNotification(id);
		}, notification.duration || 5000);
	}
};

const removeNotification = (id) => {
	const index = notifications.value.findIndex((n) => n.id === id);
	if (index !== -1) {
		notifications.value.splice(index, 1);
	}
};

const showSuccess = (title, message, options = {}) => {
	addNotification({
		type: "success",
		title,
		message,
		...options,
	});
};

const showError = (title, message, options = {}) => {
	addNotification({
		type: "error",
		title,
		message,
		...options,
	});
};

const showVibeClaim = (points, placeName = null) => {
	addNotification({
		type: "vibe_claim",
		title: "Vibe Claimed!",
		message: placeName
			? `Successfully claimed vibe at ${placeName}!`
			: "Vibe claimed successfully!",
		points,
		autoDismiss: true,
		duration: 4000,
	});
};

// Listen for custom vibe notification events
const handleVibeNotification = (event) => {
	const { type, message } = event.detail;

	if (type === "success") {
		showSuccess("Success", message);
	} else if (type === "error") {
		showError("Error", message);
	} else if (type === "vibe_claim") {
		showVibeClaim(event.detail.points || 25, event.detail.placeName);
	}
};

onMounted(() => {
	window.addEventListener("vibe-notification", handleVibeNotification);
});

onUnmounted(() => {
	window.removeEventListener("vibe-notification", handleVibeNotification);
});

// Expose methods globally
if (typeof window !== "undefined") {
	window.vibeNotification = {
		showSuccess,
		showError,
		showVibeClaim,
	};
}
</script>

<style scoped>
.vibe-notification-system {
  @apply fixed top-4 right-4 z-[9999] pointer-events-none;
  max-width: 400px;
  min-width: 300px;
}

/* Responsive */
@media (max-width: 640px) {
  .vibe-notification-system {
    @apply top-2 right-2 left-2;
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .vibe-notification-system * {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
