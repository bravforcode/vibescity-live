import { computed, ref } from "vue";

const currentCurrency = ref("THB");
const exchangeRate = ref(0.029); // 1 THB = 0.029 USD (approx)

export function useCurrency() {
	const initCurrency = () => {
		const saved = localStorage.getItem("vibe_currency");
		if (saved) {
			currentCurrency.value = saved;
		} else {
			// Auto-detect from browser locale
			const isThai = navigator.language.startsWith("th");
			currentCurrency.value = isThai ? "THB" : "USD";
		}
	};

	const toggleCurrency = () => {
		currentCurrency.value = currentCurrency.value === "THB" ? "USD" : "THB";
		localStorage.setItem("vibe_currency", currentCurrency.value);
	};

	const setCurrency = (code) => {
		if (code !== "THB" && code !== "USD") return;
		currentCurrency.value = code;
		localStorage.setItem("vibe_currency", code);
	};

	const formatPrice = (amountTHB) => {
		if (currentCurrency.value === "THB") {
			return `฿${amountTHB.toLocaleString()}`;
		} else {
			const usdAmount = (amountTHB * exchangeRate.value).toFixed(2);
			return `$${usdAmount}`;
		}
	};

	const getPriceValue = (amountTHB) => {
		if (currentCurrency.value === "THB") return amountTHB;
		return parseFloat((amountTHB * exchangeRate.value).toFixed(2));
	};

	return {
		currentCurrency: computed(() => currentCurrency.value),
		toggleCurrency,
		setCurrency,
		formatPrice,
		getPriceValue,
		initCurrency,
	};
}
