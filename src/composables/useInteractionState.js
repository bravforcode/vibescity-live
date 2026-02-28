import { readonly, ref } from "vue";

export const INTERACTION_STATES = {
	IDLE: "IDLE",
	MAP_DRAGGING: "MAP_DRAGGING",
	DRAWER_DRAGGING: "DRAWER_DRAGGING",
	TRANSITIONING: "TRANSITIONING",
};

const currentState = ref(INTERACTION_STATES.IDLE);
let cooldownTimer = null;

export function useInteractionState() {
	const setInteractionState = (newState, cooldownMs = 0) => {
		if (cooldownTimer) clearTimeout(cooldownTimer);

		currentState.value = newState;

		if (cooldownMs > 0 && newState !== INTERACTION_STATES.IDLE) {
			cooldownTimer = setTimeout(() => {
				currentState.value = INTERACTION_STATES.IDLE;
				cooldownTimer = null;
			}, cooldownMs);
		}
	};

	const beginMapDrag = () => {
		if (
			currentState.value === INTERACTION_STATES.DRAWER_DRAGGING ||
			currentState.value === INTERACTION_STATES.TRANSITIONING
		) {
			return false; // Block if drawer is dragging or transitioning
		}
		setInteractionState(INTERACTION_STATES.MAP_DRAGGING);
		return true;
	};

	const endMapDrag = () => {
		if (currentState.value === INTERACTION_STATES.MAP_DRAGGING) {
			setInteractionState(INTERACTION_STATES.IDLE, 50); // slight cooldown
		}
	};

	const beginDrawerDrag = () => {
		if (
			currentState.value === INTERACTION_STATES.MAP_DRAGGING ||
			currentState.value === INTERACTION_STATES.TRANSITIONING
		) {
			return false; // Block if map is dragging
		}
		setInteractionState(INTERACTION_STATES.DRAWER_DRAGGING);
		return true;
	};

	const endDrawerDrag = () => {
		if (currentState.value === INTERACTION_STATES.DRAWER_DRAGGING) {
			// When drawer drag ends, we are usually transitioning
			setInteractionState(INTERACTION_STATES.TRANSITIONING, 400); // Wait for snap animation
		}
	};

	const triggerTransitionCooldown = (ms = 400) => {
		setInteractionState(INTERACTION_STATES.TRANSITIONING, ms);
	};

	return {
		currentState: readonly(currentState),
		INTERACTION_STATES,
		beginMapDrag,
		endMapDrag,
		beginDrawerDrag,
		endDrawerDrag,
		triggerTransitionCooldown,
	};
}
