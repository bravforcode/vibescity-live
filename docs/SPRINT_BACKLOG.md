# VibeCity Sprint Backlog (Survey & Load Test Insights)

## 1. Backlog Items (Prioritized by Impact)

| ID | Title | Business Value | Effort | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VC-101** | **Optimize PostGIS Geodata Query (p95 < 200ms)** | 🔥 Critical (Perf) | 3 | P0 | `/geodata` response time < 200ms under 1k load. |
| **VC-102** | **Fix Neon Sign Overlap (Mobile SE)** | ⭐ High (UX) | 1 | P0 | Sign visible above Header on iPhone SE. |
| **VC-103** | **Distinct LIVE Status Contrast (UI)** | ⭐ High (UX) | 1 | P1 | LIVE status glow is 50% more distinct than OFF. |
| **VC-104** | **Implement Horizontal Scaling (Fly.io)** | 🔥 Critical (Scale) | 2 | P1 | System auto-scales when CPU > 60% within 1m. |
| **VC-105** | **Preload Hero Images (Lighthouse > 90)** | 📈 Medium (SEO) | 1 | P2 | LCP < 1.5s on mobile/desktop. |
| **VC-106** | **Search Results Relevance Tune** | 📈 Medium (UX) | 2 | P2 | Top 3 search results match category exactly. |

## 2. Sprint Strategy (Next 2 Weeks)
- **Phase 1 (Week 1):** Focus on **P0** items (PostGIS & Mobile UX).
- **Phase 2 (Week 2):** Implement Scaling and UI Contrast.

## 3. Post-launch Severity Matrix
- **Critical (P0):** Performance bottlenecks affecting 50% of users.
- **High (P1):** UX issues on specific mobile devices (iPhone SE/Mini).
- **Medium (P2):** Branding and Search refinement.
- **Low (P3):** Documentation and new feature requests.
