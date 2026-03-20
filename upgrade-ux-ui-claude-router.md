# Upgrade UX UI Claude Router

## Summary

- Rewrite `ux-ui-agent-skills/CLAUDE.md` as a lean repo-aware router.
- Add `scripts/sync_claude_skills.ps1` to mirror `.agent/skills/*` into `.claude/skills/*` as junctions.
- Add a repo-aware usage note to `ux-ui-agent-skills/README.md`.

## Scope

- Keep root `CLAUDE.md` unchanged.
- Prefer VibeCity's Vue 3, Tailwind, Pinia, VueQuery, FastAPI, and Supabase stack in repo-aware mode.
- Preserve standalone portability when `.agent/` and `.claude/skills/` are absent.

## Validation

- Run `powershell -ExecutionPolicy Bypass -File scripts/sync_claude_skills.ps1` twice.
- Inspect `.claude/skills` junction targets.
- Run `python .agent/scripts/checklist.py .`.
