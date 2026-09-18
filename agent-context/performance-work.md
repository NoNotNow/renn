# Performance work backlog

Ordered by typical impact. **Legend:** `[ ]` not started · `[~]` in progress · `[x]` done

**Status (2026-04-29):** JS alloc reuse (§2, §6, §7) **benchmark-validated** ([§10](#10-automated-performance-benchmarks); `npm run test:perf` with `RUN_PERF_BENCHMARKS=1`). **Tier 1 GPU**, **Tier 2** hot-path alloc, **Tier 3** React (`LivePosesPoll` subtree, `FrameStatsOverlay` ~10 Hz, `GameHud` memo) **in code**. **Touching cache**, velocity/sleep in `CachedTransform`, distance culling, timestep sync **done**. **Next:** optional idle material prefetch if rAF-aligned decodes return; instancing/LOD when Frame Stats justify it.

**Smoothing note:** [`physics-render-smoothing-work.md`](physics-render-smoothing-work.md) — prefer visual interpolation before raising physics FPS.

### Rendering / depth (world settings)

- **`logarithmicDepthBuffer`**, **`videoTextureMaxAnisotropy`** (1–16) — World → Simulation; scene reload on change. `modelPreview` defaults log depth on.

---

## 1. Measure main-thread frame work (rAF)

Target **< ~16.7 ms** at 60 fps. Firefox/Chrome traces on heavy Builder+Play: rAF **22–67 ms** typical, GC/LongTask spikes; GPU `DispatchCommands` **27–33 ms**; pre-cache Chrome had **`executeTransformers` ~65%** of frame with **`contactPair`** under touching queries — **fixed** by `rebuildTouchingCache()` ([§5](#5-physics-cost)).

| Status | Item | Notes |
|--------|------|--------|
| [~] | **JS flame charts** on heavy scene | [§1.1](#11-how-to-capture-js-flame-charts). Headless phase split [§1.4](#14-post-cache-phase-split). Browser re-capture still manual. Correlate **View → Frame stats** (`frameTiming.ts`). |
| [x] | In-app frame timing HUD | `world.world.showFrameStats`; sections: transformers, physics, scripts, render, etc. |

### 1.1 How to capture JS flame charts

Same heavy project as prior exports. **Firefox:** profiler → 10–30 s Play → expand rAF / search `runSceneFrame`, `PhysicsWorld.step`, `executeTransformers`, `ScriptRunner`, `render`. **Chrome:** Performance → Main → Animation frame. Record approximate % per bucket + hottest symbols.

### 1.2 Firefox markers (2026-04-08, summary)

rAF ~23–43 ms (spikes higher); `GCMinor` ~4–7 ms (large nursery promotion); `GCMajor`/LongTask multi‑ms; `Image Paint` on blob URLs **30–232 ms** (§9); WebGL submit + sync stalls. **`LivePosesPoll`** (~100 ms interval from `Builder.tsx`) updates **`PropertySidebar`** subtree only.

### 1.3 Chrome trace (2026-04-08, pre-cache)

`executeTransformers` dominated; **`isEntityTouchingAny` / `contactPair`** ~497 ms of frame — WASM wrapper churn (`FinalizationRegistry`). **Post-fix:** batch in `PhysicsWorld.rebuildTouchingCache()` once per `step()`; headless [§1.4](#14-post-cache-phase-split) shows transformers ~**11%**, physics ~**86%** (sim loop only — no GPU/React).

### 1.4 Post-cache phase split (headless)

`performance-benchmarks.integration.test.ts` — 20 entities, 300 frames: physics ~86%, transformers ~11%, sync ~3%. **Not** comparable to browser ms/frame; confirms touching work moved out of transformer pass into `step()`.

---

## 2. Cut allocation churn and GC ← highest-priority JS

Nursery promotion + `GCMajor` → JIT discard cascades on Firefox. **Fixed in `rapierPhysics.ts`:** reuse `CachedTransform` structs; `contactForceByPair.clear()` refill.

| Status | Item | Notes |
|--------|------|--------|
| [x] | Cached-transform + force map reuse | Per-body in-place mutation in `step()`. |
| [ ] | Profile **remaining** alloc sites | Scripts, `ScriptRunner`, occasional clears. |
| [~] | Per-frame alloc in rAF | Tier 2: transformer chain scratch, `applyInputMappingInto`, debug-force compaction, HUD `*Into` helpers. Script `getForwardVector` still allocates. |
| [~] | React during play | **[x]** inspector: [`LivePosesPoll.tsx`](../src/components/LivePosesPoll.tsx) → `PropertySidebar` only ([feature-inspector.md](./feature-inspector.md)). Further: memo heavy lists if needed. |

---

## 3. HUD CSS

| Status | Item | Notes |
|--------|------|--------|
| [x] | Pulse via opacity/transform not `filter` | `GameHud.tsx` |
| [x] | Hidden when HUD off | Mount gated by `showGameHud` |

---

## 4. Rendering / GPU (Three.js)

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Mesh simplify / triangle audit | `countVisualModelTriangles`, meshoptimizer path |
| [x] | Shadows 1024², selective `castShadow` | AABB half-extent &lt; 0.3 skips cast |
| [x] | **`renderPixelRatio`** low/medium/high | `resolvedPixelRatio`, reactive in `SceneView` |
| [~] | Instancing | Revisit when Frame Stats show draw-call pressure |
| [x] | Distance culling | `WorldSettings.distanceCulling`; optional `sleepCulled` |
| [ ] | Multi-res LOD | [feature-lod.md](feature-lod.md) — separate from culling |

---

## 5. Physics cost

| Status | Item | Notes |
|--------|------|--------|
| [x] | **`rebuildTouchingCache()`** per step | `executeTransformers` reads cache, not per-entity `contactPairsWith` |
| [ ] | Simpler colliders vs trimesh dynamics | Prefer primitives; mesh simplify for trimesh |
| [x] | Sleeping skips in reset/transformers; cache `isSleeping` | |
| [ ] | Polymorphism in cachedTransforms loop | Profile if hot |
| [x] | `linvel`/`angvel`/`isKinematic` in cache | No Rapier getters in `executeTransformers` |

**Culling wake:** `enableBodyFromCulling` refreshes cache + clears custom sleep timer so uncull does not stick asleep (`rapierPhysics.test.ts`).

---

## 6. Scripts and transformers

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Light `onUpdate`; avoid per-frame scans/raycasts | |
| [ ] | Sane timer intervals | |
| [~] | Long chains / follow / wanderer | Shared scratch input per entity; follow lead pose reuse |

---

## 7. JIT bailouts (registry / renderItem)

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Confirm hotness of `updateShape` / pose paths | |
| [x] | No `delete` on `userData` in hot path | `= undefined` |
| [x] | No redundant `userData.entity` reassignment | In-place entity mutation |

---

## 8. Builder timers

| Status | Item | Notes |
|--------|------|--------|
| [x] | Inspector pose poll scoped | `LivePosesPoll` + render prop; **100 ms** in `Builder.tsx` |

---

## 9. Assets / textures

Blob **`Image Paint`** mid-rAF (51–241 ms in traces). **Partial:** `prefetchMaterialTextures.ts` removed — re-wire idle `createImageBitmap` from `SceneView` if profiling confirms.

| Status | Item | Notes |
|--------|------|--------|
| [~] | Prefetch/decode before play loop | See loader `assetResolverImpl`, skybox in `SceneView`, TextureMaker bitmap cache |
| [ ] | Downscale composites; share asset ids | |
| [ ] | Fewer compositor layers | |

---

## 10. Automated performance benchmarks

```bash
npm run test:run -- src/test/scenarios/performance-benchmarks.integration.test.ts
```

| Metric | Proves |
|--------|--------|
| Object identity | `CachedTransform` / map reuse |
| Heap delta | Alloc per frame (needs `--expose-gc`) |
| Scaling ratio | Sub-quadratic entity scaling |
| Phase breakdown | Physics vs transformers vs sync |

Files: `benchmarkUtils.ts`, `worldSimulator.ts`. Regressions: identity fail → new `new` in cache; heap &gt; ~2 KB/frame → new hot-loop alloc; scaling &gt; 6.5 → quadratic creep.

---

## 11. Bottleneck ranking (user-visible)

Benchmarks prove **near-zero heap growth** and linear scaling, but **steady-state FPS** on heavy scenes is often **GPU + Rapier step**, not remaining JS alloc.

| Bottleneck | Mitigation status |
|---|---|
| GPU shadows/fill/DPR | Tier 1 done — validate via Frame Stats + profiler |
| Rapier step + cache fill | Touching batch + velocity cache done; simpler colliders open |
| Transformer JS | Cached sort + scratch input done |
| React Builder | `LivePosesPoll` isolation done |
| Mid-rAF texture decode | §9 open |

**Defer:** instancing until draw calls justify; LOD per feature-lod; deep Rapier WASM deopt (library code — reduce call count instead).

---

## References

- Loop: `sceneFrameLoop.ts`, `frameTiming.ts`, `SceneView.tsx`, `FrameStatsOverlay.tsx`
- Semi-fixed timestep: `advanceSemiFixedAccumulator`, `world.world.simulation`, `timeScale`
- Culling: `renderItemRegistry.ts`, `distanceCullingMath.ts`, `rapierPhysics.ts`
- Physics cache: `rapierPhysics.ts` (`step()`, `CachedTransform`, `contactForceByPair`)
