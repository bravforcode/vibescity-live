/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAdvancedNeonEffects } from '@/composables/map/useAdvancedNeonEffects';

describe('useAdvancedNeonEffects', () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date('2024-01-01T20:00:00') });
		if (typeof document !== 'undefined') {
			document.head.innerHTML = '';
		}
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should initialize with current time', () => {
		const { currentTime, timeOfDay } = useAdvancedNeonEffects();

		expect(currentTime.value).toBeInstanceOf(Date);
		expect(['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'evening', 'night']).toContain(
			timeOfDay.value
		);
	});

	it('should calculate base intensity based on time of day', () => {
		const { baseIntensity, timeOfDay } = useAdvancedNeonEffects();

		expect(baseIntensity.value).toBeGreaterThan(0);
		expect(baseIntensity.value).toBeLessThanOrEqual(1);

		// Night should have full intensity
		if (timeOfDay.value === 'night') {
			expect(baseIntensity.value).toBe(1.0);
		}
	});

	it('should generate neon styles for venue', () => {
		const { getNeonStyles } = useAdvancedNeonEffects();

		const styles = getNeonStyles({}, {
			paletteId: 'plasma-pink',
			isLive: false,
			isSelected: false,
		});

		expect(styles).toHaveProperty('color');
		expect(styles).toHaveProperty('textShadow');
		expect(styles).toHaveProperty('filter');
	});

	it('should add pulse animation for live venues', () => {
		const { getNeonStyles } = useAdvancedNeonEffects();

		const styles = getNeonStyles({}, {
			paletteId: 'electric-cyan',
			isLive: true,
			enablePulse: true,
		});

		expect(styles.animation).toContain('neon-pulse');
	});

	it('should enhance selected venues', () => {
		const { getNeonStyles } = useAdvancedNeonEffects();

		const styles = getNeonStyles({}, {
			paletteId: 'volt-lime',
			isSelected: true,
		});

		expect(styles.transform).toBe('scale(1.1)');
		expect(styles.filter).toContain('brightness(1.3)');
	});

	it('should inject CSS animations', () => {
		const { init } = useAdvancedNeonEffects();

		init();

		const styleEl = document.getElementById('advanced-neon-effects');
		expect(styleEl).toBeTruthy();
		expect(styleEl.textContent).toContain('@keyframes');
	});

	it('should support rainbow mode', () => {
		const { rainbowMode, getNeonStyles } = useAdvancedNeonEffects();

		rainbowMode.value = true;

		const styles = getNeonStyles({}, {
			paletteId: 'sunset-amber',
		});

		expect(styles.animation).toContain('neon-rainbow');
	});
});
