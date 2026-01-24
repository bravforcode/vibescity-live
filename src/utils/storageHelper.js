/**
 * Storage Helper with TTL (Time To Live)
 * Used for "Save/Bookmark" feature with 7-10 days expiration.
 */

const STORAGE_KEY = "vibecity-favorites-v2";
const DEFAULT_TTL_DAYS = 10;

export const loadFavoritesWithTTL = (ttlDays = DEFAULT_TTL_DAYS) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const items = JSON.parse(raw);
    const now = Date.now();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;

    // Filter valid items
    const validItems = items.filter(item => {
      // Handle legacy format (simple numbers) -> migrate to object
      if (typeof item === 'number') return true; 
      return (now - item.timestamp) < ttlMs;
    });

    // If items were pruned, update storage
    if (validItems.length !== items.length) {
      saveFavorites(validItems);
    }

    // Return just IDs for app usage
    return validItems.map(item => typeof item === 'number' ? item : item.id);
  } catch (e) {
    console.error("Failed to load favorites", e);
    return [];
  }
};

export const saveFavoriteItem = (id) => {
  const current = loadRawFavorites();
  // Check if exists
  if (!current.some(i => i.id === id)) {
    current.push({ id, timestamp: Date.now() });
    saveFavorites(current);
  }
};

export const removeFavoriteItem = (id) => {
  const current = loadRawFavorites();
  const filtered = current.filter(i => i.id !== id);
  saveFavorites(filtered);
};

// Internal Helpers
const loadRawFavorites = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    let items = JSON.parse(raw);
    // Migration: Convert numbers to objects
    if (items.some(i => typeof i === 'number')) {
      items = items.map(i => typeof i === 'number' ? { id: i, timestamp: Date.now() } : i);
      saveFavorites(items);
    }
    return items;
  } catch (e) {
    return [];
  }
};

const saveFavorites = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};
