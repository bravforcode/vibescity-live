import { reactive } from "vue";

const state = reactive({
	queue: [],
	counter: 0,
});

export function useNotifications() {
	const notify = ({
		title,
		message,
		type = "info",
		actionLabel,
		action,
		duration = 3500,
	}) => {
		const id = ++state.counter;
		state.queue.push({
			id,
			title,
			message,
			type,
			actionLabel,
			action,
			duration,
		});
		if (duration > 0) {
			setTimeout(() => dismiss(id), duration);
		}
		return id;
	};

	const notifySuccess = (message, title = "สำเร็จ") =>
		notify({ title, message, type: "success" });
	const notifyError = (message, title = "เกิดข้อผิดพลาด") =>
		notify({ title, message, type: "error", duration: 5000 });
	const dismiss = (id) => {
		const idx = state.queue.findIndex((item) => item.id === id);
		if (idx >= 0) state.queue.splice(idx, 1);
	};

	return { state, notify, notifySuccess, notifyError, dismiss };
}
