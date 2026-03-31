import VibeModal from "./VibeModal.vue";

export default {
	title: "Modal/VibeModal",
	component: VibeModal,
	tags: ["autodocs"],
	argTypes: {
		shop: { control: "object" },
		userCount: { control: "number" },
		userLocation: { control: "array" },
	},
};

const mockShop = {
	id: "shop-123",
	name: "Pissamorn House",
	category: "Accommodation",
	status: "LIVE",
	rating: 4.8,
	lat: 18.7883,
	lng: 98.9853,
	Image_URL1: "https://picsum.photos/800/600",
	description: "A cozy place to stay in the heart of Chiang Mai.",
};

export const Default = {
	args: {
		shop: mockShop,
		userCount: 12,
		userLocation: [18.7876, 98.9912],
	},
};

export const NoImage = {
	args: {
		shop: {
			...mockShop,
			Image_URL1: null,
		},
		userCount: 5,
	},
};

export const PromoActive = {
	args: {
		shop: {
			...mockShop,
			isPromoted: true,
			boostActive: true,
		},
		userCount: 25,
	},
};
