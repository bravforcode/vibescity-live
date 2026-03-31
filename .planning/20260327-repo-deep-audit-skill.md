## Task

Create a production-usable skill that can audit an entire repository, enumerate every file, assign a score, explain the score, and recommend concrete fixes.

## Goals

1. Create a reusable skill folder with strong trigger metadata.
2. Support full-repo inventory so every file receives an audit disposition.
3. Provide a scoring rubric that adapts by file type and risk surface.
4. Add automation that produces manifests and heuristic signal reports to support a deep manual audit.
5. Package the skill as a `.skill` archive so it can be reused outside this repo.

## Assumptions

- The skill should be broadly reusable, not hardcoded to VibeCity-only paths.
- Binary and generated files should still appear in the manifest, but can be reviewed with metadata-only mode instead of deep source review.
- The actual narrative audit remains an LLM task; scripts should provide deterministic inventory, signals, and report scaffolding.
- Changes should remain additive and must not modify payment/auth/RLS/schema behavior.

## Planned Deliverables

- `.agents/skills/repo-deep-audit/`
- Skill references for scoring, playbooks, and reporting structure
- Scripts for manifest generation and heuristic repo scanning
- A packaged archive in a repo-local output directory
- Updated session memory

## Validation

1. Run the audit helper scripts against this repository.
2. Validate the skill with the repo's packaging validator.
3. Confirm the `.skill` archive is produced successfully.
