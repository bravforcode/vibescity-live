import { ref } from "vue";

// Wave 2: Task 2.5 — Idle callback wrapper composable.
// Queues deferred tasks and executes them once via requestIdleCallback after
// the map fires its first idle event. Falls back to setTimeout on browsers
// without requestIdleCallback support (e.g., older Safari / Firefox < 119).

export function useMapIdleFeatures() {
	const idleTasksQueued = ref([]);
	const idleTasksExecuted = ref(false);

	/**
	 * Queue a function for execution during browser idle time.
	 * Returns an opaque task ID that can be used for debugging.
	 *
	 * @param {Function} fn - Task to run during idle
	 * @param {{ timeout?: number }} options - requestIdleCallback timeout (ms)
	 * @returns {number|null} task ID, or null if fn is not a function
	 */
	const scheduleIdleTask = (fn, { timeout = 3000 } = {}) => {
		if (typeof fn !== "function") return null;

		const task = {
			fn,
			timeout,
			executed: false,
			id: Math.random(),
		};

		idleTasksQueued.value.push(task);
		return task.id;
	};

	/**
	 * Execute all queued idle tasks once. Subsequent calls are no-ops.
	 * Must be called after the map instance is available (e.g., inside an
	 * `on("idle", ...)` handler).
	 *
	 * @param {object|null} _map - Mapbox map instance (reserved for future use)
	 */
	const executeIdleTasksOnce = (_map) => {
		if (idleTasksExecuted.value) return;

		if (!_map) {
			if (import.meta.env.DEV) {
				console.warn(
					"[useMapIdleFeatures] executeIdleTasksOnce called without map reference",
				);
			}
			return;
		}

		idleTasksExecuted.value = true;

		const tasks = idleTasksQueued.value;
		if (!tasks.length) return;

		const maxTimeout = tasks.reduce(
			(acc, t) => Math.max(acc, t.timeout ?? 3000),
			3000,
		);

		const runTasks = () => {
			for (const task of tasks) {
				if (task.executed) continue;
				try {
					task.fn();
					task.executed = true;
				} catch (err) {
					if (import.meta.env.DEV) {
						console.error(
							`[useMapIdleFeatures] Idle task ${task.id} failed:`,
							err,
						);
					}
				}
			}
		};

		if (typeof window !== "undefined" && "requestIdleCallback" in window) {
			window.requestIdleCallback(runTasks, { timeout: maxTimeout });
		} else {
			// Fallback: small delay so paint finishes before heavy work starts
			setTimeout(runTasks, 200);
		}
	};

	return {
		idleTasksQueued,
		idleTasksExecuted,
		scheduleIdleTask,
		executeIdleTasksOnce,
	};
}
