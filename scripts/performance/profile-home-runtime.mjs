#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "playwright";

const DEFAULT_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5417/";
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "reports/performance");
const DEFAULT_DEVICE = "mobile-chrome";
const TRACE_CATEGORIES = [
	"-*",
	"devtools.timeline",
	"v8.execute",
	"blink.user_timing",
	"loading",
	"latencyInfo",
	"disabled-by-default-devtools.timeline",
	"disabled-by-default-devtools.timeline.frame",
];

const PROFILE_INIT_SCRIPT = `
(() => {
  const root = {
    timeOrigin: performance.timeOrigin,
    startedAt: performance.now(),
    marks: [],
    longTasks: [],
    slowEvents: [],
  };
  window.__homeRuntimeProfile = root;

  window.__pushHomeRuntimeMark = (label) => {
    root.marks.push({
      label: String(label || ""),
      at: performance.now(),
    });
  };

  const canObserve = typeof PerformanceObserver !== "undefined" && Array.isArray(PerformanceObserver.supportedEntryTypes);

  if (canObserve && PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          root.longTasks.push({
            name: entry.name,
            startTime: Number(entry.startTime.toFixed(2)),
            duration: Number(entry.duration.toFixed(2)),
            attribution: Array.isArray(entry.attribution)
              ? entry.attribution.map((item) => ({
                  name: item?.name || "",
                  containerType: item?.containerType || "",
                  containerName: item?.containerName || "",
                  containerId: item?.containerId || "",
                  containerSrc: item?.containerSrc || "",
                }))
              : [],
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {}
  }

  if (canObserve && PerformanceObserver.supportedEntryTypes.includes("event")) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 16) continue;
          root.slowEvents.push({
            name: entry.name,
            startTime: Number(entry.startTime.toFixed(2)),
            duration: Number(entry.duration.toFixed(2)),
            interactionId: Number(entry.interactionId || 0),
            targetSelector:
              entry.target instanceof Element
                ? entry.target.getAttribute("data-testid") ||
                  entry.target.id ||
                  entry.target.className ||
                  entry.target.tagName
                : "",
          });
        }
      });
      observer.observe({ type: "event", durationThreshold: 16, buffered: true });
    } catch {}
  }
})();
`;

const parseArgs = (argv) => {
	const result = {
		url: DEFAULT_URL,
		outputDir: DEFAULT_OUTPUT_DIR,
		device: DEFAULT_DEVICE,
		headed: false,
		timeoutMs: 45_000,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		const next = argv[i + 1];
		switch (token) {
			case "--url":
				if (next) {
					result.url = next;
					i += 1;
				}
				break;
			case "--output-dir":
				if (next) {
					result.outputDir = path.resolve(process.cwd(), next);
					i += 1;
				}
				break;
			case "--device":
				if (next) {
					result.device = next.trim().toLowerCase();
					i += 1;
				}
				break;
			case "--timeout-ms":
				if (next) {
					const timeoutMs = Number(next);
					if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
						result.timeoutMs = timeoutMs;
					}
					i += 1;
				}
				break;
			case "--headed":
				result.headed = true;
				break;
			default:
				break;
		}
	}

	return result;
};

const getDeviceProfile = (device) => {
	switch (device) {
		case "desktop":
		case "desktop-chromium":
			return {
				viewport: { width: 1440, height: 960 },
				userAgent: devices["Desktop Chrome"].userAgent,
				deviceScaleFactor: devices["Desktop Chrome"].deviceScaleFactor,
				isMobile: false,
				hasTouch: false,
				colorScheme: "dark",
			};
		default:
			return {
				...devices["Pixel 7"],
				colorScheme: "dark",
			};
	}
};

const makeTimestamp = () => {
	const now = new Date();
	const pad = (value) => String(value).padStart(2, "0");
	return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
};

