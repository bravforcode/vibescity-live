import { createStore, del, get, set } from "idb-keyval";

export interface OfflineFavoriteAction {
  type: "favorite";
  shopId: string;
  action: "add" | "remove";
  timestamp: number;
  retries: number;
  status: "pending" | "dead_letter";
}

export type OfflineAction = OfflineFavoriteAction;

const OFFLINE_DB_NAME =
  import.meta.env.VITE_OFFLINE_DB_NAME || "vibecity-offline-db";
const OFFLINE_STORE_NAME =
  import.meta.env.VITE_OFFLINE_STORE_NAME || "offline-actions";
const OFFLINE_QUEUE_KEY =
  import.meta.env.VITE_OFFLINE_QUEUE_KEY || "offline-action-queue";

const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 30_000;

// --- Storage Abstraction (IndexedDB → sessionStorage fallback) ---

let idbAvailable: boolean | null = null;
let idbStore: ReturnType<typeof createStore> | null = null;

const checkIdbAvailability = async (): Promise<boolean> => {
  if (idbAvailable !== null) return idbAvailable;
  try {
    idbStore = createStore(OFFLINE_DB_NAME, OFFLINE_STORE_NAME);
    await get(OFFLINE_QUEUE_KEY, idbStore);
    idbAvailable = true;
  } catch {
    idbAvailable = false;
    if (import.meta.env.DEV) {
      console.warn(
        "[offlineQueue] IndexedDB unavailable, using sessionStorage fallback",
      );
    }
  }
  return idbAvailable;
};

const sessionGet = (): OfflineAction[] => {
  try {
    const raw = sessionStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const sessionSet = (queue: OfflineAction[]): void => {
  try {
    sessionStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // sessionStorage full or unavailable — silently fail
  }
};

const normalizeAction = (action: OfflineAction): OfflineAction => ({
  type: "favorite",
  action: action.action,
  shopId: String(action.shopId),
  timestamp: Number(action.timestamp) || Date.now(),
  retries: Number(action.retries) || 0,
  status: action.status || "pending",
});

// --- Public API ---

export const loadOfflineActionQueue = async (): Promise<OfflineAction[]> => {
  const canUseIdb = await checkIdbAvailability();
  if (canUseIdb && idbStore) {
    const queue = await get<OfflineAction[] | undefined>(
      OFFLINE_QUEUE_KEY,
      idbStore,
    );
    if (!Array.isArray(queue)) return [];
    return queue.map(normalizeAction);
  }
  return sessionGet().map(normalizeAction);
};

export const saveOfflineActionQueue = async (
  queue: OfflineAction[],
): Promise<void> => {
  const normalized = queue.map(normalizeAction);
  const canUseIdb = await checkIdbAvailability();
  if (canUseIdb && idbStore) {
    await set(OFFLINE_QUEUE_KEY, normalized, idbStore);
  } else {
    sessionSet(normalized);
  }
};

export const appendOfflineAction = async (
  action: OfflineAction,
): Promise<OfflineAction[]> => {
  const existing = await loadOfflineActionQueue();
  const next = [...existing, normalizeAction(action)];
  await saveOfflineActionQueue(next);
  return next;
};

export const clearOfflineActionQueue = async (): Promise<void> => {
  const canUseIdb = await checkIdbAvailability();
  if (canUseIdb && idbStore) {
    await del(OFFLINE_QUEUE_KEY, idbStore);
  } else {
    sessionStorage.removeItem(OFFLINE_QUEUE_KEY);
  }
};

/**
 * CRDT intent deduplication:
 * If queue has both `add` and `remove` for the same shopId,
 * they cancel each other out — net-zero, remove both.
 */
export const deduplicateQueue = (queue: OfflineAction[]): OfflineAction[] => {
  const byShop = new Map<string, OfflineAction[]>();
  for (const item of queue) {
    if (item.type !== "favorite") continue;
    const existing = byShop.get(item.shopId) || [];
    existing.push(item);
    byShop.set(item.shopId, existing);
  }

  const result: OfflineAction[] = [];
  for (const [, actions] of byShop) {
    if (actions.length < 2) {
      result.push(...actions);
      continue;
    }

    // Sort by timestamp, keep only the latest
    actions.sort((a, b) => b.timestamp - a.timestamp);
    result.push(actions[0]);
  }

  return result;
};

/**
 * Calculate exponential back-off delay for a given retry count.
 * Formula: min(2^retries * 1000, MAX_BACKOFF_MS)
 */
export const getBackoffDelay = (retries: number): number =>
  Math.min(2 ** retries * 1000, MAX_BACKOFF_MS);

export { MAX_BACKOFF_MS, MAX_RETRIES };
