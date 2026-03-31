import {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestError
} from "@playwright/test/reporter";
import * as Sentry from "@sentry/node";
import fs from "node:fs";
import path from "node:path";

function getSentryDsn() {
  if (process.env.VITE_SENTRY_DSN) return process.env.VITE_SENTRY_DSN;
  if (process.env.SENTRY_DSN) return process.env.SENTRY_DSN;
  
  const envFiles = [".env.production.local", ".env.local", ".env"];
  for (const file of envFiles) {
    try {
      const fullPath = path.resolve(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf8");
        const match = content.match(/^\s*(?:VITE_SENTRY_DSN|SENTRY_DSN)\s*=\s*['"]?([^'"\s]+)['"]?/m);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch (e) {}
  }
  return undefined;
}

class SentryReporter implements Reporter {
  private dsn: string | undefined;

  constructor(options: { dsn?: string } = {}) {
    this.dsn = options.dsn || getSentryDsn();
  }

  onBegin(config: FullConfig, suite: Suite) {
    if (this.dsn) {
      Sentry.init({
        dsn: this.dsn,
        tracesSampleRate: 1.0,
        environment: process.env.NODE_ENV || "test",
        debug: false,
      });
    } else {
      console.warn(
        "[SentryReporter] No DSN provided. Test failures will not be sent to Sentry."
      );
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (!this.dsn) return;

    if (result.status === "failed" || result.status === "timedOut") {
      const error: TestError | undefined = result.error || result.errors?.[0];
      const errorMessage = error?.message || `Test ${result.status}`;
      const errorStack = error?.stack || "";
      
      const exception = new Error(`[Playwright E2E] Test failed: ${errorMessage}`);
      if (errorStack) {
        exception.stack = errorStack;
      }

      Sentry.withScope((scope) => {
        scope.setTag("test_project", test.parent?.project()?.name || "unknown");
        scope.setTag("test_title", test.title);
        scope.setTag("test_status", result.status);
        if (test.location) {
          scope.setExtra("location", `${test.location.file}:${test.location.line}`);
        }
        scope.setExtra("retry", result.retry);
        scope.setExtra("duration_ms", result.duration);
        scope.setExtra("attachments", result.attachments.map(a => a.name));

        Sentry.captureException(exception);
      });
    }
  }

  async onEnd(result: FullResult) {
    if (this.dsn) {
      // Flush events to ensure they are sent before the process exits
      await Sentry.flush(2000);
    }
  }
}

export default SentryReporter;
