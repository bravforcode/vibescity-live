# 2026-03-28 High-Priority Real Media Decision

## Post-Backfill Snapshot

- Captured on: `2026-03-28`
- Total shops in authoritative media index: `1000`
- Shops with authoritative media after curated backfill: `967`
- Shops still missing authoritative media: `33`
- Net effect:
  - `3` high-priority venues were restored with real images
  - `4` high-priority venues remain hidden

## Applied Now

| Name | Category | Shop ID | Authoritative inputs used |
| --- | --- | --- | --- |
| Dusita coffee & bakery | Cafe | `02363acb-cf7f-489c-a81e-cfc9badb5108` | official university page images, linked Facebook page |
| Cool Camping | leisure:resort | `01e3a560-6867-41a1-949f-30ebfd43fc0e` | owned website images, owned Facebook page |
| ชมดาวรีสอร์ท | tourism:chalet | `014e5b26-29ea-4b81-ae62-7df61cbba732` | TATSTAR authority images, linked Facebook page |

## Still Hidden

| Name | Category | Shop ID | Reason |
| --- | --- | --- | --- |
| ผาแดงสปอร์ตคลับ | Fitness | `0252d260-e7bb-4072-8653-7448f221fe02` | no verifiable owned web/social source found |
| Cobra Stone Viewpoint | Landmark | `011690e8-62c4-47ec-9271-91ec64f7a1d5` | place identity is ambiguous and no owned source was confirmed |
| Abacus | Restaurant | `00853ca7-7d14-49e1-8466-c5b15780977a` | venue identity is ambiguous and coordinates do not match the expected Thailand footprint |
| Krua Than Khun | Restaurant | `00ec1a4f-dbc4-4eb4-a7ce-444ffe5879a6` | source data only had phone metadata; no owned web/social source was confirmed |

## Policy Decision

1. Keep `school`, `fuel`, and `hospital` tails hidden for now.
2. Only re-open hidden venues when they have:
   - at least one authoritative real image
   - a verifiable owned website/social profile or authority-backed listing
3. Do not manufacture `video` coverage from generic social profile URLs.
4. If a venue only has real images and no verified direct video, leave `videos=0` and keep the venue public.
