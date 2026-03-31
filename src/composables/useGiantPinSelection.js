import { computed, ref, unref, watch } from "vue";
import { resolveGiantPinSelection } from "@/domain/venue/giantPinContext";
import { resolveVenueMedia } from "@/domain/venue/viewModel";

const normalizeId = (value) => {
	if (value === null || value === undefined) return null;
	const normalized = String(value).trim();
	return normalized || null;
};

export function useGiantPinSelection({ context, shops }) {
	const selectedShopId = ref(null);

	const resolvedSelection = computed(() =>
		resolveGiantPinSelection(unref(context), unref(shops) || []),
	);

	watch(
		() =>
			[
				resolvedSelection.value.contextId,
				resolvedSelection.value.buildingId,
			].join("::"),
		() => {
			selectedShopId.value = resolvedSelection.value.selectedShopId;
		},
		{ immediate: true },
	);

	const shopsInBuilding = computed(
		() => resolvedSelection.value.shopsInBuilding,
	);

	const selectedShop = computed(() => {
		const normalizedSelectedId = normalizeId(selectedShopId.value);
		return (
			shopsInBuilding.value.find(
				(shop) => normalizeId(shop?.id) === normalizedSelectedId,
			) ||
			shopsInBuilding.value.find(
				(shop) =>
					normalizeId(shop?.id) ===
					normalizeId(resolvedSelection.value.selectedShopId),
			) ||
			null
		);
	});

	const selectedShopMedia = computed(() =>
		resolveVenueMedia(selectedShop.value || {}),
	);

	const heroImage = computed(
		() =>
			selectedShopMedia.value.primaryImage ||
			selectedShopMedia.value.logoLike ||
			"",
	);

	const preloadTargets = computed(() => {
		const currentId = normalizeId(selectedShop.value?.id);
		const currentIndex = shopsInBuilding.value.findIndex(
			(shop) => normalizeId(shop?.id) === currentId,
		);
		const startIndex = currentIndex >= 0 ? currentIndex : 0;
		return shopsInBuilding.value.slice(startIndex, startIndex + 3);
	});

	const selectShop = (shopOrId) => {
		const nextId = normalizeId(
			typeof shopOrId === "object" && shopOrId !== null
				? shopOrId.id
				: shopOrId,
		);
		if (!nextId) return;
		const exists = shopsInBuilding.value.some(
			(shop) => normalizeId(shop?.id) === nextId,
		);
		if (!exists) return;
		selectedShopId.value = nextId;
	};

	return {
		selectedShopId,
		shopsInBuilding,
		selectedShop,
		selectedShopMedia,
		heroImage,
		preloadTargets,
		selectShop,
		hasResolvedBuilding: computed(
			() => resolvedSelection.value.hasResolvedBuilding,
		),
	};
}
