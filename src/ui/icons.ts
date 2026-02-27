import { addCollection, Icon } from "@iconify/vue";
import flatColorIcons from "@iconify-json/flat-color-icons/icons.json";

/** Register icon collections at app startup (build-time bundled, NO CDN) */
export function addIconCollections() {
	addCollection(flatColorIcons);
}

export const ICONS = {
	map: "flat-color-icons:map",
	events: "flat-color-icons:flash-on",
	saved: "flat-color-icons:like",
	profile: "flat-color-icons:manager",
	favorites: "flat-color-icons:like",
	nightlife: "flat-color-icons:music",
	cafe: "flat-color-icons:cup",
	fashion: "flat-color-icons:shop",
	restaurant: "flat-color-icons:food",
	recommended: "flat-color-icons:approval",
	daily_checkin: "flat-color-icons:calendar",
	lucky_wheel: "flat-color-icons:collect",
	settings: "flat-color-icons:settings",
	menu: "flat-color-icons:menu",
	search: "flat-color-icons:search",
	coins: "flat-color-icons:currency-exchange",
	filter: "flat-color-icons:filled-filter",
} as const;

export type IconKey = keyof typeof ICONS;
export type IconName = (typeof ICONS)[IconKey];

export { Icon as AppIcon };
