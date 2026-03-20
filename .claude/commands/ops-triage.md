---
description: Triage VibeCity CI, observability, and workflow-failure signals through the autonomous ops mesh and write a standardized report in reports/agents.
argument-hint: [--trigger <name>] [--workflow <name>] [--source <value>] [--input <path>]
allowed-tools: Bash(node scripts/agents/triage-cycle.mjs:*), Read, Grep, Glob
---

Run:

```bash
node scripts/agents/triage-cycle.mjs $ARGUMENTS
```

Then read the emitted Markdown report under `reports/agents/` and summarize:

- classification
- risk level
- approval requirement
- rerun commands
