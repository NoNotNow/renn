# Performance work backlog

Working document derived from Firefox profiling on a heavy project (RefreshDriver / `requestAnimationFrame`, GC, CSS HUD, JIT notes) and from codebase review. **Items are ordered by typical impact (largest gains first).** Update statuses and notes as work completes.

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done

---

## 1. Measure and bound main-thread frame work (rAF)

**Evidence (updated 2026-04-08):** Firefox marker export confirms `requestAnimationFrame callbacks` routinely **22–67 ms** per tick (worst: **331 ms** `LongTask`, two more at 65–67 ms). Target for 60 fps is **< ~16.7 ms**. The 331 ms spike correlates directly with a `GCMajor` (424 ms total, see §2) triggering `DiscardJit` — all compiled JS is thrown away, followed by hundreds of `javascript.ion.compile_time` recompile entries.

| Status | Item | Notes |
|--------|------|--------|
| [~] | Capture **JS flame charts** (Firefox Profiler JS view or Chrome Performance) for the same bad scene: split time for **physics step**, **`executeTransformers`**, **`runOnUpdate` scripts**, **`renderer.render`**, React/Builder overhead | **How-to:** see [§1 procedure](#11-how-to-capture-js-flame-charts). Correlate with **View → Frame stats** (`frameTiming.ts`). Rank sub-costs inside the rAF callback after §2 physics alloc fix. |
| [x] | Optional: **in-app frame timing HUD** (fps + last-frame ms breakdown) for regressions without DevTools | **View → Frame stats** in Builder (`SceneView` `showFrameStats`); persists `builderShowFrameStats`. Sections: transformers, physics, script collisions, `onUpdate`, camera, game HUD, render. |

### 1.1 How to capture JS flame charts

Use the **same heavy project** as the Firefox marker export so results are comparable.

**Firefox Profiler**

1. Install [profiler.firefox.com](https://profiler.firefox.com) (or use built-in profiler).
2. Record while entering **Play** and reproducing the bad scene for **10–30 s**.
3. In the processed profile, open the **JS** / **call tree** view and filter or expand the stack around **`requestAnimationFrame`** / **`RefreshDriver`** (or search for app symbols: `runSceneFrame`, `PhysicsWorld.step`, `executeTransformers`, `ScriptRunner`, `WebGLRenderer.render`).
4. Note **self time** vs **total time** for: physics step, transformer pass, script `onUpdate`, `syncFromPhysics`, render.

**Chrome DevTools**

1. **Performance** panel → record → same play scenario → stop.
2. Enable **JavaScript samples** if available; inspect the **Main** thread flame chart.
3. Search for the same symbols or for **Animation frame fired** / **rAF** and expand children.

**What to record in this doc:** Approximate % of frame time in each bucket (physics / transformers / scripts / render / React) and the hottest 2–3 function names for follow-up (§4–§7).

**Automated tests:** `npm run test:run` covers runtime helpers; **Frame stats** is a manual sanity check on a heavy scene after physics changes.

---

## 2. Cut allocation churn and GC pauses  ← **highest-priority code change**

**Evidence (updated 2026-04-08):** Detailed marker trace shows:
- `GCMinor` fires every **10–16 ms**, costing **4–7 ms** each. Nursery is always exactly **15 MB** (`javascript.gc.nursery_bytes: 15728640`).
- Nursery promotion rate is **69–98 %** → objects are not short-lived; they survive and tenure to the old heap.
- `GCMajor` observed at **109 ms** and **424 ms** (`dom.gc_in_progress`). The 424 ms GCMajor fires `DiscardJit` immediately after, discarding all JIT-compiled code, then triggers a cascade of hundreds of `javascript.ion.compile_time` entries → the **331 ms `LongTask`** is this recompile cascade, not JS application code.
- **Identified hot allocation site** in `rapierPhysics.ts` (per physics step, per dynamic/kinematic body) — **addressed 2026-04-08**:
  - Previously: `storedPos` / `storedRot` — new plain objects every frame per body; `new Map()` for contact forces every step.
  - Now: **reuse** `CachedTransform` entries in `cachedTransforms` (mutate `position` / `rotation` in place); **`contactForceByPair.clear()`** then refill (single `Map`).

| Status | Item | Notes |
|--------|------|--------|
| [x] | **Fix: preallocate cached-transform objects** in `rapierPhysics.ts` — reuse `{ x, y, z }` / `{ x, y, z, w }` structs per body rather than creating new ones each step; reuse or clear a single `forceMap` | Implemented: per-entity `CachedTransform` reuse in `step()`; `contactForceByPair` map cleared each step. |
| [ ] | Profile remaining **allocation sites** (browser memory tool or `performance.measure` around hot loops) | After the physics fix, identify next largest allocators. Focus on: scripts/transformer per-frame arrays, `map`/`filter` in rAF. |
| [~] | Reduce remaining **per-frame object creation** (reuse `Vector3`/buffers; avoid `map`/`filter` allocating in rAF) | **2026-04-08:** `executeTransformers` reuses one scratch `TransformInput` + fixed Vec3 buffers; `rapierQuaternionToEulerInto`; follow-target pose via `_leadPoseRef` (no alloc when pose comes from physics cache). `InputTransformer` clears/fills `actions` in place (`clearActionRecord`). `RenderItem` pose: in-place `entity.position`/`rotation`; `setPositionXYZ` / `setRotationEuler` for script API (no temp arrays / no entity object spread). Remaining: `TransformerChain.execute` still allocates; `ScriptRunner`; `applyInputMapping` `{}`. |
| [ ] | Audit **React** updates during play: avoid unnecessary state updates that reconcile large trees every frame | Builder already throttles some camera writes; extend pattern where needed. |

---

## 3. HUD: replace expensive CSS `filter` animations

**Evidence:** `CSS animation iteration` on `rennHudPulseScore` / `rennHudPulseDamage` with `filter` correlated with heavy ticks. Animating `filter` is costly (repaint / compositor).

| Status | Item | Notes |
|--------|------|--------|
| [x] | Replace HUD pulse **filter**-based effects with **`opacity` / `transform`** or **sprite swap** | Done: `GameHud.tsx` uses opacity + scale keyframes; static `textShadow` retained. |
| [x] | Ensure pulses are **disabled or simplified** when HUD is hidden / minimal mode | No extra work: `GameHud` only mounts when `showGameHud` is true (`SceneView`). |

---

## 4. Rendering and GPU load (Three.js)

**Evidence (updated 2026-04-08):** Marker trace shows `PWebGL::Msg_DispatchCommands` taking **27–33 ms** per occurrence (multiple per frame), and `PWebGL::Msg_GetLinkResult` **14 ms** (sync IPC for WebGL shader link, causing `~917 ms Awake` stall) — shader compilation is happening mid-session. GPU work is a confirmed contributor on heavy scenes.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Use **Performance Booster** / **`countVisualModelTriangles`**-style data to find worst entities; simplify meshes (existing meshoptimizer path) | Already partially supported in product. |
| [ ] | **Shadow map**: lower resolution, tighten frustum, disable `castShadow` on small props | Cheap experiments. |
| [ ] | **Pixel ratio** cap: already `min(dpr, 2)`; consider **1.5** or quality setting on low-end | User-visible quality tradeoff. |
| [ ] | **Instancing** for many copies of the same mesh + material | Larger engineering item; big win when applicable. |
| [ ] | **LOD** or simplified far meshes | Medium/large item. |

---

## 5. Physics cost

**Evidence (updated 2026-04-08):** `rapierPhysics.ts:422` (`this.stepping = true` context, column 47 = inside the `cachedTransforms` loop) shows repeated `Bailout / Invalidate` at `GetAliasedVar` in the Rapier WASM interop layer (`@dimforge/rapier3d-compat.js`). This is a JIT deopt caused by mixed object shapes from the WASM bridge. Also see §2 for per-frame allocation in this same loop.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Replace complex **static trimesh** colliders with **primitives** or simpler hulls where possible | Reduces Rapier step time. |
| [ ] | Ensure **sleeping** works: avoid constant forces from scripts/transformers when idle | Stops perpetual wake-ups. |
| [ ] | Investigate **`rapierPhysics.ts` cachedTransforms loop** polymorphism: WASM objects returned by `body.translation()` / `body.rotation()` may have varying shapes across calls | Confirm with flame chart; if hot, destructure WASM return values into typed locals before storing. |

---

## 6. Scripts and transformers

**Impact:** Scales with entity count and per-hook work.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Reduce **`onUpdate`** work: early returns, timers, avoid **`findEntities` / raycasts** every frame | Profile-guided. |
| [ ] | Short **timer intervals** in scripts: only use aggressive intervals when necessary | |
| [~] | Long **transformer chains** / expensive types (**follow**, **wanderer**): fewer entities or cheaper configs | Transformer **runtime** alloc reduced: shared scratch input per entity per frame (`renderItemRegistry.ts`); follow lead pose reuse when target has physics cache. |

---

## 7. JIT bailouts: `renderItemRegistry.ts` and `renderItem.ts`

**Evidence (updated 2026-04-08):** Two confirmed deopt sites:
- `renderItemRegistry.ts:474` (`Invalidate`) — branch around plane/ring visual quaternion in `updateShape`. Still appearing in new trace.
- `renderItem.ts` (`Bailout at GetProp`) — was inside `setPosition` + `userData.entity` sync; **2026-04-08** removed per-call `userData.entity` reassignment on pose writes (in-place entity mutation; same object reference).

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Confirm **how often** `updateShape` (registry:474) and `setPosition` (renderItem:34) run in the bad play scenario | Bailouts only matter if these paths are hot per frame. |
| [x] | registry:474 — avoid **`delete` on `userData`** in hot path | `visualBaseQuaternion` cleared with `= undefined` instead of `delete` (~line 480). |
| [x] | renderItem — remove redundant **`userData.entity` reassignment** on pose updates | Physics→mesh sync uses `syncFromPhysics` (no `setPosition`). Pose APIs now mutate `entity` in place; `userData.entity` keeps the same reference. |

---

## 8. Builder ancillary timers

**Evidence:** `setInterval` for inspector pose poll at `Builder.tsx` (live poses effect) appeared in trace; self-time small but adds periodic wakeups.

| Status | Item | Notes |
|--------|------|--------|
| [x] | Merge periodic work with **rAF** or **increase interval** if UX allows | Inspector pose poll: interval **220ms** (was 100ms) in `Builder.tsx` to reduce periodic wakeups. |

---

## 9. Assets and textures  ← **new concrete evidence**

**Evidence (2026-04-08):** Marker trace shows `Image Paint blob:` entries with browser image-decode times of **51 ms**, **241 ms**, **34 ms**, **28 ms** (JPEG decode speed 18–84 MB/s → images 0.5–3 MB). These fire inside rAF via `PCompositorManager::Msg_AddSharedSurface` — the texture compositor is generating blob URLs that the browser then decodes mid-frame. A 241 ms image decode directly causes a full frame stall.

| Status | Item | Notes |
|--------|------|--------|
| [~] | **Avoid mid-play blob decodes**: texture compositor output (blob: URLs) should be fully decoded and uploaded to GPU (via `createImageBitmap` or canvas) **before** entering the play loop, not lazily during rAF | **Partial:** [`scheduleMaterialTextureDecodePrefetch`](src/loader/prefetchMaterialTextures.ts) runs after `SceneView` load (idle callbacks, `createImageBitmap` + `close()` per `material.map` id). Does not replace `TextureLoader` first use; reduces likelihood decode aligns with rAF. |
| [ ] | Downscale large **composite** / material maps; share **asset ids** across entities | Less VRAM, fewer unique textures. Smaller blobs → faster decode even if timing issue is not fixed. |
| [ ] | Fewer **layers** in texture documents where possible | Compositor cost on edit/bake. |

### 9.1 Code trace (implementation planning)

**Runtime material / model loading (most meshes):** [`src/loader/assetResolverImpl.ts`](src/loader/assetResolverImpl.ts) — `URL.createObjectURL(blob)` per asset id (cached in `urlCache`); `loadTexture` uses `THREE.TextureLoader` against that URL. **JPEG/PNG decode runs when the loader completes**, which can align with rAF if loading is triggered during play or after late asset updates.

**Skybox:** [`src/components/SceneView.tsx`](src/components/SceneView.tsx) — skybox `useEffect` creates a **new** blob URL per load and `TextureLoader.loadAsync`; decode is async but still main-thread **Image** decode when the loader finishes.

**Editor composite preview:** [`src/pages/Builder.tsx`](src/pages/Builder.tsx) — `URL.createObjectURL(blob)` for texture-maker composite preview (`compositePreviewUrl`); revokes on change. Primarily editor UX, not play loop.

**World paint:** [`prepareWorldPaintStroke`](src/pages/Builder.tsx) returns layer blobs from `assets`; first use can coincide with stroke start — ensure GPU upload path does not duplicate work already done by [`TextureMaker`](src/components/TextureMaker/TextureMaker.tsx) `ImageBitmap` cache where applicable.

**Next implementation directions:** (1) ~~After world/assets are ready, prefetch~~ **Done (idle bitmap decode)** for entity `material.map` ids — see [`prefetchMaterialTextures.ts`](src/loader/prefetchMaterialTextures.ts). Optional: cache `THREE.Texture` in resolver to avoid second decode on material build. (2) For compositor exports, reuse the **bitmap cache** pattern from TextureMaker for any code path that currently hits `TextureLoader` + blob URL on first paint.

---

## Changelog

| Date | Change |
|------|--------|
| *(initial)* | Created from Firefox trace analysis + codebase review. |
| *(move)* | Relocated from `ai-context/` to `agent-context/`. |
| 2026-04-08 | §1: Frame timing overlay (`frameTiming.ts`, `runSceneFrame`, `FrameStatsOverlay`, View → Frame stats). §3 HUD: opacity/scale pulses. §7: `userData` clear without `delete`. §8: Builder live pose poll 220ms. |
| 2026-04-08 | Updated from detailed Firefox marker export: §1 concrete rAF numbers + 331ms LongTask; §2 GCMajor→DiscardJit cascade + rapierPhysics allocation hot spot; §4 GPU/shader evidence; §5 Rapier JIT deopt; §7 renderItem.ts:34 new bailout; §9 blob decode timings (51ms, 241ms mid-frame). |
| 2026-04-08 | §2: `rapierPhysics.ts` — reuse `CachedTransform` in place; `contactForceByPair` map reused with `clear()`. §1: flame-chart how-to. §9: code trace for blob/texture paths (`assetResolverImpl`, `SceneView` skybox, Builder preview). |
| 2026-04-08 | §2/§6: `RenderItemRegistry.executeTransformers` scratch `TransformInput`; `InputTransformer` in-place `actions`; `rapierQuaternionToEulerInto` (`rotationUtils.ts`). §7: pose updates in-place; `setPositionXYZ` / `setRotationEuler`; `SceneView` game API uses them. §9: idle `createImageBitmap` prefetch (`prefetchMaterialTextures.ts` + `SceneView`). |

---

## References

- Hot loop: `src/runtime/sceneFrameLoop.ts`, `src/runtime/frameTiming.ts`, `src/components/SceneView.tsx`, `src/components/FrameStatsOverlay.tsx`
- Registry / `updateShape`: `src/runtime/renderItemRegistry.ts` (~474)
- Render item: `src/runtime/renderItem.ts`
- Idle texture decode prefetch: `src/loader/prefetchMaterialTextures.ts`
- Euler helpers: `src/utils/rotationUtils.ts` (`rapierQuaternionToEulerInto`)
- Physics step + cached transforms: `src/physics/rapierPhysics.ts` (`step()` ~427+, `contactForceByPair`, `dispose`)
- Blob URL textures: `src/loader/assetResolverImpl.ts`
- HUD CSS: search `rennHudPulse` / `rennHudPulseScore` / `rennHudPulseDamage`

Listed in [`README.md`](README.md) (this folder).
