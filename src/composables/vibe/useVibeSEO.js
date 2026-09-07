import { watch } from "vue";
import { DEFAULT_OG_TITLE } from "../../config/appMeta";

export function useVibeSEO(activeShopId, activeCategories, shopStore) {
	// Metadata & Title
	const updateMetadata = () => {
		const baseTitle = DEFAULT_OG_TITLE;
		const currentShop = shopStore?.getShopById(activeShopId.value);
		const activeCat = activeCategories.value[0];

		if (currentShop) {
			document.title = `${currentShop.name} - VibeCity.live`;
		} else if (activeCat) {
			document.title = `${activeCat} in Thailand - VibeCity.live`;
		} else {
			document.title = baseTitle;
		}
	};

	watch([activeShopId, activeCategories], updateMetadata, {
		immediate: typeof window !== "undefined",
	});

	return {
		updateMetadata,
	};
}