const mkdirp = async (target) => {
	await fs.mkdir(target, { recursive: true });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startTracing = async (client) => {
	await client.send("Tracing.start", {
		categories: TRACE_CATEGORIES.join(","),
		options: "sampling-frequency=10000",
		transferMode: "ReturnAsStream",
	});
};

const readTraceStream = async (client, handle) => {
	let buffer = "";
	while (true) {
		const chunk = await client.send("IO.read", { handle });
		buffer += chunk?.data || "";
		if (chunk?.eof) break;
	}
	await client.send("IO.close", { handle });
	return buffer;
};

const stopTracing = async (client) =>
	new Promise((resolve, reject) => {
		const onComplete = async (event) => {
			try {
				const payload = await readTraceStream(client, event.stream);
				resolve(payload);
			} catch (error) {
				reject(error);
			}
		};

		client.once("Tracing.tracingComplete", onComplete);

		client.send("Tracing.end").catch((error) => {
			client.off("Tracing.tracingComplete", onComplete);
			reject(error);
		});
	});

const pushMark = (page, label) =>
	page.evaluate((value) => {
		window.__pushHomeRuntimeMark?.(value);
	}, label);

const summarizeStageEntries = (entries = [], marks = []) => {
	if (!entries.length) return [];
	const orderedMarks = [...marks].sort((left, right) => left.at - right.at);
	return entries.map((entry) => {
		let stage = "before_navigation";
		for (const mark of orderedMarks) {
			if (entry.startTime >= mark.at) {
				stage = mark.label;
				continue;
			}
			break;
		}
		return { ...entry, stage };
	});
};

const aggregateByStage = (entries = []) => {
	const summary = new Map();
	for (const entry of entries) {
		const current = summary.get(entry.stage) || {
			stage: entry.stage,
			count: 0,
			totalDuration: 0,
			maxDuration: 0,
		};
		current.count += 1;
		current.totalDuration += Number(entry.duration || 0);
		current.maxDuration = Math.max(
			current.maxDuration,
			Number(entry.duration || 0),
		);
		summary.set(entry.stage, current);
	}
	return [...summary.values()]
		.map((item) => ({
			...item,
			totalDuration: Number(item.totalDuration.toFixed(2)),
			maxDuration: Number(item.maxDuration.toFixed(2)),
		}))
		.sort((left, right) => right.totalDuration - left.totalDuration);
};

const extractTraceEvents = (traceText) => {
	const parsed = JSON.parse(traceText);
	return Array.isArray(parsed) ? parsed : parsed?.traceEvents || [];
};

const pickRendererThread = (events) => {
	const threadNames = events.filter(
		(event) => event?.ph === "M" && event?.name === "thread_name",
	);
	const candidates = threadNames
		.filter((event) => event?.args?.name === "CrRendererMain")
		.map((event) => ({ pid: event.pid, tid: event.tid }));
	if (!candidates.length) return null;

	let best = null;
	for (const candidate of candidates) {
		const totalDuration = events
			.filter(
				(event) =>
					event?.ph === "X" &&
					event?.pid === candidate.pid &&
					event?.tid === candidate.tid &&
					Number.isFinite(event?.dur),
			)
			.reduce((sum, event) => sum + Number(event.dur || 0), 0);

		if (!best || totalDuration > best.totalDuration) {
			best = { ...candidate, totalDuration };
		}
	}

	return best;
};

const summarizeTrace = (traceText) => {
	const events = extractTraceEvents(traceText);
	const rendererThread = pickRendererThread(events);
	if (!rendererThread) {
		return {
			rendererThread: null,
			topMainThreadTasks: [],
			topActionableEvents: [],
		};
	}

	const mainThreadEvents = events.filter(
		(event) =>
			event?.ph === "X" &&
			event?.pid === rendererThread.pid &&
			event?.tid === rendererThread.tid &&
			Number.isFinite(event?.dur),
	);

	const topMainThreadTasks = [...mainThreadEvents]
		.filter((event) => Number(event.dur || 0) >= 16_000)
		.sort((left, right) => Number(right.dur || 0) - Number(left.dur || 0))
		.slice(0, 20)
		.map((event) => ({
			name: event.name,
			durationMs: Number((Number(event.dur || 0) / 1000).toFixed(2)),
			tsMs: Number((Number(event.ts || 0) / 1000).toFixed(2)),
		}));

	const actionableNames = new Set([
		"FunctionCall",
		"EvaluateScript",
		"EventDispatch",
		"TimerFire",
		"FireAnimationFrame",
		"UpdateLayoutTree",
		"Layout",
		"Paint",
		"CompositeLayers",
		"ParseHTML",
	]);

	const topActionableEvents = [...mainThreadEvents]
		.filter(
			(event) =>
				actionableNames.has(String(event.name || "")) &&
				Number(event.dur || 0) >= 4_000,
		)
		.sort((left, right) => Number(right.dur || 0) - Number(left.dur || 0))
		.slice(0, 20)
		.map((event) => {
			const topFrame =
				event?.args?.data?.stackTrace?.[0] ||
				event?.args?.beginData?.stackTrace?.[0] ||
				null;
			return {
				name: event.name,
				durationMs: Number((Number(event.dur || 0) / 1000).toFixed(2)),
				location: topFrame?.url
					? `${topFrame.url}:${Number(topFrame.lineNumber || 0) + 1}`
					: null,
			};
		});

	const aggregatedByName = [...mainThreadEvents]
		.reduce((map, event) => {
			const name = String(event.name || "unknown");
			const current = map.get(name) || { name, count: 0, totalDurationMs: 0 };
			current.count += 1;
			current.totalDurationMs += Number(event.dur || 0) / 1000;
			map.set(name, current);
			return map;
		}, new Map())
		.values();

	return {
		rendererThread: {
			pid: rendererThread.pid,
			tid: rendererThread.tid,
		},
		topMainThreadTasks,
		topActionableEvents,
		topAggregates: [...aggregatedByName]
			.sort((left, right) => right.totalDurationMs - left.totalDurationMs)
			.slice(0, 12)
			.map((item) => ({
				...item,
				totalDurationMs: Number(item.totalDurationMs.toFixed(2)),
			})),
	};
};

const waitForHomeReady = async (page, url, timeoutMs) => {
	await page.goto(url, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="map-shell"]', {
		timeout: timeoutMs,
	});
	await page.waitForSelector('[data-testid="vibe-carousel"]', {
		timeout: timeoutMs,
	});
	await page.waitForSelector(
		'[data-testid="map-shell"][data-map-ready="true"]',
		{
			timeout: timeoutMs,
		},
	);

	const previewOpenWebgl = page
		.locator('[data-testid="dev-preview-open-webgl"]')
		.first();
	if (await previewOpenWebgl.isVisible().catch(() => false)) {
		await previewOpenWebgl.click();
	}

	await page.waitForTimeout(1_000);
};

