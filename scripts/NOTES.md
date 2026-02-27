# Phase 0 Recon Notes (No-Login Partner Gate)

## backend/app/main.py
- `/health` imports `AsyncSessionLocal` from `app.db.session`.
- CORS allowed headers did not include `X-Visitor-Token` or `X-Admin-Secret`.
- Router list had no visitor bootstrap or partner status router.

## backend/app/api/routers/payments.py
- `create-checkout-session` required `verify_user` (Supabase Auth at runtime).
- `manual-order` accepted `visitor_id` but did not verify signed visitor token.
- Slip replay guard already exists via `slip_image_hash` duplicate check and unique slip URL handling.
- No partner entitlement grant/update path after verified payment.
- No backend order-status endpoint for visitor-based polling.

## backend/app/db/session.py
- Provides lazy session getters only; did not export `AsyncSessionLocal` alias expected by health check import path.

## backend/app/core/config.py
- No visitor token signing secret config.
- No admin dashboard secret config.

## Frontend findings

### src/store/userStore.js
- Full Supabase Auth lifecycle (`getSession`, OAuth/password login, logout, auth state listener).

### src/services/partnerService.js
- Direct browser-to-Supabase queries/RPC (`supabase.auth.getUser`, table selects, RPC calls).

### src/services/paymentService.js
- Uses `supabase.auth.getSession` for headers in payment/order status flow.
- `manual-order` path only sent `visitor_id`, no signed visitor token header.

### src/router/index.js
- `/partner` and localized partner route had `requiresAuth` behavior and runtime auth guard.
- `/admin` guard depended on user auth role, not header-secret gate.

### src/views/PartnerDashboard.vue
- Required authenticated user and direct Supabase partner RPC/table flow.
- No no-login visitor bootstrap/token flow.
- No dedicated scan-to-pay gate UI for anonymous access.

### src/components/ui/SidebarDrawer.vue
- Partner Program entry is already visible in menu.

## Supabase migration findings (under supabase/migrations)
- Commerce contract defines `orders`, `subscriptions`, `partners` with `visitor_id` currently text-based in active TRIAD migration.
- TRIAD RLS policies still include auth.uid()-based access patterns for some sensitive tables.
- `analytics_logs` RLS lockdown migration exists (`20260220001000_analytics_logs_rls.sql`).
- Compatibility RPC includes `get_partner_dashboard_metrics()` tied to auth context (`auth.uid()`).
