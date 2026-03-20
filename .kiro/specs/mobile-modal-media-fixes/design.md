# Mobile Modal Media Fixes Bugfix Design

## Overview

This bugfix addresses four distinct mobile UI and API integration issues in the VibeCity application:

1. **Modal White Borders**: VibeModal displays white background borders on mobile instead of edge-to-edge viewport filling
2. **Excessive Card Heights**: ShopCard components use min-height values (300px/340px) that are too tall for optimal mobile browsing
3. **Real Media API CORS**: Calls to `/api/v1/media/{venueId}/real` are blocked by CORS policy, preventing real venue media from loading
4. **Mapbox Directions CORS**: Route fetch requests to Mapbox API fail with CORS errors, blocking navigation features

The fix approach is minimal and surgical: adjust CSS for mobile modal/cards, and configure backend CORS headers to allow frontend origin access.

## Glossary

- **Bug_Condition (C)**: The condition that triggers each bug - mobile modal display, card rendering, API CORS blocks
- **Property (P)**: The desired behavior - edge-to-edge modals, optimal card heights, successful API calls
- **Preservation**: Existing desktop modal styling, card functionality, API fallback behavior that must remain unchanged
- **VibeModal**: The modal component in `src/components/modal/VibeModal.vue` that displays venue details
- **ShopCard**: The card component in `src/components/panel/ShopCard.vue` that displays venue previews
- **apiFetch**: The API client function in `src/services/apiClient.js` that handles all HTTP requests
- **getRealVenueMedia**: Function in `src/services/shopService.js` that fetches real venue media from backend
- **CORS (Cross-Origin Resource Sharing)**: Browser security mechanism that blocks requests from different origins without proper headers

## Bug Details

### Bug Condition

The bugs manifest in four distinct scenarios:

**1. Modal Display Bug**

The VibeModal component shows white borders on mobile devices when it should fill the entire viewport edge-to-edge.

**Formal Specification:**
```
FUNCTION isBugCondition_Modal(input)
  INPUT: input of type { deviceType: string, component: string }
  OUTPUT: boolean
  
  RETURN input.deviceType === 'mobile'
         AND input.component === 'VibeModal'
         AND modalHasRoundedCorners()
         AND NOT modalFillsViewportEdgeToEdge()
END FUNCTION
```

**2. Card Height Bug**

ShopCard components apply excessive min-height values (300px for mobile, 340px for desktop) making cards unnecessarily tall.

**Formal Specification:**
```
FUNCTION isBugCondition_CardHeight(input)
  INPUT: input of type { deviceType: string, component: string }
  OUTPUT: boolean
  
  RETURN input.component === 'ShopCard'
         AND (
           (input.deviceType === 'mobile' AND cardMinHeight === '300px')
           OR (input.deviceType === 'desktop' AND cardMinHeight === '340px')
         )
END FUNCTION
```

**3. Real Media API CORS Bug**

When the application calls `getRealVenueMedia(venueId)`, the browser blocks the request due to missing CORS headers.

**Formal Specification:**
```
FUNCTION isBugCondition_MediaCORS(input)
  INPUT: input of type { apiEndpoint: string, origin: string }
  OUTPUT: boolean
  
  RETURN input.apiEndpoint.matches('/api/v1/media/{venueId}/real')
         AND input.origin !== 'https://vibecity-api.fly.dev'
         AND NOT corsHeadersPresent(response)
END FUNCTION
```

**4. Mapbox Directions CORS Bug**

When the application attempts to fetch route directions through `/proxy/mapbox-directions`, CORS errors occur.

**Formal Specification:**
```
FUNCTION isBugCondition_MapboxCORS(input)
  INPUT: input of type { apiEndpoint: string, origin: string }
  OUTPUT: boolean
  
  RETURN input.apiEndpoint.matches('/proxy/mapbox-directions')
         AND input.origin !== 'https://vibecity-api.fly.dev'
         AND NOT corsHeadersPresent(response)
END FUNCTION
```

### Examples

**Modal Display:**
- User opens VibeModal on iPhone 13 → sees white borders on left/right edges
- User opens VibeModal on Android tablet → modal has rounded corners creating gaps
- User opens VibeModal on desktop → modal correctly displays with max-width (expected)

**Card Height:**
- User scrolls feed on mobile → cards are 300px tall, requiring excessive scrolling
- After fix → mobile cards are 250px, desktop cards are 280px

**Real Media API:**
- User opens venue detail → `getRealVenueMedia(123)` is called
- Browser console: "Access to fetch blocked by CORS policy"
- Modal displays AI-generated placeholder images instead of real photos

**Mapbox Directions:**
- User clicks navigation → `apiFetch('/proxy/mapbox-directions?...')` is called
- Browser console: "Mapbox Error: N" and "Route fetch failed"
- Navigation route is not displayed


## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

