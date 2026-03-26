/**
 * 🖼️ Global Graceful Image Fallback
 * Intercepts broken images globally and replaces them with a polished SVG.
 * Handles both avatars and standard images based on class names and dimensions.
 * Item 18: Broken Avatars Graceful_Image_Fallback()
 */

const AVATAR_FALLBACK = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236B7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="24" height="24" fill="%231F2937" stroke="none"/><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

const IMAGE_FALLBACK = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236B7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="24" height="24" fill="%23111827" stroke="none"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;

export function setupGlobalImageFallback() {
	if (typeof window === "undefined") return;

	// Use capture phase to catch `error` events before they are discarded
	// (error events on <img> elements do not bubble up)
	window.addEventListener(
		"error",
		(event) => {
			const target = event.target;

			// Only process <img> elements
			if (target && target.tagName === "IMG") {
				// Prevent infinite fallback loops
				if (target.getAttribute("data-fallback-applied")) {
					return;
				}

				target.setAttribute("data-fallback-applied", "true");

				// Heuristics to determine if image is an avatar
				const isAvatar =
					target.className.includes("rounded-full") ||
					target.className.includes("avatar") ||
					(target.width > 0 &&
						target.width <= 64 &&
						target.height > 0 &&
						target.height <= 64);

				// Apply appropriate beautiful SVG fallback
				target.src = isAvatar ? AVATAR_FALLBACK : IMAGE_FALLBACK;

				// Optional: subtle styling to indicate it's a fallback placeholder
				target.style.objectFit = "cover";
				target.style.opacity = "0.7";
			}
		},
		true, // Enable capture phase
	);
}
