#!/usr/bin/env node
/**
 * A/B Test Neon Effects
 * 
 * Compare performance and user engagement between different neon effect configurations
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const TEST_URL = process.env.TEST_URL || 'http://localhost:5173';
const TEST_DURATION = 30000; // 30 seconds per variant
const OUTPUT_DIR = 'reports/ab-tests';

const VARIANTS = [
	{
		id: 'control',
		name: 'No Neon Effects',
		config: {
			enabled: false,
		},
	},
	{
		id: 'soft-glow',
		name: 'Soft Glow',
		config: {
			enabled: true,
			glowLevel: 'soft',
			enableFlicker: false,
			enablePulse: false,
		},
	},
	{
		id: 'medium-glow',
		name: 'Medium Glow with Pulse',
		config: {
			enabled: true,
			glowLevel: 'medium',
			enableFlicker: false,
			enablePulse: true,
		},
	},
	{
		id: 'strong-glow',
		name: 'Strong Glow with All Effects',
		config: {
			enabled: true,
			glowLevel: 'strong',
			enableFlicker: true,
			enablePulse: true,
		},
	},
];

async function testVariant(variant) {
	console.log(`\n🧪 Testing: ${variant.name}`);
	console.log('─'.repeat(50));

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
	});

	const page = await context.newPage();

	// Inject monitoring
	await page.addInitScript(() => {
		window.testMetrics = {
			fps: [],
			interactions: 0,
			errors: [],
		};

		// FPS monitoring
		let lastTime = performance.now();
		let frames = 0;

		function measureFPS() {
			frames++;
			const currentTime = performance.now();

			if (currentTime >= lastTime + 1000) {
				const fps = Math.round((frames * 1000) / (currentTime - lastTime));
				window.testMetrics.fps.push(fps);
				frames = 0;
				lastTime = currentTime;
			}

			requestAnimationFrame(measureFPS);
		}

		requestAnimationFrame(measureFPS);

		// Track interactions
		document.addEventListener('click', () => {
			window.testMetrics.interactions++;
		});

		// Track errors
		window.addEventListener('error', (e) => {
			window.testMetrics.errors.push(e.message);
		});
	});

	// Navigate and configure
	await page.goto(TEST_URL);
	await page.waitForSelector('[data-testid="map-canvas"]');

	// Apply variant configuration
	await page.evaluate((config) => {
		if (window.neonEffectsConfig) {
			Object.assign(window.neonEffectsConfig, config);
		}
	}, variant.config);

	// Simulate user behavior
	const map = page.locator('[data-testid="map-canvas"]');

	for (let i = 0; i < 10; i++) {
		await map.click({ position: { x: 400 + i * 20, y: 400 + i * 20 } });
		await page.waitForTimeout(TEST_DURATION / 10);
	}

	// Collect metrics
	const metrics = await page.evaluate(() => window.testMetrics);

	await browser.close();

	// Calculate statistics
	const avgFPS = metrics.fps.reduce((a, b) => a + b, 0) / metrics.fps.length;
	const minFPS = Math.min(...metrics.fps);

	const result = {
		variant: variant.id,
		name: variant.name,
		config: variant.config,
		metrics: {
			avgFPS: avgFPS.toFixed(2),
			minFPS,
			interactions: metrics.interactions,
			errors: metrics.errors.length,
		},
		timestamp: new Date().toISOString(),
	};

	console.log(`  Average FPS: ${result.metrics.avgFPS}`);
	console.log(`  Min FPS: ${result.metrics.minFPS}`);
	console.log(`  Interactions: ${result.metrics.interactions}`);
	console.log(`  Errors: ${result.metrics.errors}`);

	return result;
}

async function runABTest() {
	console.log('🎨 A/B Testing Neon Effects');
	console.log('═'.repeat(50));

	const results = [];

	for (const variant of VARIANTS) {
		const result = await testVariant(variant);
		results.push(result);
	}

	// Compare results
	console.log('\n📊 Comparison Report');
	console.log('═'.repeat(50));

	const sorted = [...results].sort((a, b) => 
		parseFloat(b.metrics.avgFPS) - parseFloat(a.metrics.avgFPS)
	);

	console.log('\nRanked by Performance (FPS):');
	sorted.forEach((r, i) => {
		console.log(`  ${i + 1}. ${r.name}: ${r.metrics.avgFPS} FPS`);
	});

	const winner = sorted[0];
	console.log(`\n🏆 Winner: ${winner.name}`);
	console.log(`   Performance: ${winner.metrics.avgFPS} FPS`);
	console.log(`   Engagement: ${winner.metrics.interactions} interactions`);

	// Save report
	await fs.mkdir(OUTPUT_DIR, { recursive: true });
	const reportPath = path.join(OUTPUT_DIR, `neon-ab-test-${Date.now()}.json`);
	await fs.writeFile(reportPath, JSON.stringify({
		testDate: new Date().toISOString(),
		duration: TEST_DURATION,
		variants: VARIANTS.length,
		results,
		winner: winner.variant,
	}, null, 2));

	console.log(`\n✅ Report saved to: ${reportPath}\n`);
}

runABTest().catch(error => {
	console.error('❌ A/B test failed:', error);
	process.exit(1);
});
