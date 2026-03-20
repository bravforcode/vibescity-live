# Thailand Dataset Curation Phase 1

## Goal

Quarantine foreign venue rows from the production Thailand dataset before district-level injection work starts.

## Why This Exists

- Admin normalization improved Thai coverage, but the production `venues` table still contains a large foreign/noisy OSM cohort.
- Thailand completeness work is blocked until foreign rows stop polluting the live map and coverage audits.
- This phase must be reversible and must not hard-delete production data.

## Scope

- Build a repeatable script to classify rows by Thailand province polygons.
- Soft-delete rows that are confidently outside Thailand.
- Write a manifest that supports rollback.
- Re-run coverage audits after quarantine.

## Non-Goals

- No schema changes.
- No hard delete.
- No synthetic venue injection yet.
- No district or subdistrict backfill in this phase.

## Safe Rules For Phase 1

1. A row is a quarantine candidate only when it has coordinates and falls outside all Thailand province polygons.
2. Soft-delete only by setting `deleted_at` and `is_deleted` together.
3. Preserve rollback data in a JSON report with candidate IDs and prior statuses.
4. Keep app behavior unchanged by relying on the existing `deleted_at` / `is_deleted` filters already used by map and feed RPCs.

## Success Criteria

- A report mode shows exact candidate counts before any write.
- Apply mode quarantines only confident foreign rows.
- Restore mode can un-delete the same set from the saved manifest.
- Post-curation audit confirms the active dataset is cleaner and still covers Thailand correctly.

## Expected Follow-Up

- Build a district gap report against Thai admin coverage.
- Inject trusted Thailand POIs for districts that still have no live venues after quarantine.
