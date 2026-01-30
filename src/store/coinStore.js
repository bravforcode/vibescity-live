import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useCoinStore = defineStore("coins", () => {
    // State
    const coins = ref(0);
    const lastAwarded = ref(0);

    // Persistence
    const stored = localStorage.getItem("vibe_coins");
    if (stored) {
        coins.value = Number(stored);
    }

    watch(coins, (newVal) => {
        localStorage.setItem("vibe_coins", newVal);
    });

    // Actions
    const awardCoins = (amount = 1) => {
        coins.value += amount;
        lastAwarded.value = Date.now();
        return true;
    };

    const spendCoins = (amount) => {
        if (coins.value >= amount) {
            coins.value -= amount;
            return true;
        }
        return false;
    };

    return {
        coins,
        awardCoins,
        spendCoins
    };
});
