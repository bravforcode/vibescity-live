import axios from 'axios';

// Chiang Mai Inner City Bounds
// Chiang Mai Inner City Bounds (Default Fallback)
const DEFAULT_BOUNDS = {
  south: 18.75,
  west: 98.95,
  north: 18.83,
  east: 99.05
};

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Simple in-memory cache to prevent duplicate fetches in same session
const fetchedBoundsCache = new Set();

/**
 * Fetch roads from OpenStreetMap via Overpass API
 * @param {Object} bounds - { north, south, east, west }
 */
export const fetchRoadsFromOSM = async (bounds = null) => {
  const b = bounds || DEFAULT_BOUNDS;
  
  // Create a rough "key" for this area (rounded to avoid tiny shifts)
  const key = `${b.south.toFixed(3)},${b.west.toFixed(3)},${b.north.toFixed(3)},${b.east.toFixed(3)}`;
  
  if (fetchedBoundsCache.has(key)) {
    console.log('✅ Area already fetched:', key);
    return []; // Return empty to indicate "nothing new" (or handle differently)
  }

  // Also check session storage for legacy full-load cache if no bounds provided
  if (!bounds) {
    const cached = sessionStorage.getItem('vibecity_osm_roads');
    if (cached) return JSON.parse(cached);
  }

  const query = `
    [out:json][timeout:25];
    (
      way["highway"~"primary|secondary|tertiary|residential"](${b.south},${b.west},${b.north},${b.east});
    );
    out geom;
  `;

  try {
    console.log('🌐 Fetching real roads from Overpass API...', key);
    const response = await axios.get(OVERPASS_URL, {
      params: { data: query }
    });

    const routes = [];
    if (response.data && response.data.elements) {
      for (const el of response.data.elements) {
        if (el.type === 'way' && el.geometry) {
          // Convert geometry objects {lat, lon} to [lat, lng] arrays
          const latlngs = el.geometry.map(pt => [pt.lat, pt.lon]);
          routes.push(latlngs);
        }
      }
    }

    // Cache this key
    fetchedBoundsCache.add(key);

    // If default load, cache to session
    if (!bounds) {
      sessionStorage.setItem('vibecity_osm_roads', JSON.stringify(routes));
    }
    
    console.log(`✅ Fetched ${routes.length} road segments for area`);
    return routes;

  } catch (error) {
    console.error('❌ Error fetching OSM data:', error);
    return []; 
  }
};