**Modal Functionality:**
- Desktop modal styling (max-width, rounded corners, centered positioning) must remain unchanged
- Modal gesture handlers (drag-to-dismiss, scroll) must continue to work identically
- Modal animations (enter/leave transitions) must remain unchanged
- Modal focus trap and accessibility features must continue to function

**Card Functionality:**
- All ShopCard content (badges, images, action buttons, stats) must display correctly
- Card interaction handlers (favorite, share, navigate, details) must continue to work
- Card hover effects and 3D tilt animations must remain functional
- Card video playback and image loading must continue to work

**API Client Behavior:**
- All other API endpoints using `apiFetch` must continue to function normally
- Visitor identity headers (X-Visitor-Id, X-Visitor-Token) must continue to be attached
- API timeout handling and error retry logic must remain unchanged

**Media Loading:**
- Fallback to placeholder images when real media API is unavailable must continue to work
- Progressive image loading with blur-up effect must remain functional
- Video playback with poster images must continue to work

**Mapbox Integration:**
- Map tile rendering and user location display must continue to work
- Venue marker display and clustering must remain functional
- Map interaction (pan, zoom, flyTo) must continue to work

**Scope:**
All inputs and interactions that do NOT involve the four specific bug conditions should be completely unaffected.


## Hypothesized Root Cause

Based on the bug description and codebase analysis, the most likely issues are:

### 1. Modal Display Root Cause

**CSS Responsive Design Gap**: The VibeModal component applies `md:rounded-[2rem]` and `rounded-t-[2rem]` classes. The `rounded-t-[2rem]` applies to all screen sizes, creating rounded top corners on mobile.

**Evidence from code:**
```vue
<!-- VibeModal.vue line ~220 -->
class="... md:rounded-[2rem] rounded-t-[2rem] ..."
```

The modal needs conditional styling to remove all border-radius on mobile for true edge-to-edge display.

### 2. Card Height Root Cause

**Excessive Min-Height Values**: The ShopCard component explicitly sets `min-h-[300px] md:min-h-[340px]`.

**Evidence from code:**
```vue
<!-- ShopCard.vue line ~70 -->
class="... min-h-[300px] md:min-h-[340px] ..."
```

These values should be reduced to `min-h-[250px] md:min-h-[280px]` to improve content density.

### 3. Real Media API CORS Root Cause

**Missing CORS Headers on Backend**: The backend API at `https://vibecity-api.fly.dev` does not include necessary CORS headers.

**Evidence from code:**
```javascript
// src/services/shopService.js
export const getRealVenueMedia = async (venueId) => {
  const response = await apiFetch(`/media/${venueId}/real`);
  // This call fails with CORS error
```

