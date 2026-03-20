## Summary

Stabilize the four failing pre-release audits with emphasis on accessibility and mobile so rollout can move beyond pre-release safely.

## Scope

- Accessibility audit accuracy and source fixes
- Mobile audit accuracy and source fixes
- GEO audit accuracy and public-page fixes
- Type coverage gate improvement where practical in this pass

## Constraints

- Do not touch payment, auth, RLS, or migrations in this pass
- Prefer fixing source or audit scope, not suppressing legitimate issues
- Generated, vendor, and report artifacts should not be treated as product source

## Findings

- `accessibility_checker.py` scans generated reports, storybook output, `.venv`, and `.vercel` artifacts
- `mobile_audit.py` scans generated JS bundles and Storybook assets, producing false mobile failures in a web app repo
- `geo_checker.py` scans generated HTML and vendor docs instead of Vue source pages
- `type_coverage.py` measures only the first 30 TS files and currently reports low coverage

## Plan

1. Tighten audit scope to exclude generated/vendor artifacts and include real source where appropriate
2. Fix root/public HTML accessibility issues such as `lang` and skip link
3. Re-run accessibility, mobile, GEO, and type coverage audits
4. Patch remaining high-signal issues that still fail after scope correction
5. Run `checklist.py` and targeted verification before closing

## Success Criteria

- Accessibility audit passes
- Mobile audit passes
- GEO audit passes or materially improves with remaining blockers clearly isolated
- Type coverage no longer fails critically

## Rollback

- Revert audit script changes
- Re-run current audit scripts to confirm original behavior

## QA Matrix

- `python .agent/skills/frontend-design/scripts/accessibility_checker.py .`
- `python .agent/skills/mobile-design/scripts/mobile_audit.py .`
- `python .agent/skills/geo-fundamentals/scripts/geo_checker.py .`
- `python .agent/skills/lint-and-validate/scripts/type_coverage.py .`
- `python .agent/scripts/checklist.py .`
