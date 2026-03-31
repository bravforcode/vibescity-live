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
		const pendingTasks = tasks.filter((task) => !task.executed);
		if (!pendingTasks.length) return;

		let taskIndex = 0;
		const scheduleNextTask = () => {
			if (taskIndex >= pendingTasks.length) return;
			const task = pendingTasks[taskIndex];
			const runTask = () => {
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
				} finally {
					taskIndex += 1;
					if (taskIndex < pendingTasks.length) {
						scheduleNextTask();
					}
				}
			};

			if (typeof window !== "undefined" && "requestIdleCallback" in window) {
				window.requestIdleCallback(runTask, { timeout: task.timeout ?? 3000 });
				return;
			}

			// Fallback: yield between tasks so older browsers do not collapse
			// the whole deferred queue into a single long timer callback.
			setTimeout(runTask, taskIndex === 0 ? 200 : 120);
		};

		scheduleNextTask();
	};

	return {
		idleTasksQueued,
		idleTasksExecuted,
		scheduleIdleTask,
		executeIdleTasksOnce,
	};
}
