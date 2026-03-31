## Goal

- Make the public venue surface production-safe when real media coverage is incomplete.
- Only surface venues that have both authoritative real images and authoritative real videos.
- Keep incomplete venues hidden until owned or authority-backed proof exists.

## Constraints

- Do not fabricate media from generic social profiles.
- Do not claim nationwide completeness beyond the current venue corpus.
- Preserve localhost snapshot bypass for frontend-only dev.

## Implementation

1. Add `has_complete_media` coverage to the shop media API.
2. Add `require_complete` filtering to shop media index and detail endpoints.
3. Make public frontend venue hydration fail closed unless a venue has both real image and real video.
4. Add regression tests for API coverage summaries and public store filtering.

## Success Criteria

- Public venue list excludes rows without both image and video coverage.
- Public detail hydration returns `null` for incomplete rows.
- Media API reports complete coverage counts.
- Changed tests and checklist-relevant validations pass.
