# Neon Signs Debugging Guide

## What Was Done

I've implemented a comprehensive 3-pronged debugging approach for the neon sign system:

### 1. ✅ Debug Logging Added

Added extensive console logging throughout the neon sign pipeline:

**Files Modified:**
- `src/composables/map/useMapLayers.js` - Added logging to `addNeonSignLayers()`
- `src/composables/map/useNeonSignSpriteCache.js` - Added logging to `ensureSprite()`
- `src/components/map/MapboxContainer.vue` - Added logging to `toPinFeature()` and `applyFeatures()`

**What It Logs:**
- ✅ Neon property generation for each shop
- ✅ Feature count and neon_key presence
- ✅ Sprite generation results (count, deferred, failures)
- ✅ Sprite cache statistics
- ✅ Layer creation and visibility status
- ✅ Current zoom level
- ✅ Map style loaded status

### 2. ✅ Interactive Debug Helper Created

Created `src/utils/neonSignDebug.js` - A comprehensive diagnostic tool.

**How to Use:**
1. Open browser DevTools console
2. Run: `window.debugNeonSigns()`
3. Get a complete diagnostic report showing:
   - Map state (style loaded, zoom, center)
   - Source data (feature count, neon properties)
   - Layer status (exists, visibility, filters)
   - Sprite cache stats (hits, misses, memory)
   - Map images count
   - Actionable recommendations

**Auto-installed in development mode** - Available immediately when map loads.

### 3. ✅ Layer Visibility Fixes

Enhanced layer creation with explicit visibility settings:

**Changes:**
- Added `"visibility": "visible"` to all neon sign layer layouts
- Added post-creation visibility checks
- Added zoom level logging to diagnose zoom-based visibility issues

## How to Debug Neon Signs

### Step 1: Check Browser Console

After hard refresh (Ctrl+Shift+R), look for these log patterns:

```
[NeonDebug] Generated neon props for shop 123: { neon_key: "...", ... }
[NeonDebug] applyFeatures called with 50 features, 50 have neon_key
[NeonDebug] Calling addNeonSignLayers
[NeonSigns] Processing 50 features
[NeonSigns] Features with neon_key: 50/50
[NeonSigns] Full LOD: 50 sprites, 0 deferred
[NeonSigns] Creating layer: neon-sign-full
[NeonSigns] Layer created: neon-sign-full
[NeonSigns] Current zoom: 16.5
```

### Step 2: Run Debug Helper

In browser console:
```javascript
window.debugNeonSigns()
```

This will show you:
- ✅ If features have neon properties
- ✅ If sprites were generated
- ✅ If layers exist and are visible
- ✅ Current zoom level vs minimum required
- ✅ Specific recommendations for fixing issues

### Step 3: Check Common Issues

**Issue 1: No neon_key on features**
- **Symptom:** `Features with neon_key: 0/50`
- **Cause:** `toNeonFeatureProperties()` not being called or returning empty
- **Fix:** Check if shop object is being passed to `toPinFeature()`

**Issue 2: Sprites not generated**
- **Symptom:** `Full LOD: 0 sprites, 0 deferred` or high failure count
- **Cause:** Canvas rendering failing or map not accepting images
- **Fix:** Check `[NeonSprite]` error logs for specific failures

**Issue 3: Layers not visible**
- **Symptom:** Layers exist but nothing shows on map
- **Cause:** Zoom level too low, or sprite properties missing
- **Fix:** Zoom to 16+ and check if features have `neon_sprite_full` property

**Issue 4: Zoom level too low**
- **Symptom:** `Current zoom: 11.5` (below minimum 12)
- **Cause:** Map not zoomed in enough
- **Fix:** Zoom to at least zoom level 12 for mini signs, 16 for full signs

## Expected Console Output (Success)

When neon signs are working correctly, you should see:

