export type MaskedValue = string;

interface MaskOptions {
	visibleSuffix?: number;
	maskChar?: string;
	minimumMaskedLength?: number;
}

const DEFAULT_MASK_OPTIONS: Required<MaskOptions> = {
	visibleSuffix: 4,
	maskChar: "*",
	minimumMaskedLength: 6,
};

const toSafeString = (value: unknown): string =>
	String(value ?? "")
		.trim()
		.replace(/\s+/g, " ");

export const maskKeepLast = (
	value: unknown,
	options: MaskOptions = {},
): MaskedValue => {
	const safeValue = toSafeString(value);
	if (!safeValue) return "";

	const config = { ...DEFAULT_MASK_OPTIONS, ...options };
	const visibleSuffix = Math.max(1, config.visibleSuffix);
	const maskCount = Math.max(
		config.minimumMaskedLength,
		safeValue.length - visibleSuffix,
	);
	const visiblePart = safeValue.slice(-visibleSuffix);
	return `${config.maskChar.repeat(maskCount)}${visiblePart}`;
};

export const maskUserId = (value: unknown): MaskedValue =>
	maskKeepLast(value, { visibleSuffix: 4, minimumMaskedLength: 8 });

export const maskPhoneNumber = (value: unknown): MaskedValue => {
	const digits = toSafeString(value).replace(/\D/g, "");
	if (!digits) return "";
	return maskKeepLast(digits, {
		visibleSuffix: Math.min(4, digits.length),
		minimumMaskedLength: 6,
	});
};

export const maskPaymentSlipUrl = (value: unknown): MaskedValue => {
	const safeValue = toSafeString(value);
	if (!safeValue) return "";
	try {
		const parsed = new URL(safeValue);
		const filename = parsed.pathname.split("/").filter(Boolean).at(-1) || "";
		const maskedFile = maskKeepLast(filename, {
			visibleSuffix: 4,
			minimumMaskedLength: 8,
		});
		return `${parsed.origin}/.../${maskedFile}`;
	} catch {
		return maskKeepLast(safeValue, {
			visibleSuffix: 4,
			minimumMaskedLength: 10,
		});
	}
};

const ID_FIELD_PATTERN = /(^|_)(id|user_id)$/i;
const PHONE_FIELD_PATTERN = /phone|tel|mobile/i;
const SLIP_URL_FIELD_PATTERN = /slip|payment.*url|receipt.*url/i;

export const maskSensitiveField = (
	fieldName: string,
	value: unknown,
): MaskedValue => {
	if (value === null || value === undefined) return "";
	if (SLIP_URL_FIELD_PATTERN.test(fieldName)) {
		return maskPaymentSlipUrl(value);
	}
	if (PHONE_FIELD_PATTERN.test(fieldName)) {
		return maskPhoneNumber(value);
	}
	if (ID_FIELD_PATTERN.test(fieldName)) {
		return maskUserId(value);
	}
	return toSafeString(value);
};
