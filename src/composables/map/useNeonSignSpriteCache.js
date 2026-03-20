import { resolveNeonPalette } from "./useNeonSignTheme";

const LOD_CONFIG = Object.freeze({
	full: {
		width: 176,
		height: 68,
		radius: 12,
		fontMain: 16,
		fontSub: 10,
		iconSize: 16,
		maxEntries: 320,
	},
	compact: {
		width: 132,
		height: 50,
		radius: 10,
		fontMain: 12,
		fontSub: 9,
		iconSize: 14,
		maxEntries: 280,
	},
	mini: {
		width: 52,
		height: 52,
		radius: 20,
		fontMain: 10,
		fontSub: 0,
		iconSize: 12,
		maxEntries: 320,
	},
});

const DEFAULT_RENDER_OPTIONS = Object.freeze({
	priority: 0,
	deadlineMs: 12,
	maxConcurrent: 24,
	memoryBudgetMb: 50,
	entryTtlMs: 10 * 60 * 1000,
	reducedMotion: false,
	highContrast: false,
});

const ICON_LABELS = Object.freeze({
	cocktail: "CK",
	music: "MU",
	spark: "SP",
	night: "NT",
	coffee: "CF",
	cup: "CP",
	bean: "BN",
	dessert: "DS",
	fork: "FK",
	bowl: "BW",
	spice: "SC",
	flame: "FM",
	art: "AR",
	star: "ST",
	gem: "GM",
	leaf: "LF",
	eco: "EC",
	seed: "SD",
	dot: "DT",
	wave: "WV",
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hashString = (input) => {
	const value = String(input ?? "");
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
};

const toNumber = (value, fallback = 0) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeRenderOptions = (options = {}) => ({
	priority: toNumber(options.priority, DEFAULT_RENDER_OPTIONS.priority),
	deadlineMs: clamp(
		toNumber(options.deadlineMs, DEFAULT_RENDER_OPTIONS.deadlineMs),
		4,
		40,
	),
	maxConcurrent: clamp(
		Math.round(
			toNumber(options.maxConcurrent, DEFAULT_RENDER_OPTIONS.maxConcurrent),
		),
		1,
		50,
	),
	memoryBudgetMb: clamp(
		toNumber(options.memoryBudgetMb, DEFAULT_RENDER_OPTIONS.memoryBudgetMb),
		8,
		256,
	),
	entryTtlMs: clamp(
		Math.round(toNumber(options.entryTtlMs, DEFAULT_RENDER_OPTIONS.entryTtlMs)),
		15_000,
		3_600_000,
	),
	reducedMotion: Boolean(options.reducedMotion),
	highContrast: Boolean(options.highContrast),
});

const applyHighContrast = (palette = {}, enabled = false) => {
	if (!enabled) return palette;
	return {
		...palette,
		frame: "#ffffff",
		glow: "rgba(255,255,255,0.65)",
		text: "#ffffff",
		subline: "#ffffff",
		bgTop: "#000000",
		bgBottom: "#000000",
		accent: palette.accent || "#67e8f9",
	};
};

const drawShapePath = (ctx, shape, x, y, width, height, radius) => {
	const r = Math.max(4, Math.min(radius, width / 2, height / 2));
	ctx.beginPath();
	if (shape === "ticket") {
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + width - r, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + r);
		ctx.lineTo(x + width, y + height * 0.35);
		ctx.arc(x + width, y + height * 0.5, r * 0.45, -Math.PI / 2, Math.PI / 2);
		ctx.lineTo(x + width, y + height - r);
		ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
		ctx.lineTo(x + r, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - r);
		ctx.lineTo(x, y + height * 0.65);
		ctx.arc(x, y + height * 0.5, r * 0.45, Math.PI / 2, -Math.PI / 2);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
		return;
	}
	if (shape === "capsule" || shape === "pill") {
		const rr = Math.min(height / 2, r * 1.35);
		ctx.moveTo(x + rr, y);
		ctx.lineTo(x + width - rr, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + rr);
		ctx.lineTo(x + width, y + height - rr);
		ctx.quadraticCurveTo(x + width, y + height, x + width - rr, y + height);
		ctx.lineTo(x + rr, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - rr);
		ctx.lineTo(x, y + rr);
		ctx.quadraticCurveTo(x, y, x + rr, y);
		ctx.closePath();
		return;
	}
	if (shape === "bevel") {
		const bevel = Math.max(4, Math.round(r * 0.7));
		ctx.moveTo(x + bevel, y);
		ctx.lineTo(x + width - bevel, y);
		ctx.lineTo(x + width, y + bevel);
		ctx.lineTo(x + width, y + height - bevel);
		ctx.lineTo(x + width - bevel, y + height);
		ctx.lineTo(x + bevel, y + height);
		ctx.lineTo(x, y + height - bevel);
		ctx.lineTo(x, y + bevel);
		ctx.closePath();
		return;
	}
	ctx.roundRect?.(x, y, width, height, r);
	if (typeof ctx.roundRect !== "function") {
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + width - r, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + r);
		ctx.lineTo(x + width, y + height - r);
		ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
		ctx.lineTo(x + r, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
	}
	ctx.closePath();
};

const drawMiniNeonDot = (
	ctx,
	descriptor,
	cfg,
	palette,
	reducedMotion,
	highContrast,
) => {
	const centerX = cfg.width / 2;
	const centerY = cfg.height / 2;
	const outerRadius = Math.max(14, Math.min(cfg.width, cfg.height) * 0.36);
	const innerRadius = outerRadius * 0.62;
	const glowStrength = descriptor?.neon_glow_level === "strong" ? 1.25 : 1;
	const blurBase = reducedMotion ? 7 : 13;

	ctx.shadowColor = palette.glow || "rgba(103,232,249,0.6)";
	ctx.shadowBlur = blurBase * glowStrength;
	ctx.beginPath();
	ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
	const ringGradient = ctx.createRadialGradient(
		centerX,
		centerY,
		innerRadius * 0.5,
		centerX,
		centerY,
		outerRadius,
	);
	ringGradient.addColorStop(0, palette.accent || "#67e8f9");
	ringGradient.addColorStop(1, palette.frame || "#ffffff");
	ctx.fillStyle = ringGradient;
	ctx.fill();

	ctx.shadowBlur = reducedMotion ? 3 : 8;
	ctx.beginPath();
	ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
	ctx.fillStyle = highContrast ? "#000000" : palette.bgBottom || "#05070f";
	ctx.fill();

	const iconKey = String(descriptor?.neon_icon || "spark");
	const iconLabel = ICON_LABELS[iconKey] || "NV";
	ctx.shadowBlur = 0;
	ctx.fillStyle = palette.text || "#ffffff";
	ctx.font = `800 ${Math.max(9, Math.round(cfg.fontMain))}px "Noto Sans", sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(iconLabel, centerX, centerY + 0.5);
};

const drawNeonSign = (
	descriptor,
	lod,
	{ reducedMotion = false, highContrast = false } = {},
) => {
	const cfg = LOD_CONFIG[lod] || LOD_CONFIG.full;
	const basePalette = resolveNeonPalette(descriptor?.neon_palette);
	const palette = applyHighContrast(basePalette, highContrast);
	const shape = descriptor?.neon_shape || "rounded-rect";
	const borderStyle = descriptor?.neon_border_style || "single-line";
	const badgeStyle = descriptor?.neon_badge_style || "badge-top-right";
	const typographyVariant = descriptor?.neon_typography_variant || "display";
	const glowLevel = descriptor?.neon_glow_level || "medium";
	const pixelRatio = 2;

	const canvas = document.createElement("canvas");
	canvas.width = cfg.width * pixelRatio;
	canvas.height = cfg.height * pixelRatio;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.scale(pixelRatio, pixelRatio);

	if (lod === "mini") {
		drawMiniNeonDot(ctx, descriptor, cfg, palette, reducedMotion, highContrast);
		return canvas;
	}

	const pad = 3;
	const x = pad;
	const y = pad;
	const width = cfg.width - pad * 2;
	const height = cfg.height - pad * 2;
	// "soft" promoted to medium minimum — all signs get visible glow
	const glowBoost = glowLevel === "strong" ? 1.35 : 1;

	const gradient = ctx.createLinearGradient(0, y, 0, y + height);
	gradient.addColorStop(0, palette.bgTop || "#111827");
	gradient.addColorStop(1, palette.bgBottom || "#05070f");

	// Background plate for contrast against light map tiles
	ctx.shadowBlur = 0;
	drawShapePath(
		ctx,
		shape,
		x - 1,
		y - 1,
		width + 2,
		height + 2,
		cfg.radius + 1,
	);
	ctx.fillStyle = "rgba(0,0,0,0.45)";
	ctx.fill();

	// Outer lamp halo pass — wide transparent glow for sign atmosphere
	if (!reducedMotion) {
		ctx.shadowColor = palette.glow || "rgba(103,232,249,0.6)";
		ctx.shadowBlur = 38 * glowBoost;
		drawShapePath(
			ctx,
			shape,
			x - 2,
			y - 2,
			width + 4,
			height + 4,
			cfg.radius + 2,
		);
		ctx.fillStyle = "rgba(0,0,0,0)";
		ctx.fill();
	}

	// Neon glow — boosted shadowBlur for stronger visibility
	ctx.shadowColor = palette.glow || "rgba(103,232,249,0.6)";
	ctx.shadowBlur = (reducedMotion ? 10 : 26) * glowBoost;
	drawShapePath(ctx, shape, x, y, width, height, cfg.radius);
	ctx.fillStyle = gradient;
	ctx.fill();

	ctx.shadowBlur = (reducedMotion ? 8 : 22) * glowBoost;
	drawShapePath(ctx, shape, x, y, width, height, cfg.radius);
	ctx.strokeStyle = palette.frame || "#67e8f9";
	ctx.lineWidth = borderStyle === "halo-frame" ? 2.6 : 2;
	ctx.stroke();

	if (borderStyle === "double-line" || shape === "double-line") {
		ctx.shadowBlur = reducedMotion ? 3 : 8;
		drawShapePath(
			ctx,
			shape,
			x + 4,
			y + 4,
			width - 8,
			height - 8,
			Math.max(4, cfg.radius - 4),
		);
		ctx.strokeStyle = palette.accent || "#fde68a";
		ctx.lineWidth = 1.1;
		ctx.stroke();
	} else if (borderStyle === "dashed" || borderStyle === "dotted") {
		ctx.setLineDash(borderStyle === "dotted" ? [1, 3] : [5, 4]);
		drawShapePath(ctx, shape, x + 1, y + 1, width - 2, height - 2, cfg.radius);
		ctx.strokeStyle = palette.accent || palette.frame || "#ffffff";
		ctx.lineWidth = 1.3;
		ctx.stroke();
		ctx.setLineDash([]);
	}

	const line1 = String(descriptor?.neon_line1 || descriptor?.name || "SHOP");
	const line2 = String(
		descriptor?.neon_line2 || descriptor?.neon_subline || "",
	);
	const textX = cfg.width / 2;
	const line1Y = height * 0.42;
	const fontFamily =
		typographyVariant === "mono"
			? '"IBM Plex Mono", "Noto Sans", monospace'
			: '"Noto Sans", sans-serif';
	const weight = typographyVariant === "headline" ? 800 : 700;

	// Double-pass text: glow pass then crisp pass for legibility
	ctx.font = `${weight} ${cfg.fontMain}px ${fontFamily}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// Pass 1: glow
	ctx.shadowColor = palette.glow || "rgba(103,232,249,0.6)";
	ctx.shadowBlur = reducedMotion ? 8 : 18;
	ctx.fillStyle = palette.text || "#ffffff";
	ctx.fillText(line1, textX, line1Y, width - 22);

	// Pass 2: crisp
	ctx.shadowBlur = 0;
	ctx.fillStyle = palette.text || "#ffffff";
	ctx.fillText(line1, textX, line1Y, width - 22);

	if (cfg.fontSub > 0) {
		// Subline glow pass
		ctx.shadowColor = palette.glow || "rgba(103,232,249,0.6)";
		ctx.shadowBlur = reducedMotion ? 3 : 8;
		ctx.fillStyle = palette.subline || palette.text || "#ffffff";
		ctx.font = `600 ${cfg.fontSub}px ${fontFamily}`;
		ctx.fillText(line2, textX, height * 0.72, width - 26);

		// Subline crisp pass
		ctx.shadowBlur = 0;
		ctx.fillText(line2, textX, height * 0.72, width - 26);
	}

	if (badgeStyle !== "badge-none") {
		const iconKey = String(descriptor?.neon_icon || "spark");
		const iconLabel = ICON_LABELS[iconKey] || "NV";
		const badgeSize = cfg.iconSize;
		const badgeX =
			badgeStyle === "badge-top-left" ? 6 : cfg.width - badgeSize - 6;
		const badgeY =
			badgeStyle === "badge-bottom-right" ? height - badgeSize - 2 : 6;
		const badgeRadius = badgeStyle === "badge-dot" ? badgeSize / 2 : 6;
		ctx.shadowBlur = reducedMotion ? 4 : 8;
		ctx.fillStyle = palette.accent || palette.frame || "#ffffff";
		if (badgeStyle === "badge-dot") {
			ctx.beginPath();
			ctx.arc(
				badgeX + badgeSize / 2,
				badgeY + badgeSize / 2,
				badgeRadius,
				0,
				Math.PI * 2,
			);
			ctx.fill();
		} else {
			ctx.beginPath();
			ctx.roundRect?.(badgeX, badgeY, badgeSize, badgeSize, badgeRadius);
			if (typeof ctx.roundRect !== "function") {
				drawShapePath(
					ctx,
					"rounded-rect",
					badgeX,
					badgeY,
					badgeSize,
					badgeSize,
					badgeRadius,
				);
			}
			ctx.fill();
		}
		ctx.fillStyle = highContrast ? "#000000" : "#020617";
		ctx.shadowBlur = 0;
		ctx.font = `700 ${Math.max(8, Math.round(cfg.iconSize * 0.43))}px "Noto Sans", sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(
			iconLabel,
			badgeX + badgeSize / 2,
			badgeY + badgeSize / 2 + 0.5,
		);
	}

	return canvas;
};

const readProp = (props, prefix, key) => {
	if (!prefix) return props?.[key];
	return props?.[`${prefix}${key}`];
};

const toDescriptorFromFeature = (feature, prefix = "") => {
	const props = feature?.properties || feature || {};
	const neonKey = String(readProp(props, prefix, "neon_key") || "").trim();
	if (!neonKey) return null;
	return {
		neon_key: neonKey,
		neon_variant: readProp(props, prefix, "neon_variant"),
		neon_signature_v2: readProp(props, prefix, "neon_signature_v2"),
		neon_signature_version: readProp(props, prefix, "neon_signature_version"),
		neon_experiment_id: readProp(props, prefix, "neon_experiment_id"),
		neon_client_version: readProp(props, prefix, "neon_client_version"),
		neon_palette: readProp(props, prefix, "neon_palette"),
		neon_shape: readProp(props, prefix, "neon_shape"),
		neon_border_style: readProp(props, prefix, "neon_border_style"),
		neon_badge_style: readProp(props, prefix, "neon_badge_style"),
		neon_glow_level: readProp(props, prefix, "neon_glow_level"),
		neon_typography_variant: readProp(props, prefix, "neon_typography_variant"),
		neon_icon: readProp(props, prefix, "neon_icon"),
		neon_subline: readProp(props, prefix, "neon_subline"),
		neon_line1: readProp(props, prefix, "neon_line1") || props.name || "SHOP",
		neon_line2:
			readProp(props, prefix, "neon_line2") ||
			readProp(props, prefix, "neon_subline") ||
			"",
	};
};

export function useNeonSignSpriteCache() {
	const lodCaches = {
		full: new Map(),
		compact: new Map(),
		mini: new Map(),
	};
	const stats = {
		hits: 0,
		misses: 0,
		generated: 0,
		failed: 0,
		deferred: 0,
		expired: 0,
		evicted: 0,
		totalGenerateMs: 0,
		memoryBytes: 0,
		lastQueueSize: 0,
	};

	const buildSpriteSignature = (descriptor, lod, options) =>
		[
			descriptor?.neon_key,
			descriptor?.neon_signature_v2,
			descriptor?.neon_signature_version,
			descriptor?.neon_experiment_id,
			descriptor?.neon_client_version,
			descriptor?.neon_variant,
			descriptor?.neon_palette,
			descriptor?.neon_shape,
			descriptor?.neon_border_style,
			descriptor?.neon_badge_style,
			descriptor?.neon_glow_level,
			descriptor?.neon_typography_variant,
			descriptor?.neon_icon,
			descriptor?.neon_line1,
			descriptor?.neon_line2,
			lod,
			options.reducedMotion ? "rm" : "fx",
			options.highContrast ? "hc" : "std",
		].join("|");

	const buildImageId = (signature) =>
		`neon-sign-${hashString(signature).toString(36)}`;

	const touchEntry = (cache, signature, entry) => {
		cache.delete(signature);
		cache.set(signature, {
			...entry,
			lastUsedAt: Date.now(),
		});
	};

	const removeEntry = (cache, signature, entry, mapInstance, reason) => {
		cache.delete(signature);
		if (entry?.imageId && mapInstance?.hasImage?.(entry.imageId)) {
			try {
				mapInstance.removeImage(entry.imageId);
			} catch {
				// Ignore style-transition races.
			}
		}
		stats.memoryBytes = Math.max(
			0,
			stats.memoryBytes - Number(entry?.byteSize || 0),
		);
		if (reason === "expired") stats.expired += 1;
		if (reason === "evicted") stats.evicted += 1;
	};

	const evictExpiredEntries = (cache, mapInstance, ttlMs) => {
		const now = Date.now();
		for (const [signature, entry] of cache.entries()) {
			if (now - Number(entry?.lastUsedAt || now) <= ttlMs) continue;
			removeEntry(cache, signature, entry, mapInstance, "expired");
		}
	};

	const getGlobalEntryStats = () => {
		let totalEntries = 0;
		let totalBytes = 0;
		for (const cache of Object.values(lodCaches)) {
			totalEntries += cache.size;
			for (const entry of cache.values()) {
				totalBytes += Number(entry?.byteSize || 0);
			}
		}
		return { totalEntries, totalBytes };
	};

	const findOldestGlobalEntry = () => {
		let oldest = null;
		for (const [lod, cache] of Object.entries(lodCaches)) {
			for (const [signature, entry] of cache.entries()) {
				if (!oldest || entry.lastUsedAt < oldest.entry.lastUsedAt) {
					oldest = { lod, cache, signature, entry };
				}
			}
		}
		return oldest;
	};

	const evictToBudget = (mapInstance, options) => {
		const memoryBudgetBytes = Math.round(options.memoryBudgetMb * 1024 * 1024);
		let { totalEntries, totalBytes } = getGlobalEntryStats();
		const maxEntries = 1000;

		while (totalEntries > maxEntries || totalBytes > memoryBudgetBytes) {
			const oldest = findOldestGlobalEntry();
			if (!oldest) break;
			removeEntry(
				oldest.cache,
				oldest.signature,
				oldest.entry,
				mapInstance,
				"evicted",
			);
			({ totalEntries, totalBytes } = getGlobalEntryStats());
		}

		stats.memoryBytes = totalBytes;
	};

	const ensureSprite = (
		mapInstance,
		descriptor,
		lod = "full",
		options = {},
	) => {
		if (!mapInstance || !descriptor?.neon_key) {
			return null;
		}
		const normalizedLod = LOD_CONFIG[lod] ? lod : "full";
		const cache = lodCaches[normalizedLod];
		const normalizedOptions = normalizeRenderOptions(options);

		evictExpiredEntries(cache, mapInstance, normalizedOptions.entryTtlMs);

		const signature = buildSpriteSignature(
			descriptor,
			normalizedLod,
			normalizedOptions,
		);
		const cached = cache.get(signature);
		if (cached?.imageId && mapInstance.hasImage?.(cached.imageId)) {
			stats.hits += 1;
			touchEntry(cache, signature, cached);
			return cached.imageId;
		}

		stats.misses += 1;
		const startedAt = performance.now();
		const spriteCanvas = drawNeonSign(
			descriptor,
			normalizedLod,
			normalizedOptions,
		);
		if (!spriteCanvas) {
			stats.failed += 1;
			return null;
		}

		const spriteCtx = spriteCanvas.getContext("2d");
		if (!spriteCtx) {
			stats.failed += 1;
			return null;
		}

		const spriteImageData = spriteCtx.getImageData(
			0,
			0,
			spriteCanvas.width,
			spriteCanvas.height,
		);
		const imageId = buildImageId(signature);
		try {
			if (mapInstance.hasImage?.(imageId)) {
				mapInstance.updateImage?.(imageId, spriteImageData);
			} else {
				mapInstance.addImage?.(imageId, spriteImageData, { pixelRatio: 2 });
			}
		} catch (error) {
			stats.failed += 1;
			return null;
		}

		const byteSize = Math.max(0, spriteCanvas.width * spriteCanvas.height * 4);
		stats.generated += 1;
		stats.totalGenerateMs += performance.now() - startedAt;
		touchEntry(cache, signature, {
			imageId,
			byteSize,
			lastUsedAt: Date.now(),
		});
		stats.memoryBytes += byteSize;

		if (typeof options.onGenerated === "function") {
			try {
				options.onGenerated({
					imageId,
					descriptor,
					lod: normalizedLod,
					canvas: spriteCanvas,
				});
			} catch {
				// Consumer callback errors must not break map rendering.
			}
		}

		evictToBudget(mapInstance, normalizedOptions);
		return imageId;
	};

	const ensureSpritesForFeatures = (
		mapInstance,
		features,
		lod = "full",
		options = {},
	) => {
		const normalizedLod = LOD_CONFIG[lod] ? lod : "full";
		const targetProperty = String(options.targetProperty || "").trim();
		const descriptorPrefix = String(options.descriptorPrefix || "").trim();
		if (!Array.isArray(features) || !features.length) {
			return { count: 0, imageIds: [], deferredCount: 0, mutatedCount: 0 };
		}

		const normalizedOptions = normalizeRenderOptions(options);
		const ranked = features
			.map((feature) => {
				const featurePriority = Number(
					feature?.properties?.neon_lod_priority || 0,
				);
				return {
					feature,
					priority: featurePriority + normalizedOptions.priority,
				};
			})
			.sort((a, b) => b.priority - a.priority);

		const maxConcurrent = Math.min(
			normalizedOptions.maxConcurrent,
			ranked.length,
		);
		stats.lastQueueSize = ranked.length;

		const imageIds = [];
		let deferredCount = 0;
		let mutatedCount = 0;
		const deferredEntries = [];
		const renderStartedAt = performance.now();
		const assignSpriteToFeature = (feature, imageId) => {
			if (!targetProperty || !feature?.properties || !imageId) return false;
			if (feature.properties[targetProperty] === imageId) return false;
			feature.properties[targetProperty] = imageId;
			return true;
		};
		for (let i = 0; i < ranked.length; i += 1) {
			const entry = ranked[i];
			const descriptor = toDescriptorFromFeature(
				entry.feature,
				descriptorPrefix,
			);
			if (!descriptor) continue;

			const deadlineExceeded =
				performance.now() - renderStartedAt > normalizedOptions.deadlineMs;
			if (i >= maxConcurrent || deadlineExceeded) {
				deferredCount += 1;
				deferredEntries.push(entry);
				continue;
			}

			const imageId = ensureSprite(
				mapInstance,
				descriptor,
				normalizedLod,
				normalizedOptions,
			);
			if (!imageId) continue;
			imageIds.push(imageId);
			if (assignSpriteToFeature(entry.feature, imageId)) {
				mutatedCount += 1;
			}
		}
		stats.deferred += deferredCount;
		if (deferredEntries.length > 0 && mapInstance) {
			const scheduleDeferredBatch = (nextIndex = 0) => {
				const processDeferred = () => {
					// Process a bounded deferred batch to avoid blocking interaction frames.
					const slice = deferredEntries.slice(
						nextIndex,
						nextIndex + maxConcurrent,
					);
					let batchMutations = 0;
					for (const entry of slice) {
						const descriptor = toDescriptorFromFeature(
							entry.feature,
							descriptorPrefix,
						);
						if (!descriptor) continue;
						const imageId = ensureSprite(
							mapInstance,
							descriptor,
							normalizedLod,
							normalizedOptions,
						);
						if (!imageId) continue;
						if (assignSpriteToFeature(entry.feature, imageId)) {
							mutatedCount += 1;
							batchMutations += 1;
						}
					}
					if (
						batchMutations > 0 &&
						typeof options.onDeferredBatch === "function"
					) {
						options.onDeferredBatch({
							lod: normalizedLod,
							processed: slice.length,
							remaining: Math.max(
								0,
								deferredEntries.length - (nextIndex + slice.length),
							),
						});
					}
					if (nextIndex + slice.length < deferredEntries.length) {
						scheduleDeferredBatch(nextIndex + slice.length);
					}
				};
				if (typeof requestIdleCallback === "function") {
					requestIdleCallback(processDeferred, { timeout: 1200 });
				} else {
					setTimeout(processDeferred, 0);
				}
			};
			scheduleDeferredBatch(0);
		}
		return { count: imageIds.length, imageIds, deferredCount, mutatedCount };
	};

	const clearAll = (mapInstance) => {
		for (const cache of Object.values(lodCaches)) {
			for (const [signature, entry] of cache.entries()) {
				removeEntry(cache, signature, entry, mapInstance, "evicted");
			}
			cache.clear();
		}
		stats.memoryBytes = 0;
	};

	const getStats = () => {
		const totalRequests = stats.hits + stats.misses;
		const missRate = totalRequests > 0 ? stats.misses / totalRequests : 0;
		const errorRate = totalRequests > 0 ? stats.failed / totalRequests : 0;
		return {
			hits: stats.hits,
			misses: stats.misses,
			generated: stats.generated,
			failed: stats.failed,
			deferred: stats.deferred,
			expired: stats.expired,
			evicted: stats.evicted,
			hitRatio: totalRequests > 0 ? stats.hits / totalRequests : 0,
			missRate,
			errorRate,
			avgGenerateMs:
				stats.generated > 0 ? stats.totalGenerateMs / stats.generated : 0,
			memoryBytes: stats.memoryBytes,
			memoryMb: stats.memoryBytes / (1024 * 1024),
			lastQueueSize: stats.lastQueueSize,
		};
	};

	return {
		ensureSprite,
		ensureSpritesForFeatures,
		clearAll,
		getStats,
	};
}
