const SUCCESS_PHRASES = [
  "โอนเงินสำเร็จ",
  "โอนสำเร็จ",
  "สำเร็จ",
  "transfer successful",
  "payment successful",
];

const AMOUNT_KEYWORDS = [
  "ยอดเงิน",
  "จำนวนเงิน",
  "amount",
  "total",
  "บาท",
  "thb",
];

const RECEIVER_KEYWORDS = ["ชื่อผู้รับ", "ผู้รับ", "recipient", "to"];
const BANK_KEYWORDS = ["ธนาคาร", "bank"];
const ACCOUNT_KEYWORDS = ["บัญชี", "account"];

const normalize = (value: string) =>
  (value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

const normalizeText = (value: string) =>
  (value || "").trim().replace(/\s+/g, " ");

const digitsOnly = (value: string) => (value || "").replace(/\D/g, "");

const parseNumber = (value: string) => {
  const normalized = value.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractNumbers = (text: string) => {
  const matches = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2}|\d+/g) || [];
  return matches
    .map((match) => parseNumber(match))
    .filter((val): val is number => val !== null);
};

const findAmount = (lines: string[]) => {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (AMOUNT_KEYWORDS.some((kw) => lower.includes(kw))) {
      const nums = extractNumbers(line);
      if (nums.length > 0) return nums[0];
    }
  }

  const allNums = extractNumbers(lines.join(" "));
  if (allNums.length === 0) return null;
  return Math.max(...allNums);
};

const extractAfterKeyword = (line: string, keywords: string[]) => {
  const lower = line.toLowerCase();
  for (const keyword of keywords) {
    const idx = lower.indexOf(keyword);
    if (idx >= 0) {
      return line.slice(idx + keyword.length).trim();
    }
  }
  return "";
};

const findByKeywords = (lines: string[], keywords: string[]) => {
  for (const line of lines) {
    const candidate = extractAfterKeyword(line, keywords);
    if (candidate) return candidate;
  }
  return "";
};

const accountTailMatches = (
  expected: string,
  text: string,
  tailLength: number,
) => {
  if (!expected) return false;
  const expectedDigits = digitsOnly(expected);
  const textDigits = digitsOnly(text);
  if (!expectedDigits || !textDigits) return false;
  const safeTail = tailLength > 0
    ? tailLength
    : Math.min(4, expectedDigits.length);
  const tail = expectedDigits.slice(-safeTail);
  return textDigits.includes(tail);
};

const matchesAnyNormalized = (text: string, expectedList: string[]) => {
  if (expectedList.length === 0) return false;
  const textNorm = normalize(text);
  return expectedList.some((item) => textNorm.includes(normalize(item)));
};

const parseTimestamp = (text: string) => {
  const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(\d{1,2}:\d{2})?/);
  if (!match) return "";
  return match[0];
};

export const evaluateSlipText = (params: {
  text: string;
  expectedAmount: number;
  expectedReceiverName: string;
  expectedReceiverBanks: string[];
  expectedReceiverAccount: string;
  expectedReceiverAccountTail: number;
}) => {
  const lines = (params.text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const normalizedText = normalizeText(lines.join(" "));
  const normalizedCompact = normalize(normalizedText);

  const successFound = SUCCESS_PHRASES.some((phrase) =>
    normalizedCompact.includes(normalize(phrase)),
  );

  const amount = findAmount(lines);
  const amountMatch =
    amount !== null && Math.abs(amount - params.expectedAmount) < 0.01;

  const receiverLine = findByKeywords(lines, RECEIVER_KEYWORDS);
  const receiverName = receiverLine || "";
  const receiverNameMatch = params.expectedReceiverName
    ? normalize(normalizedText).includes(normalize(params.expectedReceiverName))
    : false;

  const bankLine = findByKeywords(lines, BANK_KEYWORDS);
  const receiverBank = bankLine || "";
  const receiverBankMatch = matchesAnyNormalized(
    normalizedText,
    params.expectedReceiverBanks,
  );

  const accountLine = findByKeywords(lines, ACCOUNT_KEYWORDS);
  const receiverAccountMatch = accountTailMatches(
    params.expectedReceiverAccount,
    normalizedText,
    params.expectedReceiverAccountTail,
  );

  const timestamp = parseTimestamp(normalizedText);

  const signals = {
    success_phrase: successFound,
    amount_found: amount !== null,
    amount_match: amountMatch,
    receiver_name_match: receiverNameMatch,
    receiver_bank_match: receiverBankMatch,
    receiver_account_match: receiverAccountMatch,
    timestamp_found: Boolean(timestamp),
  };

  const score =
    (signals.success_phrase ? 0.2 : 0) +
    (signals.amount_match ? 0.4 : 0) +
    (signals.receiver_name_match ? 0.2 : 0) +
    (signals.receiver_bank_match ? 0.1 : 0) +
    (signals.receiver_account_match ? 0.1 : 0);

  let status: "verified" | "rejected" | "pending_review" = "pending_review";
  let reason = "low_confidence";

  if (!signals.amount_found) {
    reason = "amount_missing";
  } else if (!signals.amount_match) {
    status = "rejected";
    reason = "amount_mismatch";
  } else if (score >= 0.75) {
    status = "verified";
    reason = "verified";
  }

  return {
    status,
    reason,
    score: Number(score.toFixed(2)),
    amount,
    timestamp,
    receiver: {
      name: receiverName,
      bank: receiverBank,
      account: accountLine,
    },
    signals,
    normalizedText,
  };
};
