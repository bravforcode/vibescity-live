# Bugfix Requirements Document

## Introduction

This bugfix addresses multiple mobile UI and media loading issues in the VibeCity application that negatively impact user experience on mobile devices. The issues include:

1. **Modal Display Issue**: VibeModal shows white background borders on mobile instead of filling the entire viewport
2. **Card Height Issue**: ShopCard components have excessive min-height values (300px/340px) making them too tall for optimal mobile browsing
3. **Real Media API CORS Errors**: Calls to `/api/v1/media/{venueId}/real` endpoint are blocked by CORS policy, preventing real venue media from loading
4. **Mapbox Direction CORS Errors**: Multiple "Mapbox Error: N" and route fetch failures due to CORS restrictions

These bugs prevent users from viewing venue details properly on mobile devices and block the transition from AI-generated placeholder media to real venue photos and videos.

## Bug Analysis

### Current Behavior (Defect)

#### 1.1 Modal Display
1.1 WHEN VibeModal is opened on a mobile device THEN the system displays white background borders around the modal instead of filling the viewport edge-to-edge

#### 1.2 Card Height
1.2 WHEN ShopCard components are rendered on mobile devices THEN the system applies min-height of 300px (mobile) or 340px (desktop) making cards excessively tall and reducing content density

#### 1.3 Real Media API
1.3 WHEN the application calls `getRealVenueMedia(venueId)` to fetch real venue media THEN the system encounters CORS error "Access to fetch at 'https://vibecity-api.fly.dev/api/v1/media/{venueId}/real' from origin 'http://172.27.16.1:5173' has been blocked by CORS policy"

1.4 WHEN real media API fails due to CORS THEN the system falls back to AI-generated or placeholder media instead of displaying actual venue photos/videos

#### 1.4 Mapbox Directions
1.5 WHEN the application attempts to fetch route directions from Mapbox THEN the system encounters "Mapbox Error: N" and "Route fetch failed TypeError: Failed to fetch" errors due to CORS restrictions

1.6 WHEN Mapbox direction errors occur THEN the system logs multiple console errors and fails to display navigation routes to users

### Expected Behavior (Correct)

#### 2.1 Modal Display
2.1 WHEN VibeModal is opened on a mobile device THEN the system SHALL display the modal filling the entire viewport width without white borders, using appropriate mobile-first styling

#### 2.2 Card Height
2.2 WHEN ShopCard components are rendered on mobile devices THEN the system SHALL apply reduced min-height values (approximately 250px for mobile, 280px for desktop) to improve content density and scrolling experience

#### 2.3 Real Media API
2.3 WHEN the application calls `getRealVenueMedia(venueId)` to fetch real venue media THEN the system SHALL successfully retrieve media data without CORS errors

2.4 WHEN real media is successfully fetched THEN the system SHALL display actual venue photos and videos instead of AI-generated placeholders

2.5 WHEN real media API returns valid data THEN the system SHALL update the venue's media display with real images and videos from the `realMediaData` state

#### 2.4 Mapbox Directions
2.6 WHEN the application attempts to fetch route directions from Mapbox THEN the system SHALL successfully retrieve route data without CORS errors

2.7 WHEN Mapbox directions are successfully fetched THEN the system SHALL display navigation routes to users without console errors

### Unchanged Behavior (Regression Prevention)

#### 3.1 Modal Functionality
3.1 WHEN VibeModal is opened on desktop devices THEN the system SHALL CONTINUE TO display the modal with existing desktop styling (max-width, rounded corners, centered positioning)

3.2 WHEN users interact with modal gestures (drag-to-dismiss, scroll) THEN the system SHALL CONTINUE TO respond with existing touch handlers and animations

#### 3.2 Card Functionality
3.3 WHEN ShopCard components are rendered THEN the system SHALL CONTINUE TO display all existing content (badges, images, action buttons, stats)

3.4 WHEN users interact with ShopCard actions (favorite, share, navigate, details) THEN the system SHALL CONTINUE TO trigger existing event handlers correctly

#### 3.3 Media Loading
3.5 WHEN real media API is unavailable or returns no data THEN the system SHALL CONTINUE TO fall back gracefully to existing placeholder images

3.6 WHEN media is loading THEN the system SHALL CONTINUE TO display loading states and blur-up progressive image loading

#### 3.4 API Client
3.7 WHEN other API endpoints are called through `apiFetch` THEN the system SHALL CONTINUE TO function with existing headers, timeout, and error handling

3.8 WHEN API requests include visitor identity headers THEN the system SHALL CONTINUE TO attach X-Visitor-Id and X-Visitor-Token headers correctly

#### 3.5 Mapbox Integration
3.9 WHEN Mapbox map is displayed and interacted with THEN the system SHALL CONTINUE TO render map tiles, markers, and user location correctly

3.10 WHEN users click on venue markers or navigation buttons THEN the system SHALL CONTINUE TO trigger existing map interactions and flyTo animations
