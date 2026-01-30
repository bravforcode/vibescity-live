import { defineStore } from "pinia";
import { ref } from "vue";

export const useRoomStore = defineStore("room", () => {
    // Map shopId -> userCount
    const shopCounts = ref({});

    // Actions
    const updateCounts = (data) => {
        // data expects format: { "1": 5, "2": 3 }
        shopCounts.value = { ...shopCounts.value, ...data };
    };

    const updateSingleCount = (shopId, count) => {
        shopCounts.value[shopId] = count;
    };

    const getCount = (shopId) => {
        return shopCounts.value[shopId] || 0;
    };

    return {
        shopCounts,
        updateCounts,
        updateSingleCount,
        getCount
    };
});
