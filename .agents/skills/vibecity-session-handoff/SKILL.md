---
name: vibecity-session-handoff
description: Project-local bootstrap and continuity workflow for the VibeCity repository. Use when working in C:\vibecity.live, when the user asks to continue or resume earlier work, or when changing runtime, map, performance, console-hygiene, or dev-server behavior that must preserve the repo's current hardening state. Read docs/runbooks/agent-operating-memory.md before planning or editing, and update it after meaningful discoveries, validation runs, or shipped changes.
---

# VibeCity Session Handoff

1. Read `C:\vibecity.live\docs\runbooks\agent-operating-memory.md` before any plan, edit, or verification step.
2. Use that file as the source of truth for:
   - current runtime hardening status
   - expected local-dev defaults
   - hot files that are most likely relevant
   - pending resume items
   - validation commands that have already been proven in this repo
3. When the task touches HMR, WebGL, map lifecycle, performance, or console hygiene:
   - inspect the files named in the memory doc first
   - verify behavior in a real browser before claiming the issue is solved
   - keep the console quiet by default unless the user explicitly asks for verbose diagnostics
4. After meaningful work:
   - update the memory doc's `Last updated`, `Current focus`, `Current Resume Items`, and `Current Snapshot`
   - replace stale notes instead of letting the file become a changelog
5. If the repo gains a new permanent workflow rule or a recurring gotcha, update both the memory doc and `AGENTS.md`.

Use this skill to resume work quickly and to keep future sessions from rediscovering the same runtime and map details from scratch.
