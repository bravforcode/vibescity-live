import VibeSkeleton from "./VibeSkeleton.vue";

export default {
	title: "UI/VibeSkeleton",
	component: VibeSkeleton,
	tags: ["autodocs"],
	argTypes: {
		variant: {
			control: "select",
			options: ["text", "card", "circle"],
		},
		width: { control: "text" },
		height: { control: "text" },
		borderRadius: { control: "text" },
	},
};

export const TextLine = {
	args: {
		variant: "text",
		width: "300px",
		height: "20px",
	},
};

export const Card = {
	args: {
		variant: "card",
		width: "200px",
		height: "150px",
	},
};

export const Avatar = {
	args: {
		variant: "circle",
		height: "50px",
	},
};

export const CustomStyle = {
	args: {
		variant: "card",
		width: "100px",
		height: "100px",
		borderRadius: "24px",
	},
};
