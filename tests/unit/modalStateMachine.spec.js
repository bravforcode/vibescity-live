import { describe, expect, it } from "vitest";
import {
	MODAL_EVENT,
	MODAL_FSM_STATE,
	useModalStateMachine,
} from "../../src/composables/useModalStateMachine";

describe("useModalStateMachine", () => {
	it("opens vibe modal from tap and transitions to OPEN", () => {
		const fsm = useModalStateMachine();
		fsm.dispatch(MODAL_EVENT.TAP_PIN, { shopId: "s1" });
		expect(fsm.state.value).toBe(MODAL_FSM_STATE.OPENING);
		expect(fsm.activeModal.value).toBe("vibe");
		expect(fsm.activeShopId.value).toBe("s1");
		fsm.dispatch(MODAL_EVENT.ANIMATION_END, { shopId: "s1" });
		expect(fsm.state.value).toBe(MODAL_FSM_STATE.OPEN);
	});

	it("locks shop after swipe-down dismiss and blocks auto-open", () => {
		const fsm = useModalStateMachine();
		fsm.dispatch(MODAL_EVENT.TAP_CARD, { shopId: "s2" });
		fsm.dispatch(MODAL_EVENT.ANIMATION_END, { shopId: "s2" });
		expect(fsm.state.value).toBe(MODAL_FSM_STATE.OPEN);

		fsm.dispatch(MODAL_EVENT.SWIPE_DOWN, { shopId: "s2" });
		expect(fsm.state.value).toBe(MODAL_FSM_STATE.DISMISSING);
		fsm.dispatch(MODAL_EVENT.ANIMATION_END, { shopId: "s2" });
		expect(fsm.state.value).toBe(MODAL_FSM_STATE.LOCKED);
		expect(fsm.isLocked("s2")).toBe(true);
		expect(fsm.canAutoOpen("s2", { source: "scroll_commit" })).toBe(false);
	});

	it("programmatic close does not lock", () => {
		const fsm = useModalStateMachine();
		fsm.dispatch(MODAL_EVENT.TAP_PIN, { shopId: "s3" });
		fsm.dispatch(MODAL_EVENT.ANIMATION_END, { shopId: "s3" });
		fsm.dispatch(MODAL_EVENT.PROGRAMMATIC_CLOSE, { shopId: "s3" });
		fsm.dispatch(MODAL_EVENT.ANIMATION_END, { shopId: "s3" });
		expect(fsm.state.value).toBe(MODAL_FSM_STATE.CLOSED);
		expect(fsm.isLocked("s3")).toBe(false);
	});

	it("explicit tap clears lock and reopens", () => {
		const fsm = useModalStateMachine();
		fsm.lockShop("s4");
		expect(fsm.isLocked("s4")).toBe(true);
		fsm.dispatch(MODAL_EVENT.TAP_PIN, { shopId: "s4" });
		expect(fsm.isLocked("s4")).toBe(false);
		expect(fsm.activeModal.value).toBe("vibe");
	});
});
