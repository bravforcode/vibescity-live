import { computed } from "vue";
import { getShopPriority } from "../utils/shopUtils";

/**
 * useShopFilters
 * จัดการ Logic การ Filter และ Sort ร้านค้า
 */
export function useShopFilters(
	shops,
	activeCategories,
	activeStatus,
	activeShopId = { value: null },
) {
	// 1. Logic การ Filter (Category & Status)
	const filteredShops = computed(() => {
		return shops.value.filter((s) => {
			// ✅ Always include the active (selected) shop even if it doesn't match filters
			if (activeShopId.value != null && s.id == activeShopId.value) return true;

			// เช็ค Category (ถ้าไม่มีเลือกเลย หรือ อยู่ในตัวที่เลือก)
			const categoryMatch =
				activeCategories.value.length === 0 ||
				activeCategories.value.includes(s.category);
			// เช็ค Status
			const statusMatch =
				activeStatus.value === "ALL" || s.status === activeStatus.value;

			return categoryMatch && statusMatch;
		});
	});

	// 2. Logic การ Sort (ใช้ Priority จาก shopUtils)
	const sortedShops = computed(() => {
		return [...filteredShops.value].sort((a, b) => {
			return getShopPriority(a) - getShopPriority(b);
		});
	});

	// 3. ดึง Categories ทั้งหมดที่มีในระบบ
	const uniqueCategories = computed(() => {
		const allCats = shops.value.map((s) => s.category);
		return [...new Set(allCats)].filter((c) => c); // กรองค่าว่างทิ้ง
	});

	return {
		filteredShops,
		sortedShops,
		uniqueCategories,
	};
}
