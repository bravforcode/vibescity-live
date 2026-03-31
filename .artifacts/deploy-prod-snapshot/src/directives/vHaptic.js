// --- C:\vibecity.live\src\directives\vHaptic.js ---
// ✅ Vue Directive for Haptic Feedback on Click

import { useHaptics } from "../composables/useHaptics";

/**
 * v-haptic directive - Adds haptic feedback and bounce animation to elements
 *
 * Usage:
 *   v-haptic                    → Light tap
 *   v-haptic:select             → Selection feedback
 *   v-haptic:success            → Success feedback
 *   v-haptic:impact             → Medium impact
 *   v-haptic:heavy              → Heavy impact
 *
 * Example:
 *   <button v-haptic>Click Me</button>
 *   <button v-haptic:success>Save</button>
 */
const vHaptic = {
	mounted(el, binding) {
		const {
			tapFeedback,
			selectFeedback,
			successFeedback,
			impactFeedback,
			heavyFeedback,
		} = useHaptics();

		// Determine feedback type from modifier
		const feedbackType = binding.arg || "tap";

		const feedbackMap = {
			tap: tapFeedback,
			select: selectFeedback,
			success: successFeedback,
			impact: () => impactFeedback("medium"),
			heavy: heavyFeedback,
		};

		const feedback = feedbackMap[feedbackType] || tapFeedback;

		// Add bounce class for visual feedback
		el.classList.add("btn-bounce");

		// Handle click with haptic feedback
		el._hapticHandler = () => {
			feedback();
		};

		el.addEventListener("pointerdown", el._hapticHandler);
	},

	unmounted(el) {
		if (el._hapticHandler) {
			el.removeEventListener("pointerdown", el._hapticHandler);
			delete el._hapticHandler;
		}
	},
};

export default vHaptic;

/**
 * Plugin to install globally
 */
export const HapticPlugin = {
	install(app) {
		app.directive("haptic", vHaptic);
	},
};