const animateCarousel = async (page) =>
	page
		.locator('[data-testid="vibe-carousel"]')
		.first()
		.evaluate(async (element) => {
			const scroller = element;
			const maxScroll = Math.max(
				0,
				scroller.scrollWidth - scroller.clientWidth,
			);
			const targets = [
				Math.min(maxScroll, scroller.clientWidth * 0.8),
				Math.min(maxScroll, scroller.clientWidth * 1.8),
				Math.min(maxScroll, scroller.clientWidth * 0.35),
			];

			const ease = (value) => 1 - (1 - value) ** 3;
			const animateTo = (target) =>
				new Promise((resolve) => {
					const start = scroller.scrollLeft;
					const delta = target - start;
					const duration = 650;
					let startTs = 0;
					const step = (ts) => {
						if (!startTs) startTs = ts;
						const progress = Math.min(1, (ts - startTs) / duration);
						scroller.scrollLeft = start + delta * ease(progress);
						if (progress < 1) {
							requestAnimationFrame(step);
							return;
						}
						resolve();
					};
					requestAnimationFrame(step);
				});

			for (const target of targets) {
				await animateTo(target);
				await new Promise((resolve) => setTimeout(resolve, 240));
			}

			return {
				maxScroll: Math.round(maxScroll),
				finalScrollLeft: Math.round(scroller.scrollLeft),
			};
		});

const openDetailFromActiveCard = async (page) => {
	const activeCard = page
		.locator('[data-testid="shop-card"][data-active="true"]')
		.first();
	await activeCard.waitFor({ state: "visible", timeout: 15_000 });
	await activeCard.focus();
	await activeCard.press("Enter");

	const detailSelectors = [
		'[data-testid="vibe-modal"]',
		'[data-testid="drawer-shell"]',
	];
	for (const selector of detailSelectors) {
		const opened = await page
			.locator(selector)
			.first()
			.waitFor({ state: "visible", timeout: 8_000 })
			.then(() => true)
			.catch(() => false);
		if (opened) return selector;
	}
	return null;
};

const clickFirstMapMarker = async (page) => {
	const candidates = [
		'[data-testid="venue-marker"]',
		'[data-testid="dev-preview-pin"]',
	];
	for (const selector of candidates) {
		const locator = page.locator(selector).first();
		const visible = await locator.isVisible().catch(() => false);
		if (!visible) continue;
		await locator.click({ force: true });
		return selector;
	}
	return null;
};

const collectBrowserMetrics = async (page, client) => {
	const perfMetrics = await client
		.send("Performance.getMetrics")
		.catch(() => ({ metrics: [] }));
	const perfMetricMap = Object.fromEntries(
		(perfMetrics.metrics || []).map((metric) => [metric.name, metric.value]),
	);

	return page.evaluate((metricSnapshot) => {
		const navEntry = performance.getEntriesByType("navigation")[0];
		return {
			url: window.location.href,
			navigation: navEntry
				? {
						domContentLoadedMs: Number(
							navEntry.domContentLoadedEventEnd.toFixed(2),
						),
						loadMs: Number(navEntry.loadEventEnd.toFixed(2)),
						type: navEntry.type,
					}
				: null,
			mapMetrics: window.__mapMetrics || null,
			runtimeProfile: window.__homeRuntimeProfile || null,
			performanceMetrics: metricSnapshot,
		};
	}, perfMetricMap);
};

