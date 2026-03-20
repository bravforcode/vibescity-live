---
description: Execute a safe VibeCity remediation profile from an existing agent report. Use only for allowlisted reports with approval_required=false.
argument-hint: --report <reports/agents/*.json> [--execute]
allowed-tools: Bash(node scripts/agents/safe-remediate.mjs:*), Read, Grep, Glob
---

Run:

```bash
node scripts/agents/safe-remediate.mjs $ARGUMENTS
```

Then summarize:

- remediation profile
- execution status
- output report path
- any next validation step
