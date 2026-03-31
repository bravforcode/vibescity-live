import BottomFeed from "./BottomFeed.vue";

export default {
	title: "Feed/BottomFeed",
	component: BottomFeed,
	tags: ["autodocs"],
	argTypes: {
		isDataLoading: { control: "boolean" },
		isRefreshing: { control: "boolean" },
		isImmersive: { control: "boolean" },
		isDarkMode: { control: "boolean" },
		liveCount: { control: "number" },
		carouselShops: { control: "object" },
	},
};

const mockShops = [
	{
		id: "1",
		name: "Dragon Cafe",
		category: "Cafe",
		status: "LIVE",
		rating: 4.5,
		Image_URL1: "https://picsum.photos/400/300?random=1",
	},
	{
		id: "2",
		name: "Ashi Hostel",
		category: "Accommodation",
		status: "OFF",
		rating: 4.8,
		Image_URL1: "https://picsum.photos/400/300?random=2",
	},
	{
		id: "3",
		name: "The Living Room",
		category: "Bar",
		status: "LIVE",
		rating: 4.2,
		Image_URL1: "https://picsum.photos/400/300?random=3",
	},
];

export const Default = {
	args: {
		isDataLoading: false,
		isRefreshing: false,
		isImmersive: false,
		isDarkMode: true,
		liveCount: 12,
		carouselShops: mockShops,
	},
};

export const Loading = {
	args: {
		...Default.args,
		isDataLoading: true,
	},
};

export const ImmersiveMode = {
	args: {
		...Default.args,
		isImmersive: true,
	},
};

export const Empty = {
	args: {
		...Default.args,
		carouselShops: [],
		liveCount: 0,
	},
};
