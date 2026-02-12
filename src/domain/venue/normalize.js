export const normalizeId = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

export const normalizeSlug = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim().toLowerCase();
};
