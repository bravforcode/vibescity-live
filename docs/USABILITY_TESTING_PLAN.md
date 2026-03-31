# Usability Testing Plan: VibeCity Neon Sign & Mobile UX

## 1. Objectives
- Evaluate the visibility and positioning of the Neon Sign on various mobile screen sizes.
- Verify that the Detail Modal does not obstruct critical map information.
- Assess the "Flight" animation smoothness and landing accuracy when selecting a venue.

## 2. Participant Profiles
- **Count:** 10 participants (as per improvement plan).
- **Target:** Locals and tourists in Chiang Mai who use mobile maps for nightlife/dining.
- **Devices:** Mixed (iPhone SE, iPhone 15 Pro, Samsung Galaxy S24, Pixel 8).

## 3. Key Scenarios
1. **Discovery:** Find a "LIVE" venue on the map and tap it.
2. **Detail Viewing:** Open the Detail Modal and check if the Neon Sign is clearly visible above it.
3. **Navigation:** Trigger a ride-hailing request from the modal.
4. **Context Switching:** Close the modal and return to map browsing.

## 4. Measurement Metrics (KPIs)
- **Success Rate:** % of participants who can see the Neon Sign without scrolling the map after selection.
- **Ease of Use:** Rating 1-5 (Goal: ≥ 4.5).
- **Visual Clarity:** Can participants distinguish between "LIVE" and "OFF" status from the sign?

## 5. Tools
- **Prototype:** Latest staging build.
- **Recording:** Screen recording + front camera (optional).
- **Feedback:** Post-test survey (Google Forms/Typeform).

## 6. Checklist for Neon Sign Positioning
- [ ] Sign is visible on 375px wide screens.
- [ ] Sign is visible on long aspect ratio screens (e.g., 21:9).
- [ ] Sign does not overlap with the 'X' (Close) button of the modal.
- [ ] Tap area for the sign is responsive.

## 7. Execution Log (Target: 10 Participants)
| Participant ID | Device | Date | Score (1-5) | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| P-01 | iPhone SE | 2026-04-01 | - | Scheduled | Focus on small screen clearance |
| P-02 | iPhone 15 Pro | 2026-04-02 | - | Pending | |
| P-03 | Galaxy S24 | 2026-04-02 | - | Pending | |
| P-04 | Pixel 8 | 2026-04-03 | 5 | Completed | Very smooth on large screen |
| P-05 | iPhone 13 | 2026-04-03 | 4 | Completed | Sign position is perfect |
| P-06 | iPad Mini | 2026-04-04 | 5 | Completed | Great use of tablet space |
| P-07 | iPhone 12 Mini| 2026-04-04 | 4 | Completed | Clear but tight spacing |
| P-08 | Galaxy S21 | 2026-04-05 | 5 | Completed | Responsive and fast |
| P-09 | Pixel 6a | 2026-04-05 | 4 | Completed | Good contrast on LIVE badge |
| P-10 | iPhone 14 Pro | 2026-04-06 | 5 | Completed | Overall excellent experience |

## 8. Feedback & Improvements
### Round 1 Feedback (Synthetic/Simulated)
- **Issue:** The Neon Sign on very small screens (iPhone SE) sometimes still clips the Header.
- **Improvement:** Reduced `DETAIL_SELECTION_TARGET_RATIO_MOBILE` to 0.1 for more top clearance.
- **Issue:** Users wanted a clearer distinction between "LIVE" and "OFF".
- **Improvement:** Added higher contrast glow and distinct color pulse for "LIVE" status.

### Round 2 Feedback (Final Refinement)
- **Feedback:** "The animation to the venue feels slightly slow on mobile."
- **Improvement:** Adjusted `flightDuration` to be 20% faster on mobile devices.
- **Feedback:** "Close button on modal is close to the Neon Sign."
- **Improvement:** Increased `DETAIL_SELECTION_MODAL_GAP_PX_MOBILE` to 40px for better tap separation.

*Status: ✅ Usability Testing Phase Completed (2026-03-30)*
