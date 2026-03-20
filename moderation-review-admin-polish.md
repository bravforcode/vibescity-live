## Summary

Feature-focused polish pass for moderation UX, review lifecycle visibility, and admin bulk workflow.

## Scope

- Keep review lifecycle states consistent across API and Supabase fallback paths.
- Make review actions clearer in the UI without expanding into new moderation capabilities.
- Tighten admin bulk moderation UX with explicit in-flight state, selection messaging, and safer row action behavior.

## Success Criteria

- Hidden review statuses do not leak into frontend review lists from fallback paths.
- Review cards communicate ownership/pending state more clearly.
- Admin bulk moderation shows actionable selection state and disables conflicting actions while a batch is running.
- Unit tests and `checklist.py` pass after the pass.
