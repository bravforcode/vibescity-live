#!/usr/bin/env node
/**
 * Monitor Map FPS in Production
 * 
 * Collects FPS metrics from production and stores in database
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://vibecity.live';
const MONITORING_DURATION = 60000; // 1 minute
const OUTPUT_DIR = 'reports/performance';

async function monitorMapFPS() {
	console.log('🚀 Starting Map FPS Monitoring...');
	console.log(`URL: ${PRODUCTION_URL}`);
	console.log(`Duration: ${MONITORING_DURATION}ms\n`);

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
	});

	const page = await context.newPage();

	// Inject FPS monitoring
	await page.addInitScript(() => {
		window.fpsMetrics = {
			samples: [],
			startTime: Date.now(),
		};

		let lastTime = performance.now();
		let frames = 0;

		function measureFPS() {
			frames++;
			const currentTime = performance.now();

			if (currentTime >= lastTime + 1000) {
				const fps = Math.round((frames * 1000) / (currentTime - lastTime));
				window.fpsMetrics.samples.push({
					fps,
					timestamp: Date.now(),
					memory: performance.memory ? performance.memory.usedJSHeapSize : 0,
				});

				frames = 0;
				lastTime = currentTime;
			}

			requestAnimationFrame(measureFPS);
		}

		requestAnimationFrame(measureFPS);
	});

	// Navigate to map
	await page.goto(PRODUCTION_URL);
	await page.waitForSelector('[data-testid="map-canvas"]', { timeout: 10000 });

	console.log('✅ Map loaded, monitoring FPS...\n');

	// Simulate user interactions
	const map = page.locator('[data-testid="map-canvas"]');

	const interactions = [
		async () => {
			await map.click({ position: { x: 500, y: 500 } });
			console.log('  - Clicked map');
		},
		async () => {
			await page.mouse.wheel(0, -100);
			console.log('  - Zoomed in');
		},
		async () => {
			await page.mouse.move(600, 600);
			await page.mouse.move(700, 700);
			console.log('  - Panned map');
		},
		async () => {
			await page.mouse.wheel(0, 100);
			console.log('  - Zoomed out');
		},
	];

	// Perform interactions periodically
	const interactionInterval = setInterval(async () => {
		const randomInteraction = interactions[Math.floor(Math.random() * interactions.length)];
		try {
			await randomInteraction();
		} catch (error) {
			console.error('Interaction error:', error.message);
		}
	}, 5000);

	// Wait for monitoring duration
	await page.waitForTimeout(MONITORING_DURATION);

	clearInterval(interactionInterval);

	// Collect metrics
	const metrics = await page.evaluate(() => window.fpsMetrics);

	await browser.close();

	// Analyze metrics
	const fpsSamples = metrics.samples.map(s => s.fps);
	const avgFPS = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
	const minFPS = Math.min(...fpsSamples);
	const maxFPS = Math.max(...fpsSamples);

	const p50 = fpsSamples.sort((a, b) => a - b)[Math.floor(fpsSamples.length * 0.5)];
	const p95 = fpsSamples.sort((a, b) => a - b)[Math.floor(fpsSamples.length * 0.95)];
	const p99 = fpsSamples.sort((a, b) => a - b)[Math.floor(fpsSamples.length * 0.99)];

	const report = {
		url: PRODUCTION_URL,
		timestamp: new Date().toISOString(),
		duration: MONITORING_DURATION,
		samples: metrics.samples.length,
		fps: {
			avg: avgFPS.toFixed(2),
			min: minFPS,
			max: maxFPS,
			p50,
			p95,
			p99,
		},
		memory: {
			avg: (metrics.samples.reduce((a, b) => a + b.memory, 0) / metrics.samples.length / 1024 / 1024).toFixed(2) + 'MB',
		},
		status: avgFPS >= 30 ? 'PASS' : 'FAIL',
	};

	// Print report
	console.log('\n📊 FPS Monitoring Report');
	console.log('========================\n');
	console.log(`Average FPS: ${report.fps.avg}`);
	console.log(`Min FPS: ${report.fps.min}`);
	console.log(`Max FPS: ${report.fps.max}`);
	console.log(`P50: ${report.fps.p50}`);
	console.log(`P95: ${report.fps.p95}`);
	console.log(`P99: ${report.fps.p99}`);
	console.log(`Average Memory: ${report.memory.avg}`);
	console.log(`Status: ${report.status}\n`);

	// Save report
	await fs.mkdir(OUTPUT_DIR, { recursive: true });
	const reportPath = path.join(OUTPUT_DIR, `map-fps-${Date.now()}.json`);
	await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

	console.log(`✅ Report saved to: ${reportPath}\n`);

	// Exit with appropriate code
	process.exit(report.status === 'PASS' ? 0 : 1);
}

monitorMapFPS().catch(error => {
	console.error('❌ Monitoring failed:', error);
	process.exit(1);
});
