# 2026-03-28 Missing Complete Media Source Hunt

## Snapshot

- Source: live authoritative shop media index generated from `VenueMediaService().list_shop_media(include_missing=True)`
- Captured on: `2026-03-28`
- Total shops scanned: `1000`
- Shops with complete authoritative media: `964`
- Shops still missing complete media: `36`
- Public impact: all incomplete rows stay hidden behind the complete-media gate until both real image and real video are proven

## Priority Counts

- High: `8`
- Medium: `9`
- Low: `19`

## Research Buckets

- `video-proof-followup`: `3`
- `owned-social-deep-search`: `2`
- `identity-ambiguous`: `3`
- `institutional-official-page`: `22`
- `branch-fuel-low-yield`: `6`

## Production Decision

1. Keep all `36` rows hidden until complete proof exists.
2. Work the `video-proof-followup` bucket first because those venues already have verified images and only need direct video proof.
3. Treat `identity-ambiguous` and `branch-fuel-low-yield` as low-trust lanes; do not reopen them from generic same-name results or station directories.
4. For `institutional-official-page`, an official site alone is not enough anymore; reopening requires an official video source too.

## Highest-Yield Queue

- `Dusita coffee & bakery` (`02363acb-cf7f-489c-a81e-cfc9badb5108`): follow existing official profile trail and hunt for direct reel/video/watch URLs first.
- `ชมดาวรีสอร์ท` (`014e5b26-29ea-4b81-ae62-7df61cbba732`): follow existing official profile trail and hunt for direct reel/video/watch URLs first.
- `Cool Camping` (`01e3a560-6867-41a1-949f-30ebfd43fc0e`): follow existing official profile trail and hunt for direct reel/video/watch URLs first.

## Ambiguous Queue

- `Abacus` (`00853ca7-7d14-49e1-8466-c5b15780977a`): confirm identity and coordinates before any media ingestion.
- `Cobra Stone Viewpoint` (`011690e8-62c4-47ec-9271-91ec64f7a1d5`): confirm identity and coordinates before any media ingestion.
- `THE PEAK` (`01ad3f2e-344f-43a7-b74e-26369291312e`): confirm identity and coordinates before any media ingestion.

## Example Source Patterns Observed During Search

- Official hospital page exists for `โรงพยาบาลผาขาว`: https://sites.google.com/view/pkhospital
- Official school page exists for `โรงเรียนวัดหัวเด่น`: https://sites.google.com/view/huadenschool
- Ambiguous `THE PEAK` search results skew to unrelated Bangkok attraction coverage instead of a single owned venue identity:
  - https://www.timeout.com/bangkok/news/this-pop-up-eatery-at-the-st-regis-bangkok-brings-a-taste-of-three-michelin-starred-swiss-restaurant-to-bangkok-120919
  - https://pub-mediabox-storage.rxweb-prd.com/exhibitor/document/exh-944e6f99-2d4f-4459-ae3a-439c4913640a/1cef4fd4-47df-4bb9-b03e-9ac5971cfead.pdf
- Fuel branch searches skew to directory-style results, which are not enough for reopening:
  - https://greens-revolution.bangchakmarketplace.com/media/files/files/Promotion-M150-2.pdf

## Artifact

- Full queue JSON: [20260328-missing-complete-media-source-hunt.json](/c:/vibecity.live/docs/followups/20260328-missing-complete-media-source-hunt.json)
- Local working CSV export: [20260328-missing-complete-media-source-hunt.csv](/c:/vibecity.live/docs/followups/20260328-missing-complete-media-source-hunt.csv)
