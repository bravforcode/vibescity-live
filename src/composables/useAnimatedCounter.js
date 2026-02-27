/**
 * useAnimatedCounter — Smoothly animates a number from one value to another.
 * Creates a "slot machine" / count-up effect for stats and metrics.
 *
 * Usage:
 *   const { displayValue } = useAnimatedCounter(toRef(props, 'count'), { duration: 800 });
 *   <span>{{ displayValue }}</span>
 */
import { onBeforeUnmount, ref, watch } from "vue";

/**
 * @param {import('vue').Ref<number>} target - The reactive target number
 * @param {Object} opts
 * @param {number} [opts.duration=600] - Animation duration in ms
 * @param {boolean} [opts.format=true] - Locale-format the number (e.g. 1,234)
 * @param {number} [opts.decimals=0] - Decimal places
 */
export function useAnimatedCounter(target, opts = {}) {
	const { duration = 600, format = true, decimals = 0 } = opts;

	const current = ref(0);
	let rafId = null;
	let startTime = null;
	let startVal = 0;

	const easeOutQuart = (t) => 1 - (1 - t) ** 4;

	const animate = (timestamp) => {
		if (!startTime) startTime = timestamp;
		const elapsed = timestamp - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const eased = easeOutQuart(progress);

		const targetVal = typeof target.value === "number" ? target.value : 0;
		current.value = startVal + (targetVal - startVal) * eased;

		if (progress < 1) {
			rafId = requestAnimationFrame(animate);
		} else {
			current.value = targetVal;
		}
	};

	const startAnimation = (_newVal) => {
		if (rafId) cancelAnimationFrame(rafId);
		startVal = current.value;
		startTime = null;
		rafId = requestAnimationFrame(animate);
	};

	watch(
		target,
		(newVal) => {
			startAnimation(newVal);
		},
		{ immediate: true },
	);

	onBeforeUnmount(() => {
		if (rafId) cancelAnimationFrame(rafId);
	});

	const displayValue = ref("");
	watch(
		current,
		(val) => {
			const num = decimals > 0 ? val.toFixed(decimals) : Math.round(val);
			displayValue.value = format ? Number(num).toLocaleString() : String(num);
		},
		{ immediate: true },
	);

	return {
		/** Formatted string value for display */
		displayValue,
		/** Raw animated number */
		currentValue: current,
	};
}
