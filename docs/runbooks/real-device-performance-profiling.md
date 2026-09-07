# Real Device Performance Profiling (Chrome Remote Debugging)

## Goal

Capture and attach **Performance trace** + **HAR** from a **real mobile device** for `/en` so PR reviewers can validate field-like behavior (network + main-thread + map initialization timeline).

## Scope

- in: Real-device Chrome DevTools Remote Debugging, trace/HAR capture, and analysis outputs
- out: Automated capture on the device (requires human-in-the-loop)

## Prerequisites

- Android device with Chrome installed
- Desktop Chrome (same machine used for remote debug)
- USB cable + USB debugging enabled
- Known test URL:
  - Preview: `https://<preview-domain>/en` (preferred), or
  - Local LAN: `http://<your-ip>:5417/en` (only if your phone can reach your machine)

## Recommended test matrix

Run 2 passes per device:

1) **Fast 4G** (or WiFi) – sanity + baseline
2) **Slow 4G** – field-like stress

Record the exact network conditions used (DevTools throttling preset + any external shaping).

## Step 1 — Connect device and open remote target

1) Enable Developer options → USB debugging (Android)
2) Connect phone to desktop via USB
3) On desktop Chrome open:
   - `chrome://inspect/#devices`
4) Ensure your device appears, then open your `/en` page on the phone
5) In `chrome://inspect` click **Inspect** for that tab

## Step 2 — Capture Performance trace

1) DevTools → **Performance**
2) Enable:
   - Screenshots
   - Web Vitals
   - Memory (optional)
3) Click **Record**
4) On the phone tab: **Reload**
5) Wait until:
   - header is visible
   - search bar is usable
   - (optionally) map shows first render
6) Stop recording
7) Save: **Export** / **Save profile…**

Save path convention:

`reports/performance/device/<YYYY-MM-DD>/<device>-<os>-<net>/trace.json`

## Step 3 — Capture HAR (Network waterfall)

1) DevTools → **Network**
2) Enable:
   - Preserve log
   - Disable cache (only for the run)
3) Reload
4) After load stabilizes: Export HAR (Save all as HAR with content)

Save path convention:

`reports/performance/device/<YYYY-MM-DD>/<device>-<os>-<net>/network.har`

## Step 4 — Analyze trace/HAR locally and paste results into PR

Run:

```bash
node scripts/performance/analyze-chrome-trace.mjs --trace reports/performance/device/<...>/trace.json
node scripts/performance/analyze-har.mjs --har reports/performance/device/<...>/network.har
```

Copy/paste the JSON outputs into the PR description under “Performance Evidence”.

## Step 5 — Attach files to PR (required)

Attach the two raw files:

- `trace.json`
- `network.har`

and provide metadata:

- Device model
- OS version
- Chrome version
- Network conditions (preset + any shaping)
- URL tested

If repo policy blocks committing `reports/` to git (default), attach via GitHub UI (PR attachments / comment upload) or upload as CI artifacts in a dedicated workflow run.

