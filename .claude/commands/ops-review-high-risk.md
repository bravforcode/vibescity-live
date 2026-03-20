---
description: Build a high-risk approval packet for a VibeCity operational report and surface the approval token plus exact proposed actions.
argument-hint: --report <reports/agents/*.json>
allowed-tools: Bash(node scripts/agents/build-approval-packet.mjs:*), Read, Grep, Glob
---

Run:

```bash
node scripts/agents/build-approval-packet.mjs $ARGUMENTS
```

Then summarize:

- why the event is gated
- approval token
- blocked rules
- exact proposed actions
