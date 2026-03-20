import { describe, expect, it, vi } from "vitest";

import {
	runCommitMutation,
	runOptimisticMutation,
} from "../../src/composables/useOptimisticUpdate";

describe("useOptimisticUpdate", () => {
	it("rolls state back when commit fails", async () => {
		const state = { count: 2 };
		const notify = vi.fn();
		const reportError = vi.fn();

		const result = await runOptimisticMutation({
			capture: () => state.count,
			applyOptimistic: () => {
				state.count = 1;
			},
			rollback: (snapshot) => {
				state.count = snapshot ?? 0;
			},
			commit: async () => {
				throw new Error("boom");
			},
			notify,
			reportError,
			errorMessage: "Save failed",
		});

		expect(result).toEqual({
			success: false,
			error: "boom",
			cause: expect.any(Error),
		});
		expect(state.count).toBe(2);
		expect(notify).toHaveBeenCalledWith({
			type: "error",
			message: "boom",
		});
		expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
			message: "boom",
		});
	});

	it("keeps optimistic state and runs success hook on success", async () => {
		const state = { items: ["existing"] };
		const onSuccess = vi.fn();

		const result = await runOptimisticMutation({
			capture: () => [...state.items],
			applyOptimistic: () => {
				state.items = [...state.items, "pending"];
			},
			rollback: (snapshot) => {
				state.items = snapshot ?? [];
			},
			commit: async () => ({ id: "server-1" }),
			onSuccess,
		});

		expect(result).toEqual({
			success: true,
			data: { id: "server-1" },
		});
		expect(state.items).toEqual(["existing", "pending"]);
		expect(onSuccess).toHaveBeenCalledWith(
			{ id: "server-1" },
			["existing"],
		);
	});

	it("supports commit-only server-confirmed mutations through the shared wrapper", async () => {
		const onSuccess = vi.fn();
		const onError = vi.fn();

		const result = await runCommitMutation({
			commit: async () => ({ ok: true, id: "server-2" }),
			onSuccess,
			onError,
		});

		expect(result).toEqual({
			success: true,
			data: { ok: true, id: "server-2" },
		});
		expect(onSuccess).toHaveBeenCalledWith({ ok: true, id: "server-2" });
		expect(onError).not.toHaveBeenCalled();
	});
});
