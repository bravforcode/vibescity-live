import { useDebounceFn, useRafFn, useThrottleFn } from "@vueuse/core";
import { computed, onUnmounted, ref } from "vue";

export function useOptimizedAnimation(options = {}) {
	const {
		duration = 300,
		easing = "cubic-bezier(0.4, 0, 0.2, 1)",
		respectReducedMotion = true,
		throttleMs = 16,
		debounceMs = 100,
	} = options;

	// Animation state
	const isAnimating = ref(false);
	const animationProgress = ref(0);
	const startTime = ref(0);
	const endTime = ref(0);

	// Check for reduced motion preference
	const prefersReducedMotion = computed(() => {
		if (!respectReducedMotion) return false;
		return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	});

	// Easing functions
	const easingFunctions = {
		linear: (t) => t,
		"ease-in": (t) => t * t,
		"ease-out": (t) => t * (2 - t),
		"ease-in-out": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
		"cubic-bezier(0.4, 0, 0.2, 1)": (t) => {
			const n1 = 0.4;
			const n2 = 0;
			const n3 = 0.2;
			const n4 = 1;
			return t < 0.5 ? 2 * n3 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
		},
	};

	// Get easing function
	const getEasingFunction = (easingString) =>
		easingFunctions[easingString] ||
		easingFunctions["cubic-bezier(0.4, 0, 0.2, 1)"];

	// Optimized animation using requestAnimationFrame
	const animate = (
		_element,
		from,
		to,
		onUpdate,
		onComplete,
		extraOptions = {},
	) => {
		if (prefersReducedMotion.value) {
			// Skip animation for reduced motion
			if (_element && extraOptions.property) {
				const finalVal = extraOptions.valueTemplate
					? extraOptions.valueTemplate(to)
					: to;
				_element.style[extraOptions.property] = finalVal;
			}
			if (onUpdate) onUpdate(to);
			onComplete?.();
			return;
		}

		isAnimating.value = true;
		startTime.value = performance.now();
		endTime.value = startTime.value + duration;
		animationProgress.value = 0;

		const easingFn = getEasingFunction(easing);

		return useRafFn(
			() => {
				const now = performance.now();
				const elapsed = now - startTime.value;
				const progress = Math.min(elapsed / duration, 1);

				animationProgress.value = progress;
				const easedProgress = easingFn(progress);

				// Interpolate between from and to
				const currentValue = from + (to - from) * easedProgress;

				// Bypass Vue reactivity if element and property are provided
				if (_element && extraOptions.property) {
					const val = extraOptions.valueTemplate
						? extraOptions.valueTemplate(currentValue)
						: currentValue;
					_element.style[extraOptions.property] = val;
				}

				if (onUpdate) onUpdate(currentValue);

				if (progress >= 1) {
					isAnimating.value = false;
					onComplete?.();
				}
			},
			{ immediate: true },
		);
	};

	// Throttled animation for performance
	const animateThrottled = useThrottleFn(animate, throttleMs);

	// Debounced animation for rapid successive calls
	const animateDebounced = useDebounceFn(animate, debounceMs);

	// CSS animation helper with performance optimizations
	const animateCSS = (element, properties, options = {}) => {
		if (!element) return;

		const {
			duration: cssDuration = duration,
			easing: cssEasing = easing,
			onComplete: cssOnComplete,
			forceGPU = true,
		} = options;

		// Force GPU acceleration for better performance
		if (forceGPU) {
			element.style.transform = element.style.transform || "translateZ(0)";
			element.style.willChange = "transform, opacity";
		}

		// Apply CSS transitions
		const transitionProperties = Object.keys(properties)
			.map((prop) => `${prop} ${cssDuration}ms ${cssEasing}`)
			.join(", ");

		element.style.transition = transitionProperties;

		// Apply target properties
		Object.entries(properties).forEach(([prop, value]) => {
			element.style[prop] = value;
		});

		// Handle completion
		const handleTransitionEnd = (event) => {
			if (event.target === element) {
				element.removeEventListener("transitionend", handleTransitionEnd);

				// Clean up will-change after animation
				if (forceGPU) {
					element.style.willChange = "auto";
				}

				cssOnComplete?.();
			}
		};

		element.addEventListener("transitionend", handleTransitionEnd);

		return () => {
			element.removeEventListener("transitionend", handleTransitionEnd);
		};
	};

	// Spring animation for natural movement
	const springAnimate = (_element, from, to, options = {}) => {
		const {
			tension = 280,
			friction = 60,
			mass = 1,
			precision = 0.01,
			onUpdate,
			onComplete,
			property,
			valueTemplate,
		} = options;

		let position = from;
		let velocity = 0;
		const displacement = to - from;

		const { pause, resume } = useRafFn(
			() => {
				// Spring physics
				const springForce = tension * (displacement - (position - from));
				const dampingForce = friction * velocity;
				velocity += (springForce - dampingForce) / mass / 60; // Assuming 60fps
				position += velocity / 60;

				// Bypass Vue reactivity if element and property are provided
				if (_element && property) {
					const val = valueTemplate ? valueTemplate(position) : position;
					_element.style[property] = val;
				}

				if (onUpdate) onUpdate(position);

				// Check if spring has settled
				if (
					Math.abs(velocity) < precision &&
					Math.abs(to - position) < precision
				) {
					position = to;

					if (_element && property) {
						const finalVal = valueTemplate ? valueTemplate(position) : position;
						_element.style[property] = finalVal;
					}

					if (onUpdate) onUpdate(position);
					pause();
					if (onComplete) onComplete();
				}
			},
			{ immediate: true },
		);

		return { pause, resume };
	};

	// Cleanup on unmount
	onUnmounted(() => {
		isAnimating.value = false;
	});

	return {
		// State
		isAnimating,
		animationProgress,
		prefersReducedMotion,

		// Animation methods
		animate,
		animateThrottled,
		animateDebounced,
		animateCSS,
		springAnimate,

		// Utilities
		getEasingFunction,
	};
}