**Required Backend Changes:**
- Add `Access-Control-Allow-Origin` header
- Add `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- Add `Access-Control-Allow-Headers: Content-Type, X-Visitor-Id, X-Visitor-Token`
- Handle preflight OPTIONS requests

### 4. Mapbox Directions CORS Root Cause

**Backend Proxy Missing CORS Headers**: The `/proxy/mapbox-directions` endpoint lacks CORS headers.

**Evidence from code:**
```javascript
// src/composables/map/useMapNavigation.js
const res = await apiFetch(
  `/proxy/mapbox-directions?${params.toString()}`,
  { includeVisitor: false }
);
```

**Required Backend Changes:**
- Add CORS headers to proxy endpoint responses
- Ensure OPTIONS preflight requests are handled
- Verify Mapbox API key is correctly configured


## Correctness Properties

Property 1: Bug Condition - Modal Edge-to-Edge Display

_For any_ mobile device viewport where VibeModal is opened, the fixed modal SHALL fill the entire viewport width without white borders or rounded corners on the sides, creating a true edge-to-edge mobile experience.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Optimal Card Heights

_For any_ ShopCard component rendered on mobile or desktop, the fixed card SHALL use reduced min-height values (250px for mobile, 280px for desktop) to improve content density and scrolling experience while maintaining adequate space for all card content.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Real Media API Success

_For any_ call to `getRealVenueMedia(venueId)` from the frontend, the fixed backend SHALL return a successful response with proper CORS headers, allowing the frontend to retrieve and display real venue photos and videos without browser blocking.

**Validates: Requirements 2.3, 2.4, 2.5**

Property 4: Bug Condition - Mapbox Directions Success

_For any_ call to the `/proxy/mapbox-directions` endpoint from the frontend, the fixed backend SHALL return a successful response with proper CORS headers, allowing the frontend to retrieve and display navigation routes without browser blocking.

**Validates: Requirements 2.6, 2.7**

Property 5: Preservation - Desktop Modal Styling

_For any_ desktop device viewport where VibeModal is opened, the fixed modal SHALL continue to display with existing desktop styling (max-width, rounded corners, centered positioning) exactly as before the fix.

**Validates: Requirements 3.1**

Property 6: Preservation - Modal Gesture Handlers

_For any_ user interaction with modal gestures (drag-to-dismiss, scroll), the fixed modal SHALL respond with existing touch handlers and animations exactly as before the fix.

**Validates: Requirements 3.2**

Property 7: Preservation - Card Content and Interactions

_For any_ ShopCard component rendered, the fixed card SHALL display all existing content (badges, images, action buttons, stats) and respond to all interaction handlers (favorite, share, navigate, details) exactly as before the fix.

**Validates: Requirements 3.3, 3.4**

Property 8: Preservation - Media Loading Fallbacks

_For any_ scenario where real media API is unavailable or returns no data, the fixed system SHALL continue to fall back gracefully to existing placeholder images and display loading states exactly as before the fix.

**Validates: Requirements 3.5, 3.6**

Property 9: Preservation - API Client Behavior

_For any_ API endpoint called through `apiFetch` other than the two fixed endpoints, the fixed system SHALL continue to function with existing headers, timeout, and error handling exactly as before the fix.

**Validates: Requirements 3.7, 3.8**

Property 10: Preservation - Mapbox Map Features

_For any_ Mapbox map interaction (tile rendering, markers, user location, pan, zoom, flyTo), the fixed system SHALL continue to function exactly as before the fix.

**Validates: Requirements 3.9, 3.10**


## Fix Implementation

### Changes Required

This fix requires changes in both frontend and backend codebases.

#### Frontend Changes

**File**: `src/components/modal/VibeModal.vue`

**Function**: Modal container styling

**Specific Changes**:
1. **Remove Mobile Border Radius**: Change the modal container class from:
   ```vue
   class="... md:rounded-[2rem] rounded-t-[2rem] ..."
   ```
   to:
   ```vue
   class="... md:rounded-[2rem] rounded-none ..."
   ```
   This ensures the modal has no border-radius on mobile (edge-to-edge) but maintains rounded corners on desktop.

2. **Verify Mobile Full Width**: Ensure the modal container maintains `w-full` class on mobile and `md:max-w-5xl` on desktop (already present).

**File**: `src/components/panel/ShopCard.vue`

**Function**: Card container styling

**Specific Changes**:
1. **Reduce Min-Height Values**: Change the card container class from:
   ```vue
   class="... min-h-[300px] md:min-h-[340px] ..."
   ```
   to:
   ```vue
   class="... min-h-[250px] md:min-h-[280px] ..."
   ```
   This reduces card height by 50px on mobile and 60px on desktop.

#### Backend Changes

**File**: Backend API server configuration (likely FastAPI middleware or route handlers)

**Endpoint**: `/api/v1/media/{venueId}/real`

**Specific Changes**:
1. **Add CORS Middleware**: Configure CORS middleware to allow requests from frontend origins:
   ```python
   from fastapi.middleware.cors import CORSMiddleware
   
   app.add_middleware(
       CORSMiddleware,
       allow_origins=[
           "https://vibecity.live",
           "http://localhost:5173",
           "http://172.27.16.1:5173"
       ],
       allow_credentials=True,
       allow_methods=["GET", "POST", "OPTIONS"],
       allow_headers=[
           "Content-Type",
           "X-Visitor-Id",
           "X-Visitor-Token",
           "X-Admin-Secret"
       ],
   )
   ```

2. **Handle Preflight Requests**: Ensure OPTIONS requests return 200 with CORS headers:
   ```python
   @app.options("/api/v1/media/{venue_id}/real")
   async def media_options(venue_id: str):
       return Response(status_code=200)
   ```

**Endpoint**: `/api/v1/proxy/mapbox-directions`

**Specific Changes**:
1. **Add CORS Headers to Proxy**: Ensure the proxy endpoint includes CORS headers:
   ```python
   @app.get("/api/v1/proxy/mapbox-directions")
   async def mapbox_directions_proxy(request: Request):
       # ... existing proxy logic ...
       response = await forward_to_mapbox(request)
       response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
       response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
       response.headers["Access-Control-Allow-Headers"] = "Content-Type"
       return response
   ```

2. **Handle Preflight for Proxy**: Add OPTIONS handler:
   ```python
   @app.options("/api/v1/proxy/mapbox-directions")
   async def mapbox_directions_options():
       return Response(status_code=200)
   ```


## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that simulate the bug conditions and assert the expected failures. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:

1. **Modal Border Test**: Open VibeModal on mobile viewport (375px width) and measure computed border-radius and width (will show rounded corners on unfixed code)

2. **Card Height Test**: Render ShopCard on mobile viewport and measure computed min-height (will show 300px on unfixed code)

3. **Real Media API CORS Test**: Call `getRealVenueMedia(123)` from frontend and observe network tab (will show CORS error on unfixed code)

4. **Mapbox Directions CORS Test**: Call mapbox directions proxy and observe network tab (will show CORS error on unfixed code)

**Expected Counterexamples**:
- Modal has `border-radius: 2rem` on mobile instead of `border-radius: 0`
- Card has `min-height: 300px` on mobile instead of `min-height: 250px`
- Real media API returns CORS error: "Access-Control-Allow-Origin header missing"
- Mapbox proxy returns CORS error: "Access-Control-Allow-Origin header missing"

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition_Modal(input) DO
  result := renderModal_fixed(input)
  ASSERT result.borderRadius === 0
  ASSERT result.width === viewportWidth
END FOR

FOR ALL input WHERE isBugCondition_CardHeight(input) DO
  result := renderCard_fixed(input)
  ASSERT result.minHeight === (input.deviceType === 'mobile' ? 250 : 280)
END FOR

FOR ALL input WHERE isBugCondition_MediaCORS(input) DO
  result := getRealVenueMedia_fixed(input.venueId)
  ASSERT result.status === 200
  ASSERT result.headers['Access-Control-Allow-Origin'] !== undefined
END FOR

FOR ALL input WHERE isBugCondition_MapboxCORS(input) DO
  result := fetchMapboxDirections_fixed(input.params)
  ASSERT result.status === 200
  ASSERT result.headers['Access-Control-Allow-Origin'] !== undefined
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition_Modal(input) DO
  ASSERT renderModal_original(input) = renderModal_fixed(input)
END FOR

FOR ALL input WHERE NOT isBugCondition_CardHeight(input) DO
  ASSERT renderCard_original(input) = renderCard_fixed(input)
END FOR

FOR ALL apiEndpoint WHERE apiEndpoint NOT IN ['/media/{id}/real', '/proxy/mapbox-directions'] DO
  ASSERT apiFetch_original(apiEndpoint) = apiFetch_fixed(apiEndpoint)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for desktop modal, card interactions, and other API calls, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Desktop Modal Preservation**: Observe that desktop modal (viewport >= 768px) displays with rounded corners and max-width on unfixed code, then verify this continues after fix

2. **Modal Gesture Preservation**: Observe that drag-to-dismiss and scroll gestures work on unfixed code, then verify this continues after fix

3. **Card Content Preservation**: Observe that all card content displays correctly on unfixed code, then verify this continues after fix

4. **Card Interaction Preservation**: Observe that favorite, share, navigate, and details buttons work on unfixed code, then verify this continues after fix

5. **API Client Preservation**: Observe that other API endpoints work on unfixed code, then verify this continues after fix

6. **Media Fallback Preservation**: Observe that placeholder images display when real media API fails on unfixed code, then verify this continues after fix

7. **Mapbox Features Preservation**: Observe that map tiles, markers, and interactions work on unfixed code, then verify this continues after fix

### Unit Tests

**Frontend Tests:**
- Test modal renders with correct border-radius on mobile (0) and desktop (2rem)
- Test modal fills viewport width on mobile (100%) and has max-width on desktop (5xl)
- Test card renders with correct min-height on mobile (250px) and desktop (280px)
- Test card maintains aspect ratio and content layout after height change
- Test API client attaches correct headers for media and mapbox endpoints
- Test media loading falls back to placeholder when API fails
- Test mapbox directions error handling when API fails

**Backend Tests:**
- Test CORS headers are present in media API responses
- Test CORS headers are present in mapbox proxy responses
- Test OPTIONS preflight requests return 200 with CORS headers
- Test media API returns correct data format
- Test mapbox proxy correctly forwards requests to Mapbox API

### Property-Based Tests

**Frontend Properties:**
- Generate random viewport widths and verify modal always fills width on mobile (<768px)
- Generate random viewport widths and verify modal has max-width on desktop (>=768px)
- Generate random card configurations and verify min-height is always 250px (mobile) or 280px (desktop)
- Generate random API endpoints and verify non-buggy endpoints continue to work
- Generate random venue IDs and verify media API calls succeed with CORS headers

**Backend Properties:**
- Generate random origins and verify CORS headers allow all whitelisted origins
- Generate random venue IDs and verify media API returns valid data or 404
- Generate random mapbox query parameters and verify proxy forwards correctly

### Integration Tests

**End-to-End Tests:**
- Test full flow: Open app on mobile → open venue modal → verify edge-to-edge display
- Test full flow: Scroll feed on mobile → verify cards are 250px tall → verify all content visible
- Test full flow: Open venue modal → verify real media loads → verify images display
- Test full flow: Click navigation button → verify route displays on map → verify directions work
- Test full flow: Switch between mobile and desktop viewports → verify responsive behavior
- Test full flow: Test on multiple browsers (Chrome, Safari, Firefox) → verify CORS works everywhere
- Test full flow: Test with slow network → verify loading states and fallbacks work