const writeJson = async (targetPath, payload) => {
	await fs.writeFile(
		targetPath,
		`${JSON.stringify(payload, null, 2)}\n`,
		"utf8",
	);
};

const main = async () => {
	const options = parseArgs(process.argv.slice(2));
	const timestamp = makeTimestamp();
	const outputDir = options.outputDir;
	const tracePath = path.join(
		outputDir,
		`home-runtime-trace-${timestamp}.json`,
	);
	const reportPath = path.join(
		outputDir,
		`home-runtime-profile-${timestamp}.json`,
	);
	const latestTracePath = path.join(
		outputDir,
		"home-runtime-trace.latest.json",
	);
	const latestReportPath = path.join(
		outputDir,
		"home-runtime-profile.latest.json",
	);

	await mkdirp(outputDir);

	const browser = await chromium.launch({
		headless: !options.headed,
		args: ["--enable-precise-memory-info"],
	});

	const context = await browser.newContext(getDeviceProfile(options.device));
	const page = await context.newPage();
	const client = await context.newCDPSession(page);
	const consoleMessages = [];

	page.on("console", (message) => {
		const text = message.text();
		if (
			/\[Violation\]/i.test(text) ||
			/performance degradation/i.test(text) ||
			/socket url/i.test(text) ||
			/long task/i.test(text)
		) {
			consoleMessages.push({
				type: message.type(),
				text,
			});
		}
	});

	await page.addInitScript(PROFILE_INIT_SCRIPT);
	await client.send("Performance.enable");
	await startTracing(client);

	try {
		await waitForHomeReady(page, options.url, options.timeoutMs);
		await pushMark(page, "home_ready");
		await sleep(600);

		await animateCarousel(page);
		await pushMark(page, "carousel_scroll_complete");
		await sleep(800);

		const openedDetailSelector = await openDetailFromActiveCard(page);
		await pushMark(page, "detail_open_attempt_complete");
		await sleep(1_200);

		const clickedMarkerSelector = await clickFirstMapMarker(page);
		await pushMark(
			page,
			clickedMarkerSelector
				? "marker_click_complete"
				: "post_detail_idle_complete",
		);
		await sleep(1_200);

		const traceText = await stopTracing(client);
		const browserMetrics = await collectBrowserMetrics(page, client);
		const runtimeProfile = browserMetrics.runtimeProfile || {
			marks: [],
			longTasks: [],
			slowEvents: [],
		};
		const longTasksByStage = summarizeStageEntries(
			runtimeProfile.longTasks || [],
			runtimeProfile.marks || [],
		);
		const slowEventsByStage = summarizeStageEntries(
			runtimeProfile.slowEvents || [],
			runtimeProfile.marks || [],
		);

		const summary = {
			generatedAt: new Date().toISOString(),
			url: options.url,
			device: options.device,
			openedDetailSelector,
			clickedMarkerSelector,
			consoleMessages,
			navigation: browserMetrics.navigation,
			mapMetrics: browserMetrics.mapMetrics,
			longTaskSummary: {
				count: longTasksByStage.length,
				maxDuration: Number(
					Math.max(
						0,
						...longTasksByStage.map((entry) => Number(entry.duration || 0)),
					).toFixed(2),
				),
				stageBreakdown: aggregateByStage(longTasksByStage),
				topEntries: [...longTasksByStage]
					.sort(
						(left, right) =>
							Number(right.duration || 0) - Number(left.duration || 0),
					)
					.slice(0, 15),
			},
			slowEventSummary: {
				count: slowEventsByStage.length,
				maxDuration: Number(
					Math.max(
						0,
						...slowEventsByStage.map((entry) => Number(entry.duration || 0)),
					).toFixed(2),
				),
				stageBreakdown: aggregateByStage(slowEventsByStage),
				topEntries: [...slowEventsByStage]
					.sort(
						(left, right) =>
							Number(right.duration || 0) - Number(left.duration || 0),
					)
					.slice(0, 15),
			},
			traceSummary: summarizeTrace(traceText),
			performanceMetrics: browserMetrics.performanceMetrics,
		};

		await fs.writeFile(tracePath, traceText, "utf8");
		await fs.copyFile(tracePath, latestTracePath);
		await writeJson(reportPath, summary);
		await writeJson(latestReportPath, summary);

		console.log(JSON.stringify({ tracePath, reportPath, summary }, null, 2));
	} finally {
		await page.close().catch(() => {});
		await context.close().catch(() => {});
		await browser.close().catch(() => {});
	}
};

await main();
