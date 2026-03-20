/**
 * Demo script to showcase the Category Color Engine
 *
 * This script demonstrates the core color generation algorithm
 * with visual output showing the generated colors.
 *
 * Run with: bun run src/lib/neon/demo-color-generation.ts
 */

import { calculateDeltaE, generateNeonColors } from "./color-engine";
import type { NeonColor } from "./neon-config";

console.log("🎨 Neon Venue Signs - Color Generation Demo\n");
console.log("=".repeat(60));
console.log("\n");

// Generate 10 sample colors
const colors = generateNeonColors(10, {
	saturationRange: [70, 100],
	lightnessRange: [50, 70],
	minDeltaE: 30,
});

console.log("Generated 10 unique neon colors:\n");

colors.forEach((color: NeonColor, index: number) => {
	const { h, s, l } = color.hsl;
	const { r, g, b } = color.rgb;
	const { hex } = color;

	console.log(`Color ${index + 1}:`);
	console.log(
		`  HSL: h=${h.toFixed(1)}° s=${s.toFixed(1)}% l=${l.toFixed(1)}%`,
	);
	console.log(`  RGB: r=${r} g=${g} b=${b}`);
	console.log(`  HEX: ${hex}`);
	console.log("");
});

console.log("=".repeat(60));
console.log("\n");

// Verify perceptual differences
console.log("Verifying perceptual color differences (ΔE):\n");

let minDeltaE = Infinity;
let maxDeltaE = 0;
let totalDeltaE = 0;
let comparisons = 0;

for (let i = 0; i < colors.length; i++) {
	for (let j = i + 1; j < colors.length; j++) {
		const deltaE = calculateDeltaE(colors[i], colors[j]);
		minDeltaE = Math.min(minDeltaE, deltaE);
		maxDeltaE = Math.max(maxDeltaE, deltaE);
		totalDeltaE += deltaE;
		comparisons++;
	}
}

const avgDeltaE = totalDeltaE / comparisons;

console.log(
	`  Minimum ΔE: ${minDeltaE.toFixed(2)} ${minDeltaE >= 30 ? "✓" : "✗"}`,
);
console.log(`  Maximum ΔE: ${maxDeltaE.toFixed(2)}`);
console.log(`  Average ΔE: ${avgDeltaE.toFixed(2)}`);
console.log(`  Total comparisons: ${comparisons}`);
console.log("");

if (minDeltaE >= 30) {
	console.log("✅ All colors meet the minimum ΔE threshold of 30!");
} else {
	console.log("⚠️  Some colors are below the minimum ΔE threshold.");
}

console.log("\n");
console.log("=".repeat(60));
console.log("\n");

// Verify constraints
console.log("Verifying HSL constraints:\n");

let allValid = true;

colors.forEach((color: NeonColor, index: number) => {
	const { h, s, l } = color.hsl;

	const saturationValid = s >= 70 && s <= 100;
	const lightnessValid = l >= 50 && l <= 70;
	const hueValid = !(h >= 0 && h <= 20); // Not in red spectrum

	const valid = saturationValid && lightnessValid && hueValid;

	if (!valid) {
		console.log(`  Color ${index + 1}: ${valid ? "✓" : "✗"}`);
		if (!saturationValid)
			console.log(`    - Saturation ${s.toFixed(1)}% outside [70, 100]`);
		if (!lightnessValid)
			console.log(`    - Lightness ${l.toFixed(1)}% outside [50, 70]`);
		if (!hueValid)
			console.log(
				`    - Hue ${h.toFixed(1)}° in excluded red spectrum [0, 20]`,
			);
		allValid = false;
	}
});

if (allValid) {
	console.log("✅ All colors meet HSL constraints!");
	console.log("  - Saturation: [70, 100]%");
	console.log("  - Lightness: [50, 70]%");
	console.log("  - Hue: Not in red spectrum [0, 20]°");
} else {
	console.log("⚠️  Some colors violate HSL constraints.");
}

console.log("\n");
console.log("=".repeat(60));
console.log("\n");

// Show color distribution
console.log("Hue distribution (Golden Ratio - 137.5° spacing):\n");

const sortedByHue = [...colors].sort((a, b) => a.hsl.h - b.hsl.h);

sortedByHue.forEach((color: NeonColor, _index: number) => {
	const { h } = color.hsl;
	const { hex } = color;

	// Create a simple visual bar
	const barLength = Math.round((h / 360) * 40);
	const bar = "█".repeat(barLength) + "░".repeat(40 - barLength);

	console.log(`  ${hex} ${bar} ${h.toFixed(1)}°`);
});

console.log("\n");
console.log("=".repeat(60));
console.log("\n");
console.log("✨ Demo complete!\n");
