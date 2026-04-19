# Video textures on materials

**Status:** Implemented (2026-04).

## Behavior

- **Asset type:** `AssetRef.type` may be `video`. Blobs are typically `video/mp4` after import (transcoded in the browser).
- **Conversion:** [`src/utils/videoConverter.ts`](../src/utils/videoConverter.ts) loads `@ffmpeg/ffmpeg` lazily. **`@ffmpeg/core` + worker are bundled** via Vite (`?url` in [`ffmpegWasmAssetUrls.ts`](../src/utils/ffmpegWasmAssetUrls.ts)) and served from the **same origin** as the app (no jsDelivr fetch). Transcodes to **H.264 video-only** MP4 (`-an`: no AAC track — avoids ffmpeg **exit 1** on clips with no audio), max 1280×720 (aspect preserved), **`force_divisible_by=2`** on scale so width/height stay even (required for `libx264` + `yuv420p`; odd sizes like 1280×675 used to fail with “height not divisible by 2”). Keep `@ffmpeg/core` and `@ffmpeg/ffmpeg` versions aligned in `package.json`.
- **Inspector:** Material **Texture** picker lists **Images** and **Videos**, uploads images via [`uploadTexture`](../src/utils/assetUpload.ts), videos via conversion dialog then [`saveVideoMapBlob`](../src/utils/assetUpload.ts). Sky dome picker sets `allowVideo={false}` on [`TextureDialog`](../src/components/TextureDialog.tsx).
- **Three.js:** [`createAssetResolverFromGetter`](../src/loader/assetResolverImpl.ts) exposes `isVideoAsset` + `loadVideoTexture` (optional **`videoTextureMaxAnisotropy`** 1–16 from `world.world.videoTextureMaxAnisotropy`, default 16). [`loadWorld`](../src/loader/loadWorld.ts) accepts a **getter** `() => Map<string, Blob>` so [`SceneView`](../src/components/SceneView.tsx) keeps **one** resolver for the scene: meshes and `VideoTexture` `<video src>` stay on valid `blob:` URLs until effect teardown. [`materialFromRef`](../src/loader/createPrimitive.ts) uses `THREE.VideoTexture` (muted, loop, inline) for video maps. [`disposeMaterialOrArray`](../src/utils/videoTextureLifecycle.ts) pauses the underlying `<video>` before `dispose()`. **World panel:** `logarithmicDepthBuffer` and `videoTextureMaxAnisotropy` live under world settings (with frame stats).
- **Prefetch:** [`prefetchMaterialTextures`](../src/loader/prefetchMaterialTextures.ts) skips `video/*` blobs (no `createImageBitmap`).
- **Static hosting:** [`loadWorldFromStatic`](../src/loader/loadWorldFromStatic.ts) tries `.mp4`, `.webm`, `.mov` when resolving assets.

## Visual checks

1. Material → Add texture → upload a short `.mov` / `.webm`; confirm conversion modal, then video plays on a box in Builder and Play.
2. Asset panel → upload video; row shows video thumbnail; ZIP export includes the file under `assets/`.
3. Sky texture dialog → only images (no video section).

## Notes

- First conversion **loads** ffmpeg WASM (~32MB) from your deployment / dev server (bundled asset), not a third-party CDN. Deployed `dist/` grows accordingly; `gh-pages` uploads include the `.wasm` file.
- If `libx264` is unavailable in a given core build, transcoding may fail; errors surface in the conversion dialog.
- **Upload validation:** [`VideoManager.validateVideoFileContent`](../src/utils/videoManager.ts) runs before conversion (Texture dialog confirm + [`uploadVideo`](../src/utils/assetUpload.ts)). It rejects **HTML stubs** (e.g. download redirect pages saved as `.mp4`) and **non-MP4 magic** for `.mp4` / `video/mp4` files so users see a clear error instead of Firefox `NS_ERROR_DOM_MEDIA_METADATA_ERR` only.
- **Load diagnostics:** [`videoConverter.ts`](../src/utils/videoConverter.ts) logs load milestones, wraps failures with the step name, applies a **300s** timeout for WASM init/compile (slow devices), and **clears the cached load promise** on failure so the next attempt can retry.
- **Encode progress:** `@ffmpeg/core` (single-thread) often emits **no** `progress` events during `libx264` encode, so the dialog would sit at **0%** until done. The converter sets a **minimum progress** after the input file is written (~8%), maps any wasm-reported progress into the middle band, then sets **100%** when the output file is read. Console: `ffmpeg.exec starting…` / `finished`.
- **UI:** [`VideoConversionDialog`](../src/components/VideoConversionDialog.tsx) shows **“Loading encoder…”** while WASM is loading/compiling (progress bar may stay at 0%); then **“Starting transcoding…”** until ffmpeg reports encode progress.
- **Tests:** [`src/test/scenarios/video-texture-pipeline.integration.test.ts`](../src/test/scenarios/video-texture-pipeline.integration.test.ts) covers validation, static load (mocked fetch), `loadVideoTexture` (stub `<video>`), `saveVideoMapBlob` + resolver, `loadWorld` with an assets getter, and a **revoke** regression (`dispose()` → `URL.revokeObjectURL`). [`videoConverter.test.ts`](../src/utils/videoConverter.test.ts) covers encode progress mapping. Optional **ffmpeg.wasm** end-to-end: `RUN_FFMPEG_TESTS=1 npm run test:run` (loads bundled WASM + transcodes fixture; long timeout). Fixtures (first match on disk): `public/world/assets/7947392-hd_1920_1080_30fps.mp4` or `public/world/assets/1181911-uhd_4096_2160_24fps.mp4`.

