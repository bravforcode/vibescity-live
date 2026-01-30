import { ref } from 'vue';

const BASE_URL = 'http://127.0.0.1:8000'; // Hardcoded for now, should use env

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
                    lng: destinationShop.lng
                }
            };

            const response = await fetch(`${BASE_URL}/api/v1/rides/estimate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Failed to fetch estimates');
            }

            const data = await response.json();
            estimates.value = data.providers; // Expecting { providers: [...] }

        } catch (err) {
            console.error("Ride Estimate Error:", err);
            error.value = "Unable to load real-time prices.";
        } finally {
            isLoading.value = false;
        }
    };

    return {
        estimates,
        isLoading,
        error,
        fetchRideEstimates
    };
}
