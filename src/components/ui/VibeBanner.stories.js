import VibeBanner from "./VibeBanner.vue";

export default {
	title: "UI/VibeBanner",
	component: VibeBanner,
	tags: ["autodocs"],
	argTypes: {
		text: { control: "text" },
		visible: { control: "boolean" },
	},
};

export const Default = {
	args: {
		text: "VIBE OF THE HOUR",
		visible: true,
	},
};

export const CustomText = {
	args: {
		text: "NEW YEAR CELEBRATION 2026",
		visible: true,
	},
};

export const Hidden = {
	args: {
		text: "VIBE OF THE HOUR",
		visible: false,
	},
};
