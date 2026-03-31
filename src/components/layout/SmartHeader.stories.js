import SmartHeader from "./SmartHeader.vue";

export default {
	title: "Layout/SmartHeader",
	component: SmartHeader,
	tags: ["autodocs"],
	argTypes: {
		isDarkMode: { control: "boolean" },
		isImmersive: { control: "boolean" },
		isLoading: { control: "boolean" },
		layoutMode: {
			control: "select",
			options: ["split", "full"],
		},
		globalSearchQuery: { control: "text" },
		showSearchResults: { control: "boolean" },
	},
};

export const Default = {
	args: {
		isDarkMode: true,
		isImmersive: false,
		isLoading: false,
		layoutMode: "split",
	},
};

export const Loading = {
	args: {
		...Default.args,
		isLoading: true,
	},
};

export const WithSearchQuery = {
	args: {
		...Default.args,
		globalSearchQuery: "Dragon Cafe",
		showSearchResults: true,
		globalSearchResults: [
			{ id: "1", name: "Dragon Cafe", category: "Cafe", rating: 4.5 },
			{ id: "2", name: "Dragon Bar", category: "Bar", rating: 4.2 },
		],
	},
};

export const ImmersiveMode = {
	args: {
		...Default.args,
		isImmersive: true,
	},
};
