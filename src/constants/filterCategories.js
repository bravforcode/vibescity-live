// src/constants/filterCategories.js
import {
	Coffee,
	Music,
	ShoppingBag,
	Star,
	ThumbsUp,
	Utensils,
} from "lucide-vue-next";

/**
 * @typedef {"Recommended"|"Cafe"|"Nightlife"|"Restaurant"|"Shopping"|"Events"} FilterCategoryId
 */

/**
 * @typedef {Object} FilterCategoryConfig
 * @property {FilterCategoryId} id
 * @property {string} label
 * @property {any} icon
 * @property {string} gradient
 * @property {string} glow
 * @property {string} iconColor
 */

/** @type {FilterCategoryConfig[]} */
export const FILTER_CATEGORIES = [
	{
		id: "Recommended",
		label: "Recommended",
		icon: ThumbsUp,
		gradient: "from-emerald-300 via-teal-200 to-cyan-300",
		glow: "shadow-emerald-400/30",
		iconColor: "text-emerald-400",
	},
	{
		id: "Cafe",
		label: "Cafe & Bistro",
		icon: Coffee,
		gradient: "from-orange-300 via-amber-200 to-yellow-300",
		glow: "shadow-orange-400/30",
		iconColor: "text-orange-400",
	},
	{
		id: "Nightlife",
		label: "Nightlife",
		icon: Music,
		gradient: "from-purple-300 via-violet-200 to-fuchsia-300",
		glow: "shadow-purple-400/30",
		iconColor: "text-purple-400",
	},
	{
		id: "Restaurant",
		label: "Restaurant",
		icon: Utensils,
		gradient: "from-red-300 via-rose-200 to-pink-300",
		glow: "shadow-red-400/30",
		iconColor: "text-red-400",
	},
	{
		id: "Shopping",
		label: "Fashion & Shopping",
		icon: ShoppingBag,
		gradient: "from-pink-300 via-rose-200 to-fuchsia-300",
		glow: "shadow-pink-400/30",
		iconColor: "text-pink-400",
	},
	{
		id: "Events",
		label: "Events & Festivals",
		icon: Star,
		gradient: "from-yellow-300 via-amber-200 to-orange-300",
		glow: "shadow-yellow-400/30",
		iconColor: "text-yellow-400",
	},
];

/**
 * @param {unknown} id
 * @returns {id is FilterCategoryId}
 */
export const isValidCategoryId = (id) => {
	if (typeof id !== "string") return false;
	return FILTER_CATEGORIES.some((c) => c.id === id);
};

/**
 * @param {unknown} ids
 * @returns {ids is FilterCategoryId[]}
 */
export const validateCategoryIds = (ids) => {
	if (!Array.isArray(ids)) return false;
	return ids.every(isValidCategoryId);
};
