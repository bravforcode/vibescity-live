# 2026-03-28 Localhost Snapshot Chunk Reduction

## Goal

Reduce the localhost-only venue snapshot payload that is currently bundled into a large async JS chunk while preserving the quiet-network localhost home/detail baseline on `5173` and `4174`.

## Baseline

- Current source snapshot: `scripts/prerender-data/venues-public-stale.json`
- Source size: ~3.0 MB raw, 5,000 rows
- Current build artifact: `dist/static/js/async/2671.5fb81966.js`
- Current build size: ~2240.6 kB raw / ~330.4 kB gzip

## Plan

1. Generate a slim same-origin localhost snapshot file from the stale source with only the fields needed by the current home/detail flow.
2. Move localhost snapshot loading from bundled dynamic import to static fetch so the large JSON is not emitted as a JS chunk.
3. Rebuild and verify:
   - reduced or eliminated large localhost snapshot JS chunk
   - `5173` and `4174` still show `0` console messages
   - home load and first `Details` open stay on same-origin network only

## Success Criteria

- No localhost-only multi-megabyte JS chunk for venue snapshot data
- Localhost home/detail still works in dev and preview
- No regression to Supabase/media/analytics noise on localhost
