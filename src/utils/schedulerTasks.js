const hasScheduler = () =>
	typeof window !== "undefined" &&
	"scheduler" in window &&
	window.scheduler !== null;

const hasSchedulerYield = () =>
	hasScheduler() && typeof window.scheduler?.yield === "function";

const hasSchedulerPostTask = () =>
	hasScheduler() && typeof window.scheduler?.postTask === "function";

const rafYield = () =>
	new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});

export const yieldToMain = async () => {
	if (hasSchedulerYield()) {
		try {
			await window.scheduler.yield();
			return;
		} catch {
			// Fall back below.
		}
	}
	if (typeof requestAnimationFrame === "function") {
		await rafYield();
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 0));
};

export const postBackgroundTask = (callback) => {
	if (typeof callback !== "function") return;
	if (hasSchedulerPostTask()) {
		try {
			window.scheduler.postTask(callback, { priority: "background" });
			return;
		} catch {
			// Fall back below.
		}
	}
	setTimeout(callback, 0);
};
