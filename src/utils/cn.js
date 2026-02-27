/**
 * Lightweight, predictable CSS utility merger.
 * Resolves basic Tailwind class conflicts (e.g., bg-red-500 vs bg-blue-500)
 * by taking the last declared utility for a given prefix.
 *
 * @param  {...any} inputs - Class names, arrays, or objects
 * @returns {string} Merged class string
 */
export function cn(...inputs) {
	const classList = inputs
		.flat(Infinity)
		.filter(Boolean)
		.map((i) =>
			typeof i === "object"
				? Object.keys(i)
						.filter((k) => i[k])
						.join(" ")
				: String(i),
		)
		.join(" ")
		.split(/\s+/)
		.filter(Boolean);

	const result = {};
	const uniqueClasses = [];

	for (const cls of classList) {
		// Attempt to extract the "base" utility (e.g., 'hover:bg-', 'text-', 'p-', 'mx-')
		// The regex matches optional variants (e.g. sm:hover:) and the base utility prefix
		const prefixMatch = cls.match(/^((?:[a-z0-9_]+:)*)([a-zA-Z]+-)/);

		if (prefixMatch) {
			const prefix = prefixMatch[0]; // e.g., 'hover:bg-'

			// If we've seen this prefix before, we replace it,
			// otherwise we add it. This ensures "latest wins" logic.
			result[prefix] = cls;
		} else {
			// For utilities without hyphens (e.g., 'flex', 'absolute', 'relative')
			// or specific complex ones, we treat them as unique
			uniqueClasses.push(cls);
		}
	}

	// Reconstruct the final string by deduping uniqueClasses and adding our resolved prefixes
	const resolvedStr = Object.values(result).join(" ");
	const uniqueStr = [...new Set(uniqueClasses)].join(" ");

	const final = `${uniqueStr} ${resolvedStr}`.trim();
	return final;
}
