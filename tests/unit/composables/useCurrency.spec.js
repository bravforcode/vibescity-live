import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";

vi.mock("../../../src/composables/useLocalStorage", () => ({
  useLocalStorage: vi.fn((key, defaultVal) => ref(defaultVal)),
}));

vi.mock("../../../src/composables/useToast", () => ({
  useToast: vi.fn(() => ({
    addToast: vi.fn(),
  })),
}));

vi.mock("../../../src/composables/useFeatureFlags", () => ({
  useFeatureFlags: vi.fn(() => ({
    isEnabledForActor: vi.fn(() => true),
  })),
}));

vi.mock("../../../src/composables/useI18n", () => ({
  useI18n: vi.fn(() => ({
    t: vi.fn((key) => key),
    locale: ref("th"),
  })),
}));

import { useCurrency } from "../../../src/composables/useCurrency";

describe("useCurrency", () => {
  describe("formatPrice", () => {
    it("formats number to currency string", () => {
      const { formatPrice } = useCurrency();
      const result = formatPrice(150);
      expect(typeof result).toBe("string");
      expect(result).toContain("150");
    });

    it("formats 0", () => {
      const { formatPrice } = useCurrency();
      const result = formatPrice(0);
      expect(result).toContain("0");
    });

    it("formats negative number", () => {
      const { formatPrice } = useCurrency();
      const result = formatPrice(-100);
      expect(typeof result).toBe("string");
    });

    it("formats large number", () => {
      const { formatPrice } = useCurrency();
      const result = formatPrice(1000000);
      expect(typeof result).toBe("string");
      expect(result).toContain("1");
    });
  });

  describe("currency state", () => {
    it("has currentCurrency ref", () => {
      const { currentCurrency } = useCurrency();
      expect(currentCurrency).toBeDefined();
    });

    it("has getPriceValue", () => {
      const { getPriceValue } = useCurrency();
      expect(typeof getPriceValue).toBe("function");
      expect(getPriceValue(100)).toBe(100);
    });
  });

  describe("toggleCurrency", () => {
    it("toggles between currencies", () => {
      const { currentCurrency, toggleCurrency } = useCurrency();
      const initial = currentCurrency.value;
      toggleCurrency();
      const next = currentCurrency.value;
      expect(next).not.toBe(initial);
    });
  });

  describe("setCurrency", () => {
    it("sets specific currency", () => {
      const { currentCurrency, setCurrency } = useCurrency();
      setCurrency("USD");
      expect(currentCurrency.value).toBe("USD");
    });

    it("accepts THB", () => {
      const { currentCurrency, setCurrency } = useCurrency();
      setCurrency("THB");
      expect(currentCurrency.value).toBe("THB");
    });
  });
});
