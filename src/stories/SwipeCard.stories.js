import SwipeCard from "../components/ui/SwipeCard.vue";

// 1. Setup the "Meta" config (Tells Storybook about the component)
export default {
	title: "UI/SwipeCard",
	component: SwipeCard,
	tags: ["autodocs"],
	argTypes: {
		// Define controls for props
		showExpand: { control: "boolean" },
		disabled: { control: "boolean" },
	},
};

// 2. Define a "Template" (How to render it)
const Template = (args) => ({
	components: { SwipeCard },
	setup() {
		return { args };
	},
	template: `
    <div class="h-[400px] w-[300px] bg-gray-900 border border-white/10 rounded-2xl relative overflow-hidden">
      <SwipeCard v-bind="args">
        <div class="p-4 text-white">
          <h2 class="text-xl font-bold">Hello VibeCity</h2>
          <p class="text-white/60">This is swipeable content</p>
          <div class="mt-4 h-32 bg-blue-500/20 rounded-xl"></div>
        </div>
      </SwipeCard>
    </div>
  `,
});

// 3. Create Stories (Variations)

export const Default = Template.bind({});
Default.args = {
	showExpand: true,
	disabled: false,
};

export const Disabled = Template.bind({});
Disabled.args = {
	showExpand: false,
	disabled: true,
};
