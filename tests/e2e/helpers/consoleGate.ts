import { expect, type Page } from "@playwright/test";
import {
  CONSOLE_WARNING_ALLOWLIST,
  type ConsoleAllowlistRule,
  type ConsoleSeverity,
} from "../console-warning-allowlist";

interface ConsoleGateEntry {
  severity: ConsoleSeverity;
  text: string;
  source: string;
  line?: number;
  column?: number;
  ruleId?: string;
}

interface ConsoleGateController {
  assertClean: () => void;
  getEntries: () => ConsoleGateEntry[];
  getUnexpectedEntries: () => ConsoleGateEntry[];
}

const CONSOLE_SEVERITY_MAP: Record<string, ConsoleSeverity | null> = {
  warning: "warning",
  error: "error",
};

function matchAllowlistRule(
  entry: ConsoleGateEntry,
  allowlist: ConsoleAllowlistRule[],
): ConsoleAllowlistRule | null {
  for (const rule of allowlist) {
    if (rule.severity !== entry.severity) {
      continue;
    }
    if (!rule.message.test(entry.text)) {
      continue;
    }
    if (rule.source && !rule.source.test(entry.source)) {
      continue;
    }
    return rule;
  }
  return null;
}

export function attachConsoleGate(
  page: Page,
  allowlist: ConsoleAllowlistRule[] = CONSOLE_WARNING_ALLOWLIST,
): ConsoleGateController {
  const entries: ConsoleGateEntry[] = [];
  const unexpectedEntries: ConsoleGateEntry[] = [];

  const recordEntry = (entry: ConsoleGateEntry) => {
    const matchedRule = matchAllowlistRule(entry, allowlist);
    if (matchedRule) {
      entry.ruleId = matchedRule.id;
    } else {
      unexpectedEntries.push(entry);
    }

    entries.push(entry);
  };

  page.on("console", (message) => {
    const severity = CONSOLE_SEVERITY_MAP[message.type()];
    if (!severity) {
      return;
    }

    const location = message.location();
    const entry: ConsoleGateEntry = {
      severity,
      text: message.text(),
      source: location.url || "<inline>",
      line: location.lineNumber,
      column: location.columnNumber,
    };

    recordEntry(entry);
  });

  page.on("pageerror", (error) => {
    recordEntry({
      severity: "error",
      text: error?.stack || error?.message || String(error),
      source: "<pageerror>",
    });
  });

  return {
    assertClean: () => {
      expect(
        unexpectedEntries,
        `Unexpected console warnings/errors:\n${unexpectedEntries
          .map(
            (entry) =>
              `- [${entry.severity}] ${entry.text} @ ${entry.source}:${entry.line ?? 0}:${entry.column ?? 0}`,
          )
          .join("\n")}`,
      ).toEqual([]);
    },
    getEntries: () => entries,
    getUnexpectedEntries: () => unexpectedEntries,
  };
}
