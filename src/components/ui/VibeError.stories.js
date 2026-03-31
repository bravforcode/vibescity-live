import VibeError from "./VibeError.vue";

export default {
	title: "UI/VibeError",
	component: VibeError,
	tags: ["autodocs"],
	argTypes: {
		title: { control: "text" },
		message: { control: "text" },
		actionLabel: { control: "text" },
	},
};

export const Default = {
	args: {
		title: "Connection Interrupted",
		message:
			"We couldn't load the vibe city data. Please check your connection.",
		actionLabel: "Retry",
	},
};

export const CustomMessage = {
	args: {
		title: "System Offline",
		message:
			"The server is currently undergoing maintenance. Please try again later.",
		actionLabel: "Check Status",
	},
};
