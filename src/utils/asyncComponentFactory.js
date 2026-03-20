/**
 * asyncComponentFactory.js — Standard wrapper for defineAsyncComponent
 * Provides consistent timeout, error fallback, and loading behavior.
 */
import { defineAsyncComponent } from "vue";
import AsyncFallback from "../components/ui/AsyncFallback.vue";

/**
 * Create a resilient async component with standard error/timeout handling.
 * @param {() => Promise} loader - Dynamic import function
 * @param {object} [opts] - Override options
 * @param {number} [opts.timeout=15000] - Timeout in ms before showing error
 * @param {number} [opts.delay=200] - Delay before showing loading component
 * @param {object} [opts.loadingComponent] - Optional loading skeleton component
 * @returns {object} Vue async component definition
 */
export const defineResilientAsync = (loader, opts = {}) =>
	defineAsyncComponent({
		loader,
		errorComponent: AsyncFallback,
		timeout: opts.timeout ?? 15000,
		delay: opts.delay ?? 200,
		loadingComponent: opts.loadingComponent ?? undefined,
	});
