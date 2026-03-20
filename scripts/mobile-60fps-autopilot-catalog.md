# Mobile 60FPS Autopilot Catalog

## Auto-Wiring Status (Current)
1. DONE: `usePerformanceOptimizer` is orchestrated in app bootstrap via `usePerformanceAutopilot`.
2. DONE: `usePerformanceMonitor` is mounted in production runtime flow via `usePerformanceAutopilot`.
3. DONE: `useServiceWorker` composable is wired in bootstrap with explicit script target and guardrails.
4. DONE: `usePinAtlas` is connected to neon-sign sprite generation path (generated sprite -> atlas load/build).
5. DONE: `useClusterVirtualization` is wired into active map feature budgeting path before source updates.
6. DONE: Automated mobile FPS benchmark is wired in CI (`map-fps-guardrail.yml`).
7. DONE: p95 FPS fail gate is enforced in CI (`check-map-fps-guardrail.mjs` + thresholds config).
8. DONE: Thermal throttling scenarios are wired in CI benchmark matrix (`thermal-moderate`, `thermal-high`).
9. DONE: Battery-low profiling scenario is wired in CI benchmark matrix (`battery-low`).
10. DONE: Network-shaping FPS matrix is hard-gated in CI (`network-4g`, `network-3g`, `network-2g`).

## Added Autopilot Control Catalog (112 controls)
Source: `useMobileFpsGovernor`

### Domain: camera
1. `camera-001` (auto strategy: `always`)
2. `camera-002` (auto strategy: `balanced`)
3. `camera-003` (auto strategy: `saver`)
4. `camera-004` (auto strategy: `critical`)
5. `camera-005` (auto strategy: `always`)
6. `camera-006` (auto strategy: `balanced`)
7. `camera-007` (auto strategy: `saver`)
8. `camera-008` (auto strategy: `critical`)
9. `camera-009` (auto strategy: `always`)
10. `camera-010` (auto strategy: `balanced`)
11. `camera-011` (auto strategy: `saver`)
12. `camera-012` (auto strategy: `critical`)

### Domain: render
13. `render-001` (auto strategy: `always`)
14. `render-002` (auto strategy: `balanced`)
15. `render-003` (auto strategy: `saver`)
16. `render-004` (auto strategy: `critical`)
17. `render-005` (auto strategy: `always`)
18. `render-006` (auto strategy: `balanced`)
19. `render-007` (auto strategy: `saver`)
20. `render-008` (auto strategy: `critical`)
21. `render-009` (auto strategy: `always`)
22. `render-010` (auto strategy: `balanced`)
23. `render-011` (auto strategy: `saver`)
24. `render-012` (auto strategy: `critical`)
25. `render-013` (auto strategy: `always`)
26. `render-014` (auto strategy: `balanced`)
27. `render-015` (auto strategy: `saver`)
28. `render-016` (auto strategy: `critical`)
29. `render-017` (auto strategy: `always`)
30. `render-018` (auto strategy: `balanced`)
31. `render-019` (auto strategy: `saver`)
32. `render-020` (auto strategy: `critical`)

### Domain: network
33. `network-001` (auto strategy: `always`)
34. `network-002` (auto strategy: `balanced`)
35. `network-003` (auto strategy: `saver`)
36. `network-004` (auto strategy: `critical`)
37. `network-005` (auto strategy: `always`)
38. `network-006` (auto strategy: `balanced`)
39. `network-007` (auto strategy: `saver`)
40. `network-008` (auto strategy: `critical`)
41. `network-009` (auto strategy: `always`)
42. `network-010` (auto strategy: `balanced`)
43. `network-011` (auto strategy: `saver`)
44. `network-012` (auto strategy: `critical`)
45. `network-013` (auto strategy: `always`)
46. `network-014` (auto strategy: `balanced`)
47. `network-015` (auto strategy: `saver`)
48. `network-016` (auto strategy: `critical`)
49. `network-017` (auto strategy: `always`)
50. `network-018` (auto strategy: `balanced`)
51. `network-019` (auto strategy: `saver`)
52. `network-020` (auto strategy: `critical`)

