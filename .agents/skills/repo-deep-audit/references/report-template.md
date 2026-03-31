# Report Template

Use this structure for the final human-readable audit report.

## Scope

- repo or path audited
- manifest size
- review date
- review confidence limits

## Executive Summary

- overall repo score
- strongest zones
- weakest zones
- immediate stop-ship issues

## Score Distribution

| Band | Count | Notes |
| --- | --- | --- |
| `95-100` |  |  |
| `85-94` |  |  |
| `70-84` |  |  |
| `50-69` |  |  |
| `0-49` |  |  |

## Highest-Risk Files

| File | Score | Why It Is Risky | First Fix |
| --- | --- | --- | --- |

## Cross-Cutting Themes

- architecture and ownership
- testing gaps
- security gaps
- operational gaps
- documentation gaps

## File-Level Findings

For each weak file, include:

1. file path
2. score
3. evidence-backed reason
4. concrete remediation

## Prioritized Backlog

| Priority | Task | Files | Why Now |
| --- | --- | --- | --- |

## Coverage Statement

State explicitly that every manifest file received one review disposition.
