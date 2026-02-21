export type ConsoleSeverity = "warning" | "error";

export interface ConsoleAllowlistRule {
  id: string;
  severity: ConsoleSeverity;
  message: RegExp;
  source?: RegExp;
  note: string;
}

const ALLOW_BLOCKED_BY_CLIENT_LOCAL_DEV =
  process.env.PW_CONSOLE_ALLOW_BLOCKED === "1" && !process.env.CI;

const LOCAL_DEV_ALLOWLIST_RULES: ConsoleAllowlistRule[] =
  ALLOW_BLOCKED_BY_CLIENT_LOCAL_DEV
    ? [
        {
          id: "local-dev-blocked-by-client",
          severity: "error",
          message: /ERR_BLOCKED_BY_CLIENT/i,
          note: "Allow ad-block/network-extension blocked requests for local/dev lane only.",
        },
      ]
    : [];

export const CONSOLE_WARNING_ALLOWLIST: ConsoleAllowlistRule[] = [
  {
    id: "browser-resize-observer-loop",
    severity: "warning",
    message: /ResizeObserver loop limit exceeded/i,
    note: "Known Chromium noise with heavy layout updates.",
  },
  {
    id: "browser-preload-not-used",
    severity: "warning",
    message: /preloaded using link preload but not used/i,
    note: "Benign preload warning emitted by Chromium.",
  },
  {
    id: "browser-violation-warning",
    severity: "warning",
    message: /\bViolation\b/i,
    note: "Chromium DevTools performance advisory.",
  },
  {
    id: "webgl-software-renderer",
    severity: "warning",
    message: /Software WebGL renderer detected/i,
    note: "Fallback software renderer warning in CI/headless environments.",
  },
  {
    id: "webgl-driver-readpixels",
    severity: "warning",
    message: /GL Driver Message .*ReadPixels/i,
    note: "Known GPU driver noise in headless Chromium runs.",
  },
  {
    id: "runtime-ws-disabled",
    severity: "warning",
    message: /VITE_WS_URL not set - realtime features disabled/i,
    note: "Expected in isolated e2e runs without realtime backend.",
  },
  {
    id: "runtime-ws-invalid-protocol",
    severity: "warning",
    message: /VITE_WS_URL has invalid protocol/i,
    note: "Expected if e2e intentionally sets empty ws URL.",
  },
  {
    id: "socket-connection-refused",
    severity: "error",
    message: /WebSocket connection to 'ws:\/\/127\.0\.0\.1:8000\/api\/v1\/vibes\/vibe-stream' failed/i,
    note: "Legacy local websocket endpoint may be unreachable in e2e.",
  },
  {
    id: "mapbox-non-passive-listener",
    severity: "warning",
    message: /non-passive event listener/i,
    source: /mapbox|mapbox-gl|mapbox\.com/i,
    note: "Mapbox internals emit this on touch listeners.",
  },
  ...LOCAL_DEV_ALLOWLIST_RULES,
];
