"""
Ride Service - Aggregates multiple ride-hailing providers
Generates deep links and price estimates for Grab, Bolt, Lineman, Maxim
"""
from typing import Dict, List, Optional
from dataclasses import dataclass
import math
from urllib.parse import urlencode

@dataclass
class Location:
    lat: float
    lng: float

@dataclass
class RideEstimate:
    name: str
    service: str
    price: int
    currency: str
    eta_mins: int
    deep_link: str
    icon: str
    available: bool = True

class RideService:
    """
    Aggregates ride estimates from multiple providers.
    Uses deep links for app launching (no official API needed).
    """

    # Base rates per km (approximate THB)
    RATES = {
        "grab": {"base": 25, "per_km": 12, "min": 40},
        "bolt": {"base": 20, "per_km": 10, "min": 35},
        "lineman": {"base": 30, "per_km": 11, "min": 45},
        "maxim": {"base": 15, "per_km": 8, "min": 30},
        "indriver": {"base": 20, "per_km": 9, "min": 35},
    }

    # Service availability by province
    AVAILABILITY = {
        "grab": ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต", "ขอนแก่น", "หาดใหญ่", "พัทยา"],
        "bolt": ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต"],
        "lineman": ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต", "ขอนแก่น"],
        "maxim": ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต", "ขอนแก่น", "อุดรธานี"],
        "indriver": ["กรุงเทพมหานคร", "เชียงใหม่"],
    }

    @staticmethod
    def calculate_distance(origin: Location, destination: Location) -> float:
        """Calculate distance between two points using Haversine formula (km)"""
        R = 6371  # Earth's radius in km

        lat1, lon1 = math.radians(origin.lat), math.radians(origin.lng)
        lat2, lon2 = math.radians(destination.lat), math.radians(destination.lng)

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))

        return R * c

    @staticmethod
    def estimate_eta(distance_km: float) -> int:
        """Estimate ETA based on distance (assuming average 25 km/h in city)"""
        base_mins = 3  # Pickup time
        travel_mins = (distance_km / 25) * 60
        return int(base_mins + travel_mins)

    def calculate_price(self, provider: str, distance_km: float) -> int:
        """Calculate estimated price for a provider"""
        rates = self.RATES.get(provider, self.RATES["grab"])
        price = rates["base"] + (distance_km * rates["per_km"])
        return max(int(price), rates["min"])

    def generate_deep_link(self, provider: str, origin: Location, destination: Location) -> str:
        """Generate deep link for ride-hailing apps"""

        dest_lat, dest_lng = destination.lat, destination.lng
        orig_lat, orig_lng = origin.lat, origin.lng

        if provider == "grab":
            # Grab deep link format
            params = {
                "pickupLat": orig_lat,
                "pickupLng": orig_lng,
                "dropoffLat": dest_lat,
                "dropoffLng": dest_lng,
            }
            return f"grab://open?screenType=BOOKING&{urlencode(params)}"

        elif provider == "bolt":
            # Bolt deep link
            return f"bolt://open?pickup_lat={orig_lat}&pickup_lng={orig_lng}&dropoff_lat={dest_lat}&dropoff_lng={dest_lng}"

        elif provider == "lineman":
            # Lineman Taxi deep link
            return f"lineman://taxi?from_lat={orig_lat}&from_lng={orig_lng}&to_lat={dest_lat}&to_lng={dest_lng}"

        elif provider == "maxim":
            # Maxim deep link
            return f"maximtaxi://order?start_lat={orig_lat}&start_lng={orig_lng}&end_lat={dest_lat}&end_lng={dest_lng}"

        elif provider == "indriver":
            # InDriver deep link
            return f"indriver://order?from_latitude={orig_lat}&from_longitude={orig_lng}&to_latitude={dest_lat}&to_longitude={dest_lng}"

        # Fallback to Google Maps directions
        return f"https://www.google.com/maps/dir/?api=1&origin={orig_lat},{orig_lng}&destination={dest_lat},{dest_lng}&travelmode=driving"

    def get_fallback_link(self, provider: str, destination: Location) -> str:
        """Get web/play store fallback if app not installed"""
        stores = {
            "grab": "https://grab.onelink.me/2695613898",
            "bolt": "https://bolt.onelink.me/10",
            "lineman": "https://lineman.onelink.me/1234",
            "maxim": "https://taximaxim.onelink.me/1",
            "indriver": "https://indriver.onelink.me/1",
        }
        return stores.get(provider, f"https://google.com/maps/search/?api=1&query={destination.lat},{destination.lng}")

    def get_estimates(
        self,
        origin: Location,
        destination: Location,
        province: str = "กรุงเทพมหานคร"
    ) -> List[RideEstimate]:
        """
        Get ride estimates from all available providers.
        Returns sorted list by price (cheapest first).
        """
        distance = self.calculate_distance(origin, destination)
        eta_base = self.estimate_eta(distance)

        estimates = []

        provider_info = [
            ("grab", "Grab", "JustGrab", "🚗", 0),
            ("bolt", "Bolt", "Economy", "⚡", 1),
            ("lineman", "Lineman", "Taxi", "🏍️", 2),
            ("maxim", "Maxim", "Economy", "🚕", -1),
            ("indriver", "InDriver", "Negotiate", "💬", 3),
        ]

        for provider_id, name, service, icon, eta_offset in provider_info:
            available = province in self.AVAILABILITY.get(provider_id, [])

            estimates.append(RideEstimate(
                name=name,
                service=service,
                price=self.calculate_price(provider_id, distance),
                currency="THB",
                eta_mins=max(1, eta_base + eta_offset),
                deep_link=self.generate_deep_link(provider_id, origin, destination),
                icon=icon,
                available=available
            ))

        # Sort by price, available first
        estimates.sort(key=lambda x: (not x.available, x.price))

        return estimates


# Singleton instance
ride_service = RideService()
