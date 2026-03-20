---
description: Show the current VibeCity autonomous-ops status board from reports/agents.
argument-hint: none
allowed-tools: Bash(node scripts/agents/triage-cycle.mjs:*), Read, Grep, Glob
---

Run:

```bash
node scripts/agents/triage-cycle.mjs --status
```

Summarize the current counts and highlight any high-risk or approval-required items.