### Domain: memory
53. `memory-001` (auto strategy: `always`)
54. `memory-002` (auto strategy: `balanced`)
55. `memory-003` (auto strategy: `saver`)
56. `memory-004` (auto strategy: `critical`)
57. `memory-005` (auto strategy: `always`)
58. `memory-006` (auto strategy: `balanced`)
59. `memory-007` (auto strategy: `saver`)
60. `memory-008` (auto strategy: `critical`)
61. `memory-009` (auto strategy: `always`)
62. `memory-010` (auto strategy: `balanced`)
63. `memory-011` (auto strategy: `saver`)
64. `memory-012` (auto strategy: `critical`)
65. `memory-013` (auto strategy: `always`)
66. `memory-014` (auto strategy: `balanced`)
67. `memory-015` (auto strategy: `saver`)
68. `memory-016` (auto strategy: `critical`)

### Domain: animation
69. `animation-001` (auto strategy: `always`)
70. `animation-002` (auto strategy: `balanced`)
71. `animation-003` (auto strategy: `saver`)
72. `animation-004` (auto strategy: `critical`)
73. `animation-005` (auto strategy: `always`)
74. `animation-006` (auto strategy: `balanced`)
75. `animation-007` (auto strategy: `saver`)
76. `animation-008` (auto strategy: `critical`)
77. `animation-009` (auto strategy: `always`)
78. `animation-010` (auto strategy: `balanced`)
79. `animation-011` (auto strategy: `saver`)
80. `animation-012` (auto strategy: `critical`)
81. `animation-013` (auto strategy: `always`)
82. `animation-014` (auto strategy: `balanced`)
83. `animation-015` (auto strategy: `saver`)
84. `animation-016` (auto strategy: `critical`)

### Domain: data
85. `data-001` (auto strategy: `always`)
86. `data-002` (auto strategy: `balanced`)
87. `data-003` (auto strategy: `saver`)
88. `data-004` (auto strategy: `critical`)
89. `data-005` (auto strategy: `always`)
90. `data-006` (auto strategy: `balanced`)
91. `data-007` (auto strategy: `saver`)
92. `data-008` (auto strategy: `critical`)
93. `data-009` (auto strategy: `always`)
94. `data-010` (auto strategy: `balanced`)
95. `data-011` (auto strategy: `saver`)
96. `data-012` (auto strategy: `critical`)
97. `data-013` (auto strategy: `always`)
98. `data-014` (auto strategy: `balanced`)

### Domain: interaction
99. `interaction-001` (auto strategy: `always`)
100. `interaction-002` (auto strategy: `balanced`)
101. `interaction-003` (auto strategy: `saver`)
102. `interaction-004` (auto strategy: `critical`)
103. `interaction-005` (auto strategy: `always`)
104. `interaction-006` (auto strategy: `balanced`)
105. `interaction-007` (auto strategy: `saver`)
106. `interaction-008` (auto strategy: `critical`)
107. `interaction-009` (auto strategy: `always`)
108. `interaction-010` (auto strategy: `balanced`)
109. `interaction-011` (auto strategy: `saver`)
110. `interaction-012` (auto strategy: `critical`)
111. `interaction-013` (auto strategy: `always`)
112. `interaction-014` (auto strategy: `balanced`)

## Runtime Tiers
1. `ultra`
2. `balanced`
3. `saver`
4. `critical`

## Primary Auto-Tuned Knobs
1. `mapRefreshDebounceMs`
2. `mapRefreshMinIntervalMs`
3. `mapRefreshDataMinIntervalMs`
4. `mapRefreshForceMinIntervalMs`
5. `trafficRefreshIntervalMs`
6. `hotRoadBaseIntervalMs`
7. `hotRoadLowPowerIntervalMs`
8. `hotRoadMaxIntervalMs`
9. `hotRoadRequestTimeoutMs`
10. `hotRoadMinZoom`
11. `hotRoadsEnabled`
12. `routeDirectionsEnabled`
13. `maxVisibleFeatures`
14. `neonLod`
15. `mapResizeDebounceMs`
16. `frameBudgetMs`
17. `preferredUpdateIntervalMs`
18. `disableWeatherFx`
19. `disableMapFog`
20. `disableGlowLayers`
21. `disableDashAnimation`
22. `disableCoinAnimation`
23. `disableNonEssentialPrefetch`
24. `reducePopupMotion`
25. `maxConcurrentAsyncTasks`
26. `maxOverlayEffects`
27. `inputThrottleMs`
28. `pauseWhenHidden`
29. `longTaskTolerance`
30. `reportIntervalMs`
