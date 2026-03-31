## Task

Make nearby venues follow the user's real location reliably across feed and map:

- default experience should prioritize the nearest venues around the current user
- when geolocation resolves after the first venue fetch, refresh location-scoped venue data
- keep the map and feed on the same default venue slice
- preserve fallback behavior so the UI still shows venues when fewer than 30 exist inside 20 km

## Scope

- `src/store/shopStore.js`
- `src/composables/useAppLogic.js`
- `src/views/HomeView.vue`
- nearby-selection tests
- session memory update

## Success Criteria

- first real geolocation fix can replace fallback/mock-scoped feed data
- default nearby slice returns up to 30 venues, prioritizing <= 20 km and filling with nearest overflow when needed
- portrait/landscape/desktop map surfaces no longer diverge from the default nearby feed slice
- targeted lint/tests pass
