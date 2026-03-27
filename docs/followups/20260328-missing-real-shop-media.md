# 2026-03-28 Missing Real Shop Media

## Snapshot

- Source: authoritative shop media index generated from `venue_media_service.list_shop_media(include_missing=True)`
- Captured on: `2026-03-28`
- Total shops scanned: `1000`
- Shops with authoritative media: `965`
- Shops still missing authoritative media: `35`
- Public impact: these `35` shops are now excluded from the public venue store and detail hydration until real media is attached upstream
- Google fallback rows in index: `0`

## Breakdown

### By priority

- High: `7`
- Medium: `9`
- Low: `19`

### By category

- `school`: `19`
- `fuel`: `6`
- `hospital`: `3`
- `restaurant`: `2`
- `landmark`: `1`
- `tourism:chalet`: `1`
- `leisure:resort`: `1`
- `cafe`: `1`
- `fitness`: `1`

### By source

- `th-real-poi-coverage`: `30`
- `osm`: `5`

### By admin source

- `real-poi-replacement`: `19`
- `thai-geolocate-repair`: `14`
- `unknown`: `2`

## Recommended handling

1. High priority:
   Media should be attached first if these venues are expected to remain user-facing.
2. Medium priority:
   Decide whether these POIs should stay public; otherwise keep hidden until curated media exists.
3. Low priority:
   Mostly seed/coverage replacements for schools. Keep hidden unless there is an explicit product need to surface them.

## High-Priority Shortlist

| Name | Category | Province | District | Shop ID |
| --- | --- | --- | --- | --- |
| Dusita coffee & bakery | Cafe | Lampang | Mueang Lampang | `02363acb-cf7f-489c-a81e-cfc9badb5108` |
| ผาแดงสปอร์ตคลับ | Fitness | Chon Buri | Si Racha | `0252d260-e7bb-4072-8653-7448f221fe02` |
| Cobra Stone Viewpoint | Landmark | Thailand |  | `011690e8-62c4-47ec-9271-91ec64f7a1d5` |
| Abacus | Restaurant | Thailand |  | `00853ca7-7d14-49e1-8466-c5b15780977a` |
| Krua Than Khun | Restaurant | Phitsanulok | Nakhon Thai | `00ec1a4f-dbc4-4eb4-a7ce-444ffe5879a6` |
| Cool Camping | leisure:resort | Yala | Than To | `01e3a560-6867-41a1-949f-30ebfd43fc0e` |
| ชมดาวรีสอร์ท | tourism:chalet | Si Sa Ket | Huai Thap Than | `014e5b26-29ea-4b81-ae62-7df61cbba732` |

## Medium-Priority Shortlist

| Name | Category | Province | District | Shop ID |
| --- | --- | --- | --- | --- |
| Independent | fuel | Chachoengsao | Ban Pho | `00ab12cb-9f40-46a8-b617-5229698a9a72` |
| Independent Fuel Station | fuel | Nakhon Ratchasima | Sikhio | `00249614-208c-404a-9bac-ccfa62129d79` |
| PTT | fuel | Ubon Ratchathani | Khemarat | `004510e7-651f-4d20-8305-27b5e5b4b0f2` |
| Shell | fuel | Phra Nakhon Si Ayutthaya | Bang Pahan | `00dacc15-6879-4490-9916-1f599e4e6557` |
| บางจาก | fuel | Chai Nat | Noen Kham | `00bd6390-9850-4111-bbcc-3aaba85c860b` |
| เอสโซ่ | fuel | Nakhon Sawan | Tak Fa | `0199f31d-3aae-425b-b79b-c1f46137ba87` |
| Rattanaburi Hospital | hospital | Surin | Tha Tum | `00fd9103-c28d-4eb9-8e18-cba88dc3e05e` |
| โรงพยาบาลผาขาว | hospital | Loei | Pha Khao | `01c1be51-a0bc-4036-b4e7-30a113154d81` |
| โรงพยาบาลเนินสง่า | hospital | Chaiyaphum | Noen Sa-Nga | `0053a095-5b89-45c9-bdee-e7d3701a3445` |

## Full List

- Full CSV: [20260328-missing-real-shop-media.csv](/c:/vibecity.live/docs/followups/20260328-missing-real-shop-media.csv)
