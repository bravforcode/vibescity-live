# Postman Test Matrix (Generated)

## Auth (Bearer) Required
- GET /api/v1/admin/pending/shops
- GET /api/v1/analytics/dashboard/stats
- GET /api/v1/owner/stats/{shop_id}
- GET /api/v1/ugc/achievements
- GET /api/v1/ugc/my-stats
- GET /api/v1/ugc/my-submissions
- POST /api/v1/admin/shops/{shop_id}/approve
- POST /api/v1/admin/shops/{shop_id}/reject
- POST /api/v1/analytics/log
- POST /api/v1/owner/promote/{shop_id}
- POST /api/v1/payments/create-checkout-session
- POST /api/v1/redemption/claim/{coupon_id}
- POST /api/v1/ugc/check-in
- POST /api/v1/ugc/photos
- POST /api/v1/ugc/shops

## Header X-Visitor-Token Required
- GET /api/v1/owner/insights
- GET /api/v1/owner/portfolio
- GET /api/v1/owner/venues
- GET /api/v1/partner/dashboard
- GET /api/v1/partner/status
- POST /api/v1/partner/bank
- POST /api/v1/partner/profile

## Header X-Mapbox-Token Required
- GET /api/v1/proxy/mapbox-directions

## Quick Run
- Import `vibecity-api.collection.json` and `vibecity-local.environment.json` into Postman
- Fill token variables in environment
- Run folder `system` first, then other folders
