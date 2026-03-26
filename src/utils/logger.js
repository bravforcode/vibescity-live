/**
 * Centralized logger — dev-only debug/warn, always-on error.
 * Replace all raw console.log / console.warn in production code with this.
 *
 * Usage:
 *   import { logger } from '@/utils/logger'
 *   logger.debug('Map loaded', mapInstance)  // only in dev
 *   logger.warn('Slow response', duration)   // only in dev
 *   logger.error('Payment failed', err)      // always logged
 */

const isDev = import.meta.env.DEV;

export const logger = {
	debug: (...args) => {
		if (isDev) console.log(...args);
	},
	warn: (...args) => {
		if (isDev) console.warn(...args);
	},
	// Errors are always logged — even in production
	error: (...args) => {
		console.error(...args);
	},
};
