# Performance work backlog

Working document derived from Firefox profiling on a heavy project (RefreshDriver / `requestAnimationFrame`, GC, CSS HUD, JIT notes) and from codebase review. **Items are ordered by typical impact (largest gains first).** Update statuses and notes as work completes.

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done

---

## 1. Measure and bound main-thread frame work (rAF)

**Evidence:** Firefox trace showed `requestAnimationFrame callbacks` routinely **~18–40+ ms** per tick (target for 60 fps is **&lt; ~16.7 ms** content-side), with `RefreshDriverTick` reasons including animations and video frame callbacks.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Capture **JS flame charts** (Firefox Profiler JS view or Chrome Performance) for the same bad scene: split time for **physics step**, **`executeTransformers`**, **`runOnUpdate` scripts**, **`renderer.render`**, React/Builder overhead | Confirms where to spend engineering time; this doc’s order may be reshuffled after data. |
| [ ] | Optional: **in-app frame timing HUD** (fps + last-frame ms breakdown) for regressions without DevTools | Not a substitute for browser profiler once per milestone. |

---

## 2. Cut allocation churn and GC pauses

**Evidence:** Repeated **`GCMinor`**, **`GCMajor` ~95–108 ms**, **`javascript.gc.nursery_bytes` ~17 MB** in trace — indicates **heavy short-lived allocation**, causing jank independent of “average” fps.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Profile **allocation sites** (browser memory tool, sampling, or manual `performance.measure` around suspected loops) | Focus on per-frame paths: registry, scripts, vectors, temporary arrays. |
| [ ] | Reduce **per-frame object creation** in hot paths (reuse `Vector3`/buffers where the codebase already patterns this; avoid `map`/`filter` allocating in rAF) | Align with existing hot-path style in `ScriptRunner` / registry. |
| [ ] | Audit **React** updates during play/build: avoid unnecessary state updates that reconcile large trees every frame | Builder already throttles some camera writes; extend pattern where needed. |

---

## 3. HUD: replace expensive CSS `filter` animations

**Evidence:** **`CSS animation iteration`** on **`rennHudPulseScore` / `rennHudPulseDamage`** with **`filter`** correlated with heavy ticks. Animating **`filter`** is costly (repaint / compositor).

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Replace HUD pulse **filter**-based effects with **`opacity` / `transform`** or **sprite swap** | Usually large win for little gameplay risk. |
| [ ] | Ensure pulses are **disabled or simplified** when HUD is hidden / minimal mode | Avoid paying cost when not visible. |

---

## 4. Rendering and GPU load (Three.js)

**Impact:** Often **high** for triangle- and fill-rate-heavy scenes; exact rank depends on flame data.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Use **Performance Booster** / **`countVisualModelTriangles`**-style data to find worst entities; simplify meshes (existing meshoptimizer path) | Already partially supported in product. |
| [ ] | **Shadow map**: lower resolution, tighten frustum, disable `castShadow` on small props | Cheap experiments. |
| [ ] | **Pixel ratio** cap: already `min(dpr, 2)`; consider **1.5** or quality setting on low-end | User-visible quality tradeoff. |
| [ ] | **Instancing** for many copies of the same mesh + material | Larger engineering item; big win when applicable. |
| [ ] | **LOD** or simplified far meshes | Medium/large item. |

---

## 5. Physics cost

**Impact:** **High** when many bodies or expensive **trimesh** colliders.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Replace complex **static trimesh** colliders with **primitives** or simpler hulls where possible | Reduces Rapier step time. |
| [ ] | Ensure **sleeping** works: avoid constant forces from scripts/transformers when idle | Stops perpetual wake-ups. |

---

## 6. Scripts and transformers

**Impact:** Scales with entity count and per-hook work.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Reduce **`onUpdate`** work: early returns, timers, avoid **`findEntities` / raycasts** every frame | Profile-guided. |
| [ ] | Short **timer intervals** in scripts: only use aggressive intervals when necessary | |
| [ ] | Long **transformer chains** / expensive types (**follow**, **wanderer**): fewer entities or cheaper configs | |

---

## 7. JIT bailout at `renderItemRegistry.ts` (~474)

**Evidence:** Firefox reported **Bailout / Invalidate** at **`renderItemRegistry.ts:474`** (branch around **plane/ring** visual quaternion handling in `updateShape`).

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Confirm **how often** `updateShape` runs in the bad scenario (editor-only vs play) | Bailout only matters if this path is hot. |
| [ ] | If hot: reduce **polymorphism** / stabilize types at that branch; avoid **`delete` on `userData`** in hot path if refactor is cheap | SpiderMonkey deopt; validate with profiler after change. |

---

## 8. Builder ancillary timers

**Evidence:** **`setInterval` ~99 ms** at `Builder.tsx` (~line 1209) appears in trace; self-time small but adds periodic wakeups.

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Merge periodic work with **rAF** or **increase interval** if UX allows | Lower priority than GC and rAF body. |

---

## 9. Assets and textures

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Downscale large **composite** / material maps; share **asset ids** across entities | Less VRAM, fewer unique textures. |
| [ ] | Fewer **layers** in texture documents where possible | Compositor cost on edit/bake. |

---

## Changelog

| Date | Change |
|------|--------|
| *(initial)* | Created from Firefox trace analysis + codebase performance notes. |
| *(move)* | Relocated from `ai-context/` to `agent-context/`. |

---

## References

- Hot loop overview: `src/runtime/sceneFrameLoop.ts`, `src/components/SceneView.tsx`
- Registry / `updateShape`: `src/runtime/renderItemRegistry.ts`
- HUD CSS: search **`rennHudPulse`** / **`rennHudPulseScore`** / **`rennHudPulseDamage`** in UI/CSS

Listed in [`README.md`](README.md) (this folder).
