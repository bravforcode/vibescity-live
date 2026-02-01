import { ref } from "vue";

const BASE_URL = "http://127.0.0.1:8000"; // ✅ Connected to your local Python Backend

export function useTransportLogic() {
	const estimates = ref([]);
	const isLoading = ref(false);
	const error = ref(null);

	const fetchRideEstimates = async (destinationShop, userLocation) => {
		if (!destinationShop || !userLocation) return;

		isLoading.value = true;
		error.value = null;
		estimates.value = [];

		try {
			const [lat, lng] = userLocation;
			// Build payload matching backend RideEstimateRequest
			const payload = {
				origin: { lat, lng },
				destination: {
					lat: destinationShop.lat,
					lng: destinationShop.lng,
				},
			};

			const response = await fetch(`${BASE_URL}/api/v1/rides/estimate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error("Failed to fetch estimates");
			}

			const data = await response.json();
			estimates.value = data.providers; // Expecting { providers: [...] }
		} catch (err) {
			console.warn("Ride API unavailable, using mock estimates:", err);
            // ✅ Fallback Mock Data for Demo
            estimates.value = [
                { provider: "Grab", price: 145, duration: 12, icon: "🚗" },
                { provider: "Bolt", price: 120, duration: 15, icon: "⚡" },
                { provider: "RedTruck", price: 30, duration: 25, icon: "🔴" }
            ];
			error.value = null; // Clear error to show mock data
		} finally {
			isLoading.value = false;
		}
	};

	return {
		estimates,
		isLoading,
		error,
		fetchRideEstimates,
	};
}
