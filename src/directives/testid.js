export const vTestId = {
	mounted(el, binding) {
		// ใส่เฉพาะตอน dev/test กัน production markup (ปรับได้ตามชอบ)
		if (import.meta.env.MODE !== "production") {
			el.setAttribute("data-testid", String(binding.value));
		}
	},
};
