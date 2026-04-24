## Summary

[Perf iteration: 1 root-cause only]

## Root-cause (single)

- [Describe the single bottleneck you are addressing]

## Evidence (before)

- Perf gate results: [link to CI run artifacts]
- Real device trace: [attached file name]
- Real device HAR: [attached file name]
- Device: [model], OS: [version], Chrome: [version]
- Network conditions: [preset + details]
- URL: [/en]

## Change

- [What was changed to address the bottleneck]

## Evidence (after)

- Perf gate results: [link to CI run artifacts]
- Improvement:
  - LCP p75: [before] → [after] ([%])
  - TBT p75: [before] → [after] ([%])

## Tests

- `bun run lint`
- `bun run test:unit:coverage`
- `bun run test:e2e:smoke`

## Escalation rule

- If **2 iterations** fail to meet perf gate: escalate to perf taskforce for re-architecture options (SSR / partial prerender / route split).

## Rollback steps

[How to revert safely]

## สรุปภาษาไทย

[สรุปผล + ค่า before/after + ลิงก์หลักฐาน]

