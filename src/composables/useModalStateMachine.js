import { computed, ref } from "vue";
import { classifyGestureIntent, GESTURE_INTENT } from "./useGestureIntent";

export const MODAL_FSM_STATE = Object.freeze({
	CLOSED: "CLOSED",
	OPENING: "OPENING",
	OPEN: "OPEN",
	DISMISSING: "DISMISSING",
	LOCKED: "LOCKED",
});

export const MODAL_EVENT = Object.freeze({
	TAP_PIN: "TAP_PIN",
	TAP_CARD: "TAP_CARD",
	OPEN_RIDE: "OPEN_RIDE",
	OPEN_MALL: "OPEN_MALL",
	SWIPE_DOWN: "SWIPE_DOWN",
	ESC_CLOSE: "ESC_CLOSE",
	PROGRAMMATIC_CLOSE: "PROGRAMMATIC_CLOSE",
	SCROLL_CENTER: "SCROLL_CENTER",
	MOMENTUM_TAIL: "MOMENTUM_TAIL",
	ANIMATION_END: "ANIMATION_END",
});

const normalizeShopId = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

export function useModalStateMachine() {
	const state = ref(MODAL_FSM_STATE.CLOSED);
	const activeModal = ref(null); // "vibe" | "ride" | "mall" | null
	const activeShopId = ref("");
	const lockedShops = ref(new Map());
	const pendingLock = ref(null);

	const isAnimating = computed(
		() =>
			state.value === MODAL_FSM_STATE.OPENING ||
			state.value === MODAL_FSM_STATE.DISMISSING,
	);

	const isLocked = (shopId) => {
		const normalized = normalizeShopId(shopId);
		if (!normalized) return false;
		return lockedShops.value.has(normalized);
	};

	const lockShop = (shopId, reason = "swipe") => {
		const normalized = normalizeShopId(shopId);
		if (!normalized) return;
		lockedShops.value = new Map(lockedShops.value);
		lockedShops.value.set(normalized, {
			reason: String(reason || "swipe"),
			at: Date.now(),
		});
	};

	const clearLock = (shopId) => {
		const normalized = normalizeShopId(shopId);
		if (!normalized || !lockedShops.value.has(normalized)) return;
		const next = new Map(lockedShops.value);
		next.delete(normalized);
		lockedShops.value = next;
		if (next.size === 0 && state.value === MODAL_FSM_STATE.LOCKED) {
			state.value = MODAL_FSM_STATE.CLOSED;
		}
	};

	const clearAllLocks = () => {
		lockedShops.value = new Map();
		if (state.value === MODAL_FSM_STATE.LOCKED) {
			state.value = MODAL_FSM_STATE.CLOSED;
		}
	};

	const canAutoOpen = (shopId, intentContext = {}) => {
		const normalized = normalizeShopId(shopId);
		if (!normalized) return false;
		if (isAnimating.value) return false;
		if (isLocked(normalized)) return false;
		const intentType = classifyGestureIntent(intentContext);
		if (intentType === GESTURE_INTENT.MOMENTUM_TAIL) return false;
		return true;
	};

	const openModal = (modalType, shopId = "") => {
		activeModal.value = modalType;
		activeShopId.value = normalizeShopId(shopId);
		state.value = MODAL_FSM_STATE.OPENING;
	};

	const beginDismiss = ({ reason = "programmatic", lockShopId = "" } = {}) => {
		if (
			state.value !== MODAL_FSM_STATE.OPEN &&
			state.value !== MODAL_FSM_STATE.OPENING
		) {
			return;
		}
		if (reason === "swipe" && lockShopId) {
			pendingLock.value = normalizeShopId(lockShopId);
		} else {
			pendingLock.value = null;
		}
		state.value = MODAL_FSM_STATE.DISMISSING;
	};

	const dispatch = (event, payload = {}) => {
		const evt = String(event || "").trim();
		const targetShopId = normalizeShopId(payload.shopId);

		switch (evt) {
			case MODAL_EVENT.TAP_PIN:
			case MODAL_EVENT.TAP_CARD: {
				if (targetShopId) clearLock(targetShopId);
				openModal("vibe", targetShopId);
				return;
			}
			case MODAL_EVENT.OPEN_RIDE: {
				openModal("ride", targetShopId);
				return;
			}
			case MODAL_EVENT.OPEN_MALL: {
				openModal("mall", targetShopId);
				return;
			}
			case MODAL_EVENT.SWIPE_DOWN: {
				beginDismiss({
					reason: "swipe",
					lockShopId: targetShopId || activeShopId.value,
				});
				return;
			}
			case MODAL_EVENT.ESC_CLOSE: {
				beginDismiss({ reason: "escape" });
				return;
			}
			case MODAL_EVENT.PROGRAMMATIC_CLOSE: {
				beginDismiss({ reason: "programmatic" });
				return;
			}
			case MODAL_EVENT.MOMENTUM_TAIL:
			case MODAL_EVENT.SCROLL_CENTER: {
				// Guarded by canAutoOpen at caller; explicit no-op transition.
				return;
			}
			case MODAL_EVENT.ANIMATION_END: {
				if (state.value === MODAL_FSM_STATE.OPENING) {
					state.value = MODAL_FSM_STATE.OPEN;
					return;
				}
				if (state.value === MODAL_FSM_STATE.DISMISSING) {
					const lockId = normalizeShopId(pendingLock.value);
					activeModal.value = null;
					activeShopId.value = "";
					pendingLock.value = null;
					if (lockId) {
						lockShop(lockId, "swipe");
						state.value = MODAL_FSM_STATE.LOCKED;
						return;
					}
					state.value = MODAL_FSM_STATE.CLOSED;
				}
				return;
			}
			default:
		}
	};

	return {
		state,
		activeModal,
		activeShopId,
		lockedShops,
		isAnimating,
		isLocked,
		lockShop,
		clearLock,
		clearAllLocks,
		canAutoOpen,
		dispatch,
		MODAL_FSM_STATE,
		MODAL_EVENT,
	};
}