```
[NeonDebug] Generated neon props for shop 1: { neon_key: "neon-2-stable:...", ... }
[NeonDebug] Generated neon props for shop 2: { neon_key: "neon-2-stable:...", ... }
...
[NeonDebug] applyFeatures called with 50 features, 50 have neon_key
[NeonDebug] Sample feature with neon: { id: "1", name: "Shop Name", neon_key: "...", ... }
[NeonDebug] Calling addNeonSignLayers
[NeonSigns] Processing 50 features
[NeonSigns] Features with neon_key: 50/50
[NeonSigns] Sample neon properties: { neon_key: "...", neon_palette: "plasma-pink", ... }
[NeonSigns] Full LOD: 50 sprites, 0 deferred
[NeonSprite] Added image to map: neon-sign-abc123 (full)
[NeonSprite] Added image to map: neon-sign-def456 (full)
...
[NeonSigns] Compact LOD: 50 sprites, 0 deferred
[NeonSigns] Mini LOD: 50 sprites, 0 deferred
[NeonSigns] Cache stats: { hits: 0, misses: 150, generated: 150, failed: 0, ... }
[NeonSigns] Creating layer: neon-sign-full
[NeonSigns] Layer created: neon-sign-full
[NeonSigns] Creating layer: neon-sign-compact
[NeonSigns] Layer created: neon-sign-compact
[NeonSigns] Creating layer: neon-sign-mini
[NeonSigns] Layer created: neon-sign-mini
[NeonSigns] Current zoom: 16.5
[NeonSigns] Layer visibility - Full: visible, Compact: visible, Mini: visible
```

## Next Steps

1. **Hard refresh the browser** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Open DevTools Console** (F12)
3. **Check for the log patterns above**
4. **Run `window.debugNeonSigns()`** for detailed diagnostics
5. **Report findings:**
   - Which step is failing?
   - What error messages appear?
   - What does `debugNeonSigns()` recommend?

## Files Modified

1. `src/composables/map/useMapLayers.js` - Debug logging + visibility fixes
2. `src/composables/map/useNeonSignSpriteCache.js` - Debug logging
3. `src/components/map/MapboxContainer.vue` - Debug logging + debug helper setup
4. `src/utils/neonSignDebug.js` - **NEW** - Interactive debug tool

## Technical Details

### Neon Sign Pipeline

1. **Property Generation** (`MapboxContainer.vue`)
   - `pinFeatureFromShop()` → `toPinFeature()` → `toNeonFeatureProperties()`
   - Generates: `neon_key`, `neon_palette`, `neon_shape`, `neon_line1`, `neon_line2`, etc.

2. **Feature Application** (`MapboxContainer.vue`)
   - `applyFeatures()` → `applySourceData()` → `addNeonSignLayers()`

3. **Sprite Generation** (`useMapLayers.js` → `useNeonSignSpriteCache.js`)
   - `addNeonSignLayers()` → `ensureSpritesForFeatures()` → `ensureSprite()` → `drawNeonSign()`
   - Creates canvas, renders neon sign, adds to map as image

4. **Layer Creation** (`useMapLayers.js`)
   - Creates 3 layers: `neon-sign-full` (zoom 16+), `neon-sign-compact` (14-16), `neon-sign-mini` (12-14)
   - Each layer references sprite properties: `neon_sprite_full`, `neon_sprite_compact`, `neon_sprite_mini`

### Zoom Levels

- **Mini signs:** Zoom 12-14 (small dots with icons)
- **Compact signs:** Zoom 14-16 (medium rectangles)
- **Full signs:** Zoom 16+ (large detailed signs with text)

### Performance

- Sprite cache: 50MB memory budget, 1000 max entries
- Concurrent rendering: 24 sprites per frame
- Deadline: 16ms per batch
- Deferred rendering: Uses `requestIdleCallback` for remaining sprites

---

**Status:** ✅ All debugging infrastructure in place
**Next:** User needs to test and report console output