---

## Troubleshooting (Vite dev + Firefox, 2026-04)

### Symptom: conversion modal shows **0%** or **“Loading encoder…”** for a long time (no error)

**Typical cause:** The browser is **fetching and compiling** the bundled **~32MB** WASM (same origin as the app). Slow disks or low-memory devices can take several minutes. The UI stays at 0% until encode progress starts; check the **browser console** for `[videoConverter]` lines.

**If it eventually errors:** Read the message — it includes which step failed (`ffmpeg.load()`, etc.) or a **timeout** after 300s.

### Symptom: conversion modal stuck at **0%**; Network tab shows **404** on `worker.js`

**Cause:** `@ffmpeg/ffmpeg` constructs its internal Web Worker with `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`. Under **Vite**, the library is served from `node_modules/.vite/deps/…`; there is **no** sibling `worker.js` in that folder, so the browser requests e.g.  
`http://localhost:5173/…/node_modules/.vite/deps/worker.js?worker_file&type=module` → **404**, often with an **empty MIME type**, and the worker is **blocked**. FFmpeg never finishes `load()`, so progress never moves off 0%.

**Fix (implemented):** Pass **`classWorkerURL`** into `ffmpeg.load()` with a real script URL. **Current:** worker + core + wasm URLs come from [`ffmpegWasmAssetUrls.ts`](../src/utils/ffmpegWasmAssetUrls.ts) (Vite-bundled). **Historical:** jsDelivr + `toBlobURL` was used before bundling. When bumping `@ffmpeg/ffmpeg` / `@ffmpeg/core`, keep versions aligned and re-run `npm run build` to refresh `dist` assets.

**References:** [`classes.js` in the package](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/packages/ffmpeg/src/classes.ts) (Worker URL resolution); Firefox: worker blocked when response is not `application/javascript` / 404.

### Symptom: **`net::ERR_FILE_NOT_FOUND`** on a **`blob:http://…`** URL; video stops after reload or after playing a while (Chromium console)

**Cause:** The `blob:` URL was **`URL.revokeObjectURL`’d** while a `THREE.VideoTexture` (or `<video>`) still had that URL as `src`. The browser then cannot load more media from that address; playback may stop once buffering needs another read.

**Typical mistake (fixed in app):** Disposing the [`DisposableAssetResolver`](../src/loader/assetResolverImpl.ts) used during [`loadWorld`](../src/loader/loadWorld.ts) immediately after the scene is built revokes every cached object URL. **Correct:** use the **same** getter-backed resolver for the whole scene (see [`SceneView`](../src/components/SceneView.tsx) + `loadWorld(world, () => assetsRef.current)`), and only `dispose()` on scene teardown or cancelled loads.

**Secondary case:** Replacing or removing a blob for the same asset id revokes the old URL in [`assetResolverImpl`](../src/loader/assetResolverImpl.ts); materials must be rebuilt (e.g. `updateMaterial`) so `<video>` gets a fresh URL.

### Symptom: **`NS_ERROR_DOM_MEDIA_METADATA_ERR`** / “Cannot parse metadata” on a **blob:** URL; thumbnail shows **…** and size looks wrong (e.g. **1.2 KB** for a supposed MP4)

**Cause (typical):** The blob is **not** a valid MP4 bitstream. Common cases:

- The chosen file is an **HTML error page**, redirect stub, or empty download saved with a `.mp4` name (very small size is a strong hint).
- **Corrupt** or **zero-byte** file.

[`VideoThumbnail`](../src/components/VideoThumbnail.tsx) uses an `<video>` + `createObjectURL` to grab a poster frame; Firefox then fails metadata parse and logs this error. It is **separate** from ffmpeg until conversion runs—but the same invalid file would also make `ffmpeg` fail or produce no output.

**What to do:** Verify the file opens in a normal desktop player and check **file size** in the OS before upload. Prefer a known-good short `.mp4` for testing.

### Symptom: preview shows tiny size but file on disk is large

If the **picker** shows a wrong size, that would indicate a bug in how `File` is passed to the UI (worth re-checking). If the size matches a tiny file, treat as invalid input per above.
