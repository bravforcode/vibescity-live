const toText = (value: unknown): string => String(value ?? "").trim();

const maskMid = (
	value: string,
	prefix: number,
	suffix: number,
	maskChar = "•",
): string => {
	if (!value) return "";
	if (value.length <= prefix + suffix) return maskChar.repeat(value.length);
	return `${value.slice(0, prefix)}${maskChar.repeat(value.length - prefix - suffix)}${value.slice(-suffix)}`;
};

const formatCurrency = (
	amount: unknown,
	locale = "th-TH",
	currency = "THB",
) => {
	const value = Number(amount || 0);
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		maximumFractionDigits: 2,
	}).format(Number.isFinite(value) ? value : 0);
};

export const mask = {
	bankAccount(value: unknown) {
		return maskMid(toText(value).replace(/\s+/g, ""), 3, 3);
	},
	phone(value: unknown) {
		return maskMid(toText(value).replace(/\s+/g, ""), 2, 2);
	},
	idCard(value: unknown) {
		return maskMid(toText(value).replace(/\s+/g, ""), 1, 2);
	},
	revenue(amount: unknown, role: string) {
		if (String(role || "").toLowerCase() === "owner")
			return formatCurrency(amount);
		return "฿•••,•••";
	},
};

export { formatCurrency };
