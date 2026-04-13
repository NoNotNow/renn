# Video textures on materials

**Status:** Implemented (2026-04). See also [feature-video-texture-plan.md](feature-video-texture-plan.md) for the original milestone breakdown.

## Behavior

- **Asset type:** `AssetRef.type` may be `video`. Blobs are typically `video/mp4` after import (transcoded in the browser).
- **Conversion:** [`src/utils/videoConverter.ts`](../src/utils/videoConverter.ts) loads `@ffmpeg/ffmpeg` lazily from jsDelivr (`@ffmpeg/core` 0.12.x), transcodes to H.264/AAC MP4 with max dimension 1280×720 (aspect preserved).
- **Inspector:** Material **Texture** picker lists **Images** and **Videos**, uploads images via [`uploadTexture`](../src/utils/assetUpload.ts), videos via conversion dialog then [`saveVideoMapBlob`](../src/utils/assetUpload.ts). Sky dome picker sets `allowVideo={false}` on [`TextureDialog`](../src/components/TextureDialog.tsx).
- **Three.js:** [`createAssetResolverFromGetter`](../src/loader/assetResolverImpl.ts) exposes `isVideoAsset` + `loadVideoTexture`. [`materialFromRef`](../src/loader/createPrimitive.ts) uses `THREE.VideoTexture` (muted, loop, inline) for video maps. [`disposeMaterialOrArray`](../src/utils/videoTextureLifecycle.ts) pauses the underlying `<video>` before `dispose()`.
- **Prefetch:** [`prefetchMaterialTextures`](../src/loader/prefetchMaterialTextures.ts) skips `video/*` blobs (no `createImageBitmap`).
- **Static hosting:** [`loadWorldFromStatic`](../src/loader/loadWorldFromStatic.ts) tries `.mp4`, `.webm`, `.mov` when resolving assets.

## Visual checks

1. Material → Add texture → upload a short `.mov` / `.webm`; confirm conversion modal, then video plays on a box in Builder and Play.
2. Asset panel → upload video; row shows video thumbnail; ZIP export includes the file under `assets/`.
3. Sky texture dialog → only images (no video section).

## Notes

- First conversion downloads ffmpeg WASM (~tens of MB); requires network unless CDN is cached.
- If `libx264` is unavailable in a given core build, transcoding may fail; errors surface in the conversion dialog.

---

## Troubleshooting (Vite dev + Firefox, 2026-04)

### Symptom: conversion modal stuck at **0%**; Network tab shows **404** on `worker.js`

**Cause:** `@ffmpeg/ffmpeg` constructs its internal Web Worker with `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`. Under **Vite**, the library is served from `node_modules/.vite/deps/…`; there is **no** sibling `worker.js` in that folder, so the browser requests e.g.  
`http://localhost:5173/…/node_modules/.vite/deps/worker.js?worker_file&type=module` → **404**, often with an **empty MIME type**, and the worker is **blocked**. FFmpeg never finishes `load()`, so progress never moves off 0%.

**Fix (implemented):** Pass **`classWorkerURL`** into `ffmpeg.load()` with a real script URL. We use jsDelivr + [`toBlobURL`](../src/utils/videoConverter.ts) for `@ffmpeg/ffmpeg/.../dist/esm/worker.js`, same pattern as `ffmpeg-core.js` / `.wasm`. When bumping `@ffmpeg/ffmpeg`, keep **`FFMPEG_PACKAGE_VERSION`** in [`videoConverter.ts`](../src/utils/videoConverter.ts) aligned with `package.json`.

**References:** [`classes.js` in the package](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/packages/ffmpeg/src/classes.ts) (Worker URL resolution); Firefox: worker blocked when response is not `application/javascript` / 404.

### Symptom: **`NS_ERROR_DOM_MEDIA_METADATA_ERR`** / “Cannot parse metadata” on a **blob:** URL; thumbnail shows **…** and size looks wrong (e.g. **1.2 KB** for a supposed MP4)

**Cause (typical):** The blob is **not** a valid MP4 bitstream. Common cases:

- The chosen file is an **HTML error page**, redirect stub, or empty download saved with a `.mp4` name (very small size is a strong hint).
- **Corrupt** or **zero-byte** file.

[`VideoThumbnail`](../src/components/VideoThumbnail.tsx) uses an `<video>` + `createObjectURL` to grab a poster frame; Firefox then fails metadata parse and logs this error. It is **separate** from ffmpeg until conversion runs—but the same invalid file would also make `ffmpeg` fail or produce no output.

**What to do:** Verify the file opens in a normal desktop player and check **file size** in the OS before upload. Prefer a known-good short `.mp4` for testing.

### Symptom: preview shows tiny size but file on disk is large

If the **picker** shows a wrong size, that would indicate a bug in how `File` is passed to the UI (worth re-checking). If the size matches a tiny file, treat as invalid input per above.
