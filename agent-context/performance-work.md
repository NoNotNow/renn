# Performance work backlog

Working document derived from Firefox profiling on a heavy project (RefreshDriver / `requestAnimationFrame`, GC, CSS HUD, JIT notes) and from codebase review. **Items are ordered by typical impact (largest gains first).** Update statuses and notes as work completes.

**Current status (2026-04-08, doc sync 2026-04-19):** JS allocation-reduction work (§2, §6, §7) is **benchmark-validated** — near-zero heap growth, full object reuse, linear scaling (see §10). Re-validate heap + scaling asserts with `npm run test:perf` (`RUN_PERF_BENCHMARKS=1`; those two describes are skipped in default `test:run` to avoid flaky thresholds under parallel Vitest). **Tier 1 GPU**, **Tier 2** hot-path alloc, and **Tier 3** (`FrameStatsOverlay` ~10 Hz, `GameHud` memo) are in code. **Inspector pose polling** uses [`LivePosesPoll.tsx`](../src/components/LivePosesPoll.tsx) in [`Builder.tsx`](../src/pages/Builder.tsx): interval + state live **under** that wrapper so **`PropertySidebar`** (and siblings inside the render prop) reconcile on the tick — **not** the full `Builder` tree. **Latest Firefox markers** summarized in [§1.2](#12-firefox-marker-export-2026-04-08-builder--play). **Velocity cache**, **sleep-skip**, **timestep sync**, and **geometry count** in Frame Stats overlay are implemented. **Next:** optional DPR toggle; optional idle material prefetch if decode-in-rAF returns; instancing/LOD when GPU stats justify it.

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done

### Rendering / depth (2026-04-15, updated configurable)

- **World settings** (`world.world`): **`logarithmicDepthBuffer`** — omit or `true` for logarithmic depth (default); `false` disables. **`videoTextureMaxAnisotropy`** — integer **1–16** for `VideoTexture.anisotropy` on material video maps (default **16** when omitted). Toggles live in the **World** panel (simulation section). Changing them **reloads the scene** (same path as other renderer-affecting options).
- **`modelPreview`** uses the same default as an omitted world flag: logarithmic depth **on** (see `resolvedLogarithmicDepthBuffer(undefined)`).

---

## 1. Measure and bound main-thread frame work (rAF)

**Evidence (updated 2026-04-08):** Firefox marker export confirms `requestAnimationFrame callbacks` routinely **22–67 ms** per tick (worst: **331 ms** `LongTask`, two more at 65–67 ms). Target for 60 fps is **< ~16.7 ms**. The 331 ms spike correlates directly with a `GCMajor` (424 ms total, see §2) triggering `DiscardJit` — all compiled JS is thrown away, followed by hundreds of `javascript.ion.compile_time` recompile entries. A **2026-04-08** heavy Builder+Play+HUD export (see §1.2) shows the same structural issues: multi‑tens‑of‑ms `RefreshDriverTick` / rAF, frequent **GCMinor** (~4–7 ms), **GCMajor** + **LongTask** stacks, **blob `Image Paint`** in the **30–232 ms** range, and **WebGL** `DispatchCommands` / sync **GetLinkResult** / **GetFrontBuffer** stalls.

| Status | Item | Notes |
|--------|------|--------|
| [~] | Capture **JS flame charts** (Firefox Profiler JS view or Chrome Performance) for the same bad scene: split time for **physics step**, **`executeTransformers`**, **`runOnUpdate` scripts**, **`renderer.render`**, React/Builder overhead | **How-to:** see [§1 procedure](#11-how-to-capture-js-flame-charts). Correlate with **View → Frame stats** (`frameTiming.ts`). Rank sub-costs inside the rAF callback after §2 physics alloc fix. |
| [x] | Optional: **in-app frame timing HUD** (fps + last-frame ms breakdown) for regressions without DevTools | **View → Frame stats** in Builder (`world.world.showFrameStats`, World panel); saved with the project. Overlay position only: `localStorage` key `builderFrameStatsOverlayPos`. Sections: transformers, physics, script collisions, `onUpdate`, camera, game HUD, render. |

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

### 1.2 Firefox marker export (2026-04-08, Builder + Play)

Captured on `localhost` with Game HUD, physics, and inspector open. Representative markers (durations vary by frame):

| Bucket | Observed | Notes |
|--------|-----------|--------|
| **`requestAnimationFrame callbacks`** | ~**23–43 ms** typical; spikes **~71 ms**, **~259 ms** | Still far above 16.7 ms budget when compositor/GC align |
| **`RefreshDriverTick`** | Similar span to rAF | Tick reasons include animation callbacks, layout, paint |
| **`GCMinor`** | ~**4–7 ms**; `javascript.gc.nursery_bytes` **20971520** (**20 MB**) | Promotion rate **~68–98%** (same pattern as §2) |
| **`GCMajor` / `dom.gc_in_progress`** | **~108–155 ms** in-window | Same class of pause as earlier 424 ms trace |
| **`LongTask`** | **~64–79 ms**, **~259 ms** | Aligns with GC + compositor + rAF work in same window |
| **`Image Paint` `blob:…`** | **~33 ms**, **~232 ms**, **~50 ms**, smaller hits | Confirms §9 — decode/upload mid-pipeline |
| **`PWebGL::Msg_DispatchCommands`** | Many **sub‑ms**; bursts **~23–33 ms** | GPU submit still dominant |
| **`PWebGL::Msg_GetLinkResult` (sync)** | **~15 ms** | Shader link still hits main thread mid-session |
| **`PWebGL::Msg_GetFrontBuffer` (sync)** | **~6.5 ms** | Additional sync stall in same session |
| **CSS `rennHudPulseScore` / `rennHudPulseDamage`** | Listed as **opacity, transform** iterations | Matches §3 fix (no animated `filter`); markers still appear but are not the multi‑ms line item |
| **JIT** | `Invalidate` / `Bailout` in bundled **Three** (`chunk-BQJMB3HC.js`), **React** (`chunk-FD5SMSK5.js`), **`avatarUtils.ts`** | `avatarEntityIconLetter` hot path simplified (`charAt`) to reduce key-handler bailouts |

**React Builder:** `setInterval` (~100 ms) in **`LivePosesPoll`** (used from `Builder.tsx`) updates **`livePoses`** for **`PropertySidebar`** only — **not** a full `Builder` re-render each tick.

**Headless check after this change:** `npm run test:run -- src/test/scenarios/performance-benchmarks.integration.test.ts` — still sub-quadratic scaling and near-zero heap delta (does not reflect browser GPU/GC).

### 1.3 Chrome Performance trace (2026-04-08, Builder + Play)

Chrome DevTools Performance tab with call tree. Users report Chrome is noticeably smoother than Firefox. INP **49 ms**, CLS **0**.

| Call tree entry | Self time | Total time | Notes |
|----------------|-----------|------------|-------|
| **Animation frame fired** | — | **1,872 ms** | Entire rAF |
| **`SceneView.tsx:654:23`** (`animate`) | 0.6 ms | **1,786 ms** | Frame entry |
| **`runSceneFrame`** (`sceneFrameLoop.ts:66:17`) | — | **1,760 ms** | Frame body |
| **`executeTransformers`** (`renderItemRegistry.ts:643:3`) | — | **1,148 ms** | **65% of frame** |
| **`rapierPhysics.ts:504:43`** (`isEntityTouchingAny` + `getAverageSupportVelocity`) | — | **497 ms** | Per-entity `contactPairsWith` + `contactPair` |
| **`contactPair`** (`@dimforge_rapier3d-compat:4510:1`) | — | **486 ms** | Narrow-phase WASM queries |
| **`wasm-function[1192]`** | — | **562 ms** | Rapier WASM core step |
| **`wasm-to-js` boundary** | — | **562 ms** | WASM→JS bridge |
| **Minor GC** | 0.3 ms | — | Much smaller than Firefox |

**AI summary of the full trace (whole session):**

| Category | Total self time | Details |
|----------|----------------|---------|
| **`__wrap`** (FinalizationRegistry `.register`) | **4,541 ms** | Temporary WASM JS wrapper creation; **4,291 ms** in `b.register` |
| **`__destroy_into_raw`** (`.unregister`) | **1,451 ms** | Destroying wrapper pointers; **1,424 ms** in `b.unregister` |
| **`contactManifold` + `numContactManifolds`** | **5,600+ ms** total | Per-entity narrow-phase walks via `contactPairsWith` |

**Root cause:** Each call to `contactPairsWith`→`contactPair`→manifold/contact getters creates **temporary JS wrapper objects** around WASM pointers. Rapier's `rapier.mjs` registers every wrapper with `FinalizationRegistry` for pointer cleanup. With N entities × M contact pairs × K manifolds per frame, this creates **thousands of short-lived wrapper objects per second**, dominating the main thread.

**Fix (2026-04-08):** Batch touching/support queries into `PhysicsWorld.rebuildTouchingCache()` called once per `step()`, replacing N per-entity `contactPairsWith` + `contactPair` calls in `executeTransformers`. The cache is keyed by entity id; `executeTransformers` reads from cache instead of querying Rapier per entity. This does **not** reduce WASM wrapper creation within a single batch pass (Rapier's bridge always wraps), but eliminates **redundant repeated queries** — the total contact-pair walk count drops from O(N × contacts) to O(contacts) per frame.

**Browser difference:** Chrome's V8 GC handles short-lived objects better than Firefox's SpiderMonkey nursery (20 MB nursery → 4–7 ms `GCMinor`). The **same WASM wrapper churn** exists in both, but Firefox additionally suffers JIT bailout cascades (`DiscardJit` → ion recompile) and longer GC pauses. Chrome's FinalizationRegistry overhead is real but lower latency.

---

## 2. Cut allocation churn and GC pauses  ← **highest-priority code change**

**Evidence (updated 2026-04-08):** Detailed marker trace shows:
- `GCMinor` fires every **10–16 ms**, costing **4–7 ms** each. Nursery size is **platform/session-dependent**: **15 MB** (`15728640`) in one export; **20 MB** (`20971520`) in the **2026-04-08** Builder+Play marker sample (§1.2).
- Nursery promotion rate is **69–98 %** → objects are not short-lived; they survive and tenure to the old heap.
- `GCMajor` observed at **109 ms** and **424 ms** (`dom.gc_in_progress`). The 424 ms GCMajor fires `DiscardJit` immediately after, discarding all JIT-compiled code, then triggers a cascade of hundreds of `javascript.ion.compile_time` entries → the **331 ms `LongTask`** is this recompile cascade, not JS application code.
- **Identified hot allocation site** in `rapierPhysics.ts` (per physics step, per dynamic/kinematic body) — **addressed 2026-04-08**:
  - Previously: `storedPos` / `storedRot` — new plain objects every frame per body; `new Map()` for contact forces every step.
  - Now: **reuse** `CachedTransform` entries in `cachedTransforms` (mutate `position` / `rotation` in place); **`contactForceByPair.clear()`** then refill (single `Map`).

| Status | Item | Notes |
|--------|------|--------|
| [x] | **Fix: preallocate cached-transform objects** in `rapierPhysics.ts` — reuse `{ x, y, z }` / `{ x, y, z, w }` structs per body rather than creating new ones each step; reuse or clear a single `forceMap` | Implemented: per-entity `CachedTransform` reuse in `step()`; `contactForceByPair` map cleared each step. |
| [ ] | Profile remaining **allocation sites** (browser memory tool or `performance.measure` around hot loops) | After the physics fix, identify next largest allocators. Focus on: scripts/transformer per-frame arrays, `map`/`filter` in rAF. |
| [~] | Reduce remaining **per-frame object creation** (reuse `Vector3`/buffers; avoid `map`/`filter` allocating in rAF) | **2026-04-08:** as before, plus **Tier 2:** `TransformerChain` accumulates into `input.accumulatedForce`/`Torque` (no per-iter `{...input}`); priority sort cached on add/remove (`getAll` / `execute`). `applyInputMappingInto` + `InputTransformer` writes into `input.actions` (no temp `Record`). `sceneFrameLoop` debug forces: in-place compaction. HUD: `getLinearVelocityInto` + `getForwardVectorInto` + module scratch `Vec3`. **Remaining:** `ScriptRunner`; script/transformer content; `getForwardVector` script API still allocates. |
| [~] | Audit **React** updates during play: avoid unnecessary state updates that reconcile large trees every frame | **2026-04-08:** inspector **`livePoses`** polling moved to [`InspectorLivePoseBridge.tsx`](../src/components/InspectorLivePoseBridge.tsx) — `PropertySidebar` subtree only, not full `Builder`. Further: memoize heavy list items if needed. |

---

## 3. HUD: replace expensive CSS `filter` animations

**Evidence:** `CSS animation iteration` on `rennHudPulseScore` / `rennHudPulseDamage` with `filter` correlated with heavy ticks. Animating `filter` is costly (repaint / compositor). Post-fix exports still list these markers with **opacity, transform** (expected); they are not the primary multi‑ms cost vs rAF/GPU/GC (§1.2).

| Status | Item | Notes |
|--------|------|--------|
| [x] | Replace HUD pulse **filter**-based effects with **`opacity` / `transform`** or **sprite swap** | Done: `GameHud.tsx` uses opacity + scale keyframes; static `textShadow` retained. |
| [x] | Ensure pulses are **disabled or simplified** when HUD is hidden / minimal mode | No extra work: `GameHud` only mounts when `showGameHud` is true (`SceneView`). |

---

## 4. Rendering and GPU load (Three.js)

**Evidence (updated 2026-04-08):** Marker trace shows `PWebGL::Msg_DispatchCommands` taking **27–33 ms** per occurrence (multiple per frame), and `PWebGL::Msg_GetLinkResult` **14–15 ms** (sync IPC for WebGL shader link, causing large `Awake` stalls) — shader compilation is happening mid-session. **2026-04-08** sample also shows **`PWebGL::Msg_GetFrontBuffer`** sync **~6.5 ms**. GPU work is a confirmed contributor on heavy scenes.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Use **Performance Booster** / **`countVisualModelTriangles`**-style data to find worst entities; simplify meshes (existing meshoptimizer path) | Already partially supported in product. |
| [x] | **Shadow map**: lower resolution, tighten frustum, disable `castShadow` on small props | **2026-04-08:** 1024² map; `castShadow` off when world AABB half-extent &lt; 0.3 (`shadowBounds.updateMeshCastShadowFromWorldAabb`); `loadWorld` + `RenderItemRegistry.updateShape`. |
| [x] | **Pixel ratio** cap: already `min(dpr, 2)`; consider **1.5** or quality setting on low-end | **2026-04-08:** `SceneView` uses `min(dpr, 1.5)` (`MAX_SCENE_PIXEL_RATIO`). Optional user toggle still open. |
| [~] | **Instancing** for many copies of the same mesh + material | Larger engineering item; big win when applicable. **2026-04-08:** Frame Stats overlay now shows `geometries` count (`renderer.info.memory.geometries`); compare draw calls vs geometries to identify instancing candidates. Architecture outlined in plan (group by geometry+material hash → `InstancedMesh`). |
| [x] | **Distance culling** | `WorldSettings.distanceCulling` (`maxDistance`, `minSizeDistanceRatio`, optional `sleepCulled`); omitted = enabled with defaults; `false` = off. `RenderItem.worldSize` is the max edge of a **world-space mesh AABB** (`computeMeshWorldMaxExtent`), refreshed on load and when scale/shape/model changes — not per frame. Hard `maxDistance` does not cull when `worldSize` exceeds camera distance (large objects). `WorldPanel`. Culled: hide mesh + skip transformers; with `sleepCulled`, freeze Rapier bodies + skip scripts. |
| [ ] | **Multi-resolution LOD** (simplified far meshes) | Separate project — see [feature-lod.md](feature-lod.md). `meshSimplifier.ts` can generate reduced geometries, but `THREE.LOD` swap-distance logic + asset pipeline changes are out of scope for this backlog. |

---

## 5. Physics cost — **WASM wrapper churn is the dominant bottleneck**

**Evidence (updated 2026-04-08):** Chrome Performance trace (§1.3) confirms **`executeTransformers`** takes **65% of frame time** (1,148 ms / 1,760 ms). Within that, **497 ms** is `isEntityTouchingAny` + `getAverageSupportVelocity` — per-entity narrow-phase contact queries via `contactPairsWith` + `contactPair`. Each query creates temporary JS wrapper objects (Rapier `__wrap` / `FinalizationRegistry`): **4,541 ms** in `__wrap` and **1,451 ms** in `__destroy_into_raw` over the full session.

Firefox additionally suffers `Bailout / Invalidate` at `GetAliasedVar` in the WASM interop (`@dimforge/rapier3d-compat.js`) causing JIT deopt cascades.

| Status | Item | Notes |
|--------|------|--------|
| [x] | **Batch touching/support queries**: single `rebuildTouchingCache()` per `step()` instead of N per-entity `contactPairsWith` calls in `executeTransformers` | **2026-04-08:** `PhysicsWorld.rebuildTouchingCache()` builds `Map<entityId, {touching, supportVelocity}>` once per step; `executeTransformers` reads cache. Eliminates O(N) → O(1) Rapier query batches. |
| [ ] | Replace complex **static trimesh** colliders with **primitives** or simpler hulls where possible | Reduces Rapier step time + contact pair count. **Guidance:** prefer `box`/`sphere`/`cylinder` shapes over `trimesh` for dynamic entities; trimesh broadphase/narrowphase costs scale with vertex count. The existing `meshSimplifier.ts` (meshoptimizer + simplifyModifier) reduces vertex count for trimesh colliders. A future inspector improvement could auto-suggest simpler colliders when a trimesh dynamic body is detected. |
| [x] | Ensure **sleeping** works: skip sleeping bodies in `resetAllForces` and `executeTransformers`; cache `isSleeping` in `CachedTransform` | **2026-04-08:** `resetAllForces` skips sleeping bodies; `executeTransformers` skips entities with `cached.isSleeping`; cache loop skips position/rotation/velocity update for sleeping bodies (values unchanged). |
| [ ] | Investigate **`rapierPhysics.ts` cachedTransforms loop** polymorphism: WASM objects returned by `body.translation()` / `body.rotation()` may have varying shapes across calls | Confirm with flame chart; if hot, destructure WASM return values into typed locals before storing. |
| [x] | Reduce **`body.linvel()` / `body.angvel()` wrapper churn** in `executeTransformers`: each call creates a WASM wrapper; batch into physics cache alongside transforms | **2026-04-08:** `CachedTransform` extended with `linvel`, `angvel`, `isKinematic`, `isSleeping`. Filled in `step()` cache loop alongside `translation()`/`rotation()`. `executeTransformers` reads `cached.linvel`/`cached.angvel` instead of calling Rapier. `applyCustomSleeping` reads from cache. `getLinearVelocityInto`/`getLinearVelocity` prefer cache with fallback. Removes `getBody()` call from `executeTransformers`. |

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
| [~] | **Avoid mid-play blob decodes**: texture compositor output (blob: URLs) should be fully decoded and uploaded to GPU (via `createImageBitmap` or canvas) **before** entering the play loop, not lazily during rAF | **Partial / removed helper:** `prefetchMaterialTextures.ts` was deleted (no production wiring). **Next:** if needed, re-add idle `createImageBitmap` prefetch from `SceneView` after load and document the entry point. |
| [ ] | Downscale large **composite** / material maps; share **asset ids** across entities | Less VRAM, fewer unique textures. Smaller blobs → faster decode even if timing issue is not fixed. |
| [ ] | Fewer **layers** in texture documents where possible | Compositor cost on edit/bake. |

### 9.1 Code trace (implementation planning)

**Runtime material / model loading (most meshes):** [`src/loader/assetResolverImpl.ts`](src/loader/assetResolverImpl.ts) — `URL.createObjectURL(blob)` per asset id (cached in `urlCache`); `loadTexture` uses `THREE.TextureLoader` against that URL. **JPEG/PNG decode runs when the loader completes**, which can align with rAF if loading is triggered during play or after late asset updates.

**Skybox:** [`src/components/SceneView.tsx`](src/components/SceneView.tsx) — skybox `useEffect` creates a **new** blob URL per load and `TextureLoader.loadAsync`; decode is async but still main-thread **Image** decode when the loader finishes.

**Editor composite preview:** [`src/pages/Builder.tsx`](src/pages/Builder.tsx) — `URL.createObjectURL(blob)` for texture-maker composite preview (`compositePreviewUrl`); revokes on change. Primarily editor UX, not play loop.

**World paint:** [`prepareWorldPaintStroke`](src/pages/Builder.tsx) returns layer blobs from `assets`; first use can coincide with stroke start — ensure GPU upload path does not duplicate work already done by [`TextureMaker`](src/components/TextureMaker/TextureMaker.tsx) `ImageBitmap` cache where applicable.

**Next implementation directions:** (1) Optional **idle bitmap prefetch** for entity `material.map` ids (previous standalone module removed — wire from `SceneView` if profiling shows rAF-aligned decodes). Optional: cache `THREE.Texture` in resolver to avoid second decode on material build. (2) For compositor exports, reuse the **bitmap cache** pattern from TextureMaker for any code path that currently hits `TextureLoader` + blob URL on first paint.

---

## 10. Automated performance benchmarks

Integration tests that measure hardware-independent metrics to validate optimizations and guard against regressions. Run with:

```bash
npm run test:run -- src/test/scenarios/performance-benchmarks.integration.test.ts
```

| Metric | What it proves | Hardware-independent? |
|--------|----------------|----------------------|
| **Object identity** | `CachedTransform` (incl. `linvel`/`angvel` sub-objects) / `contactForceByPair` references survive across frames (§2 reuse) | Yes — deterministic pass/fail |
| **Heap delta** | Bytes allocated per frame per entity during steady-state simulation (`--expose-gc` via Vitest) | Yes — allocation count is code-determined |
| **Scaling ratio** | `time(4x entities) / time(1x entities)` stays sub-quadratic (< 6.5; linear = 4.0) | Yes — dimensionless ratio |
| **Frame time distribution** | CoV, p99/median recorded for GC-spike detection (informational; too noisy under parallel CI) | Partially — ratios are stable on isolated runs |
| **Phase breakdown** | % of frame in transformers / physics / sync; tracks where the bottleneck shifts | Partially — proportions are stable |

**Files:**
- Test: [`src/test/scenarios/performance-benchmarks.integration.test.ts`](../src/test/scenarios/performance-benchmarks.integration.test.ts)
- Helpers: [`src/test/helpers/benchmarkUtils.ts`](../src/test/helpers/benchmarkUtils.ts) (heap measurement, stats, world factory)
- Simulator: [`src/test/helpers/worldSimulator.ts`](../src/test/helpers/worldSimulator.ts) (`runFramesTimed()`, `getPhysicsWorld()`)

**What regressions look like:**
- Object identity test fails → someone re-introduced per-frame `new` in the physics cache or Map path.
- Heap delta > 2 KB/frame → new allocation site in the hot loop (profile with `performance.measure` or browser memory tool).
- Scaling ratio > 6.5 → quadratic cost crept in (nested entity loops, broadphase regression).

---

## 11. Strategic approach: where time goes and what moves the needle

### Why users cannot see the difference (yet)

The allocation-reduction work (§2, §6, §7) is **provably effective** — automated benchmarks (§10) confirm:

- **Heap growth: -75 bytes/frame** (near-zero retained allocation during steady-state simulation).
- **Object reuse: 100%** — `CachedTransform` and `contactForceByPair` Map references survive across frames.
- **Scaling: 3.65x** for 4x entity count (linear).

But user-visible FPS has not improved because **the dominant bottleneck is GPU-bound rendering, not JS-side GC**. The allocation fixes prevent the catastrophic 331 ms GC→DiscardJit→recompile cascade, but do not reduce the **steady-state GPU + physics cost** that keeps frames above 16.7 ms on heavy scenes.

### Evidence-based bottleneck ranking

Combines Firefox profiling, **Chrome Performance** call tree (§1.3), headless benchmarks, and code audit:

| Bottleneck | Evidence | Est. per-frame cost | Addressable? |
|---|---|---|---|
| **Rapier WASM wrapper churn** (FinalizationRegistry) | Chrome: **4,541 ms** `__wrap` + **1,451 ms** `__destroy_into_raw` over session; **497 ms / 1,760 ms** per frame in touching queries | **~30 ms/frame** (heavy scene) | **Yes (done 2026-04-08):** `rebuildTouchingCache` batches queries; `CachedTransform` extended with `linvel`/`angvel`/`isKinematic`/`isSleeping` — eliminates `body.linvel()`/`body.angvel()`/`getBody()` calls from `executeTransformers`. |
| **GPU fill + shadow pass** | WebGL `DispatchCommands` 27–33 ms; `GetLinkResult` 14 ms sync stall | 30+ ms (exceeds 16.7 ms budget alone) | **Yes:** shadow res, DPR cap, fewer casters |
| **Rapier WASM step** (core) | Chrome: `wasm-function[1192]` **562 ms** total; headless 51% | ~10 ms | Partially: sleep tuning (**done 2026-04-08** — sleeping bodies skip forces/transformers), `world.timestep = dt` synced, simpler colliders (guidance added) |
| **Transformer JS** | Chrome: `executeTransformers` **1,148 ms** total (includes touching); headless 46% | ~8 ms | **Yes:** cached sort + in-place **done**; touching cache **done** |
| **React reconciliation** | Builder `livePoses` polling in **`LivePosesPoll`** → `PropertySidebar` subtree | 1–5 ms on inspector path | **Partial:** `FrameStatsOverlay` throttled; pose subtree isolated **2026-04-19** |
| **Remaining JS alloc** | Script APIs, `ScriptRunner`, occasional `Object.keys` in clears | < 1 ms cumulative typical | **Partial:** Tier 2 hot paths addressed |

**Key insights:**
- Chrome call tree (§1.3): `executeTransformers` at **65%** of frame; **nearly half** is per-entity `contactPairsWith`/`contactPair` WASM wrapper churn → **addressed by `rebuildTouchingCache`**.
- Firefox amplifies the same cost with `GCMinor` (nursery promotion), JIT bailouts, and longer GC pauses.
- The headless benchmark phase split (physics 51%, transformers 46%, sync 3%) **excludes** `renderer.render` (Three.js GPU submit). In the browser, GPU + WASM wrapper overhead together dominate.

### Prioritized action plan

#### Tier 1 — GPU-bound (biggest user-visible wins)

Users will see FPS improvement on heavy scenes. These directly reduce the dominant bottleneck:

| # | Item | Where | Rationale |
|---|------|-------|-----------|
| 1 | **Shadow map 2048 → 1024** (or dynamic by entity count) | [`loadWorld.ts`](../src/loader/loadWorld.ts) | **[x] 2026-04-08** — 1024² |
| 2 | **`PCFSoftShadowMap` → `PCFShadowMap`** | [`SceneView.tsx`](../src/components/SceneView.tsx) | **[x] 2026-04-08** |
| 3 | **Selective `castShadow`**: disable on entities with bounding sphere < 0.3 | [`loadWorld.ts`](../src/loader/loadWorld.ts), [`shadowBounds.ts`](../src/utils/shadowBounds.ts), [`renderItemRegistry.ts`](../src/runtime/renderItemRegistry.ts) | **[x] 2026-04-08** — AABB half-extent &lt; 0.3 |
| 4 | **DPR quality setting**: user toggle or auto-detect; cap at 1.5 or 1.0 on low-end | [`SceneView.tsx`](../src/components/SceneView.tsx) | **[~] 2026-04-08** — cap **1.5** applied; toggle not yet |
| 5 | **GPU budget monitoring**: expose `renderer.info.render.calls` and `.triangles` in Frame Stats overlay | [`FrameStatsOverlay.tsx`](../src/components/FrameStatsOverlay.tsx), [`frameTiming.ts`](../src/runtime/frameTiming.ts), [`sceneFrameLoop.ts`](../src/runtime/sceneFrameLoop.ts) | **[x] 2026-04-08** — sampled after `render()` |

#### Tier 2 — Remaining JS allocation (prevents spikes, moderate steady-state gain)

Completes the allocation-reduction campaign from §2. Validated by the headless benchmarks:

| # | Item | Where | Frequency |
|---|------|-------|-----------|
| 6 | **`TransformerChain.execute`**: pre-sort on add/remove (not per `execute`); reuse one `accumulated` + one `currentInput` scratch per chain | [`transformer.ts`](../src/transformers/transformer.ts) | **[x] 2026-04-08** — in-place accumulate into `input`; no `{...input}` per transformer |
| 7 | **`applyInputMapping`**: accept reusable `Record` instead of `{}` every call; avoid `Object.keys` in merge | [`inputMapping.ts`](../src/input/inputMapping.ts) (`applyInputMappingInto`), [`inputTransformer.ts`](../src/transformers/presets/inputTransformer.ts) | **[x] 2026-04-08** (`inputManager.ts` removed in cleanup) |
| 8 | **HUD `getAll()` sort**: cache sorted transformer list; invalidate on add/remove | [`transformer.ts`](../src/transformers/transformer.ts) (`sorted` + `sortDirty`) | **[x] 2026-04-08** |
| 9 | **`sceneFrameLoop` debug-force filter**: in-place splice instead of `Array.filter` | [`sceneFrameLoop.ts`](../src/runtime/sceneFrameLoop.ts) | **[x] 2026-04-08** |
| 10 | **`getLinearVelocity` / `getForwardVector`**: return into caller buffers, not new `[x,y,z]` | [`rapierPhysics.ts`](../src/physics/rapierPhysics.ts) (`getLinearVelocityInto`), [`renderItemRegistry.ts`](../src/runtime/renderItemRegistry.ts) (`getForwardVectorInto`), [`sceneFrameLoop.ts`](../src/runtime/sceneFrameLoop.ts) HUD scratch | **[x] 2026-04-08** — HUD path; script `getForwardVector` still returns new tuple |

#### Tier 3 — React overhead (Builder-mode specific)

Improves Builder responsiveness; does not affect standalone Play FPS:

| # | Item | Where | Rationale |
|---|------|-------|-----------|
| 11 | **Builder `livePoses`**: store in ref, push updates only to PropertySidebar (not full Builder rerender) | [`LivePosesPoll.tsx`](../src/components/LivePosesPoll.tsx) + [`Builder.tsx`](../src/pages/Builder.tsx) + PropertySidebar | **[x] 2026-04-19** — `getPosesRef` + render prop; interval inside `LivePosesPoll` |
| 12 | **`FrameStatsOverlay`**: cap setState to ~10 Hz or use direct DOM writes | [`FrameStatsOverlay.tsx`](../src/components/FrameStatsOverlay.tsx) | **[x] 2026-04-08** — `FRAME_STATS_UI_MIN_INTERVAL_MS` = 100 |
| 13 | **`React.memo` on `GameHud`** | [`GameHud.tsx`](../src/components/GameHud.tsx) | **[x] 2026-04-08** |

### What NOT to pursue yet

- **Instancing**: Large engineering effort. Only valuable when scenes have many copies of the same mesh. Revisit after GPU monitoring (item 5) reveals whether draw calls are the bottleneck.
- **Multi-resolution LOD**: Separate project scoped in [`feature-lod.md`](feature-lod.md). `meshSimplifier.ts` (meshoptimizer + `SimplifyModifier`) generates reduced geometries, but LOD additionally requires `THREE.LOD` swap-distance configuration and asset pipeline changes to pre-generate or cache reduced meshes. **Distance culling** (max distance + size/distance ratio; optional sleep) is implemented as a simpler alternative — see §4.
- **Physics WASM deopt**: The `Bailout/Invalidate` in Rapier's WASM interop is in library code (`@dimforge/rapier3d-compat.js`). The **primary fix** — reducing how often we call Rapier getters — is **done**: touching cache + velocity/sleeping cache eliminate all per-entity WASM calls from `executeTransformers`. Remaining wrapper churn is limited to the per-step cache-fill loop (one `linvel`+`angvel`+`translation`+`rotation` per awake body).
- **Script optimization**: Depends on user script content. General guidance (early returns, avoid per-frame `findEntities`/raycasts) belongs in script documentation, not engine optimization work.

### Measurement plan

| Tier | How to validate |
|------|-----------------|
| Tier 1 (GPU) | **Browser-based**: Frame Stats overlay (after adding `renderer.info` in item 5) + Chrome/Firefox profiler on the heavy test scene. The headless Vitest benchmarks cannot measure GPU cost. |
| Tier 2 (JS alloc) | **Automated**: `performance-benchmarks.integration.test.ts` — heap delta stays near zero; transformer phase share should decrease after item 6. |
| Tier 3 (React) | **React DevTools Profiler**: `Builder` should not reconcile every pose tick; only `LivePosesPoll` + `PropertySidebar` path. |

---

## Changelog (summary)

| Date | Key changes |
|------|-------------|
| 2026-04-08 | Tier 1 GPU (shadows 1024², PCFShadowMap, DPR 1.5, AABB castShadow), Tier 2 alloc (CachedTransform reuse, transformer chain, input mapping, debug forces, velocity helpers), Tier 3 React (InspectorLivePoseBridge, FrameStatsOverlay throttle, GameHud memo), Chrome trace analysis, rebuildTouchingCache, velocity/sleeping cache, distance culling, perf benchmarks |
| 2026-04-19 | Doc sync + cleanup Phase 2: `DEFAULT_FREE_FLY_KEYS` in `types/camera`, `worldGroundPatch`, shared drop-zone / pick-button styles, **`LivePosesPoll`** wired in Builder (Tier 3 row 11). `prefetchMaterialTextures` / unused bridge removed earlier. `TransformerTemplateDialog` test: await async preset load before assert. |
| 2026-04-09 | Distance culling uncull fix (`enableBodyFromCulling` refreshes cache + clears sleep timer) |
| 2026-04-15 | Controlled avatar exempt from sleep/cull skips (`wakeDynamicAndRefreshTransformCache`) | While a body is culled with `sleepCulled`, `step()` does not refresh its `CachedTransform`, so `isSleeping` can stay `true` from the last simulated frame. `enableBodyFromCulling` now runs `syncCachedTransformFromBody(..., full)` after `wakeUp()` and clears that entity’s `customSleepTimers` entry so the next frame’s `executeTransformers` (before `step`) sees an awake cache and stale custom-sleep timers do not immediately re-sleep the body. Regression: `rapierPhysics.test.ts` (`enableBodyFromCulling refreshes cached transform…`). |

---

## References

- Hot loop: `src/runtime/sceneFrameLoop.ts`, `src/runtime/frameTiming.ts`, `src/components/SceneView.tsx`, `src/components/FrameStatsOverlay.tsx`
- Semi-fixed timestep: `advanceSemiFixedAccumulator` in `SceneView`, `world.world.simulation`, `timeScale` (0.1–5)
- Distance culling: `src/types/world.ts`, `src/runtime/renderItemRegistry.ts`, `src/physics/rapierPhysics.ts`, `src/utils/distanceCullingMath.ts`, `src/components/WorldPanel.tsx`
- Physics cache: `src/physics/rapierPhysics.ts` (`step()`, `contactForceByPair`, `CachedTransform`)
- ~~Idle texture prefetch: `src/loader/prefetchMaterialTextures.ts`~~ (removed; optional reintroduce from `SceneView` if needed)
- Performance benchmarks: `src/test/scenarios/performance-benchmarks.integration.test.ts`, `src/test/helpers/benchmarkUtils.ts`
