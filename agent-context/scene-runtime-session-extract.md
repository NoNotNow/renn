# SceneView main effect → `SceneRuntimeSession` extraction plan

**Status:** Phases **0–6 complete** (2026-09-18). Main effect is a **`SceneRuntimeSession` adapter**; orchestration lives under `src/runtime/sceneRuntimeSession*.ts`.  
**Target workers:** `composer-2.5-fast` L3 subagents only.  
**Baseline:** `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json`

---

## Executive summary

| Question | Answer |
|----------|--------|
| **Doable?** | **Yes** |
| **Confidence** | **High (~85%)** — `runSceneFrame` / accumulator / avatar / sky / audio already live outside the effect; remaining work is orchestration + React callback wiring, not new semantics. |
| **Main risk** | Teardown ordering (null physics ref → rAF stop → registry clear → physics dispose → DOM) and stale `loadWorld` / Rapier async races; mitigate with existing `effectId` generation pattern moved into the session. |
| **Out of scope** | Splitting `executeTransformers`, registry hot paths, or `sceneFrameLoop` per guardrails. |

---

## Grilling decision log (recommendation = chosen decision)

User delegated all frontier answers to recommendations. Rounds recorded in dependency order.

### Round 1 — Seam placement and module shape

**Q1 — Where does the external seam live?**  
React `SceneView` keeps JSX, incremental effects (gravity, sky color, camera config, shadows, pixel ratio), hooks (`useSkyDome`, `useWorldAudio`, `useSceneFullscreen`), and `useImperativeHandle`. The **600-line** mount effect becomes a thin adapter: build config → `session.start()` / cleanup → `session.dispose()`.

➡️ **Chosen:** Seam at `src/runtime/sceneRuntimeSession.ts` (runtime tier, alongside `sceneFrameLoop`, `avatarSession`, `restoreInitialPoses`).

---

**Q2 — Module form: class vs hook vs function?**  
Options: (a) `useSceneRuntimeSession` hook, (b) `createSceneRuntimeSession()` factory returning `{ start, dispose, handles }`, (c) class `SceneRuntimeSession`.

➡️ **Chosen:** **Factory + interface** (`createSceneRuntimeSession`), mirroring `createWorkspaceEditorSession`. Class optional internally; **not** a React hook (would re-export ~15 refs).

---

**Q3 — What is the public interface size?**  
Avoid shallow “pass-through” with 40 parameters.

➡️ **Chosen:** Three injected buckets:
1. **`SceneRuntimeSessionConfig`** — `world`, `restartKey`, `container`, frozen snapshot of restart inputs.
2. **`SceneRuntimeHostCallbacks`** — React setters (scene, camera, renderer, bootstrap, errors, HUD, snackbar, registry epoch).
3. **`SceneRuntimeRuntimeDeps`** (Phase 1+) — testable adapters: `loadWorld`, `createPhysicsWorld`, `RenderItemRegistry.create`, `installBuilderPickAndGizmo`, timers (`requestAnimationFrame`), optional Rapier import.

`SceneRuntimeSession`: **`start()`**, **`dispose()`**, **`generation`**, read-only **`handles`** bag for imperative API (refs populated after load).

---

**Q4 — Is extraction justified (deletion test)?**  
Would deleting the module scatter complexity?

➡️ **Chosen:** **Yes.** Today one effect owns load, GPU, physics async, registry, scripts, rAF, resize, gizmo install, prefetch, and cleanup. Moving it to a runtime module gives **locality**; SceneView keeps **leverage** via a 2-call lifecycle.

---

### Round 2 — Restart policy and dependency key

**Q5 — What triggers full restart vs incremental?**  
Must stay aligned with [feature-world-update-reload.md](./feature-world-update-reload.md).

➡️ **Chosen:** **No change** to product rules. Full restart when `buildSceneRuntimeRestartKey(...)` changes (mirrors current `useEffect` deps). Incremental entity/world edits stay on `syncWorldEntities` and sibling effects.

---

**Q6 — How to encode restart deps?**  
`sceneKey` from `getSceneDependencyKey(world)` plus React `version` prop plus render-quality flags and `playMode`.

➡️ **Chosen:** Pure **`buildSceneRuntimeRestartKey`** in `sceneRuntimeSession.ts` (implemented Phase 0). SceneView passes the same fields it already puts in the effect dependency array (excluding stable refs).

---

**Q7 — Does `world.version` string vs Builder `version` number confuse the session?**  
`sceneKey` already includes document `world.version`; Builder also passes numeric `version` from `ProjectContext.bumpVersion()`.

➡️ **Chosen:** Session config carries **`sceneVersion`** (React prop) separately from **`world`**; both participate in `restartKey`. Document in interface comments.

---

### Round 3 — Async, cancellation, and refs

**Q8 — Stale `loadWorld` / Rapier completion?**  
Current pattern: `effectIdRef` increment + `cancelled` flag.

➡️ **Chosen:** Session owns **`generation`** incremented on each `start()`; all async continuations check `generation` before mutating handles or calling host callbacks. On `dispose()`, set **`cancelled`** first (same order as today).

---

**Q9 — Who owns long-lived refs (`physicsRef`, `registryRef`, …)?**  
Imperative handle and incremental effects read them today.

➡️ **Chosen:** Session implementation mutates a **`SceneRuntimeHandleBag`** object passed in config (same ref objects SceneView already holds). React component **retains ref declarations**; session **writes** them during load/teardown. Avoids moving `useImperativeHandle` in early phases.

---

**Q10 — React state vs refs for camera/renderer/scene?**  
SceneView uses `useState` for re-renders (child hooks, overlays).

➡️ **Chosen:** Session calls **`host.setScene` / `setCamera` / `setRenderer`** (unchanged). No `useSyncExternalStore` migration in this project.

---

### Round 4 — Frame loop and builder wiring

**Q11 — Move rAF loop into session or separate module?**  
`runSceneFrame` already extracted.

➡️ **Chosen:** Session **owns rAF scheduling** and semi-fixed accumulator **orchestration** only; **`runSceneFrame` stays imported**, not duplicated. **Do not** split transformer/registry hot paths.

---

**Q12 — Builder pick/gizmo / texture paint?**  
Large inline closure `installPickGizmoIfBuilder`.

➡️ **Chosen:** Phase 4 moves it as a **private method** inside session implementation, still calling **`installBuilderPickAndGizmo`** from `@/editor/transformGizmoController`. Deps injected via config closure reading refs (same as today).

---

**Q13 — Global bridges (`setTransformerSnackbarFn`, overlay fns)?**  
Set during load, cleared on teardown.

➡️ **Chosen:** Session sets/clears in **`start` success path** and **`dispose`** (same timing as effect). Host callbacks cover React snackbar state; module-level setters stay in session.

---

### Round 5 — Testing and phased delivery

**Q14 — Phase 0 test surface?**  
Interface-only module vs integration.

➡️ **Chosen:** **Dual surface:**
- **`SceneView.test.tsx`** — mount/teardown, `sceneKey` / `version` reload, excluded-field no-reload, stale async dispose (characterization at React seam).
- **`sceneRuntimeSession.test.ts`** — `buildSceneRuntimeRestartKey` + stub lifecycle contract.

Future phases add **`sceneRuntimeSession.test.ts`** fakes for `loadWorld`/physics (in-memory), not full WebGL.

---

**Q15 — Phase 0 code move?**  
User forbids moving 600-line body.

➡️ **Chosen:** Types + `buildSceneRuntimeRestartKey` + **`createSceneRuntimeSessionStub`** only; SceneView **unchanged** until Phase 1.

---

**Q16 — Wire stub in SceneView in Phase 0?**  
Could call stub alongside effect.

➡️ **Chosen:** **No** — avoids double-bootstrap; Phase 1 replaces effect body with real session.

---

### Round 6 — Incremental effects and Play/Builder parity

**Q17 — Which effects stay in SceneView?**  
Gravity, shadows, pixel ratio, directional shadow bounds, camera config + avatar sync, overlay re-bridge, selection → gizmo sync.

➡️ **Chosen:** **All remain in SceneView** after extraction. Session exposes stable handles; those effects keep reading `physicsRef`, `renderer`, `scene`, `cameraCtrlRef`, etc.

---

**Q18 — `playMode` in restart key?**  
Effect depends on `playMode`; toggling rebuilds overlays/gizmo policy.

➡️ **Chosen:** **Keep** `playMode` in restart key (no behaviour change).

---

**Q19 — Performance regression gate?**  
Moving warm-up / prefetch / texture decode.

➡️ **Chosen:** Phases that touch **`warmUpRendererTextures`** or **`scheduleMaterialTextureDecodePrefetch`** require before/after manual smoke + existing integration tests; **warn twice** before removing or deferring warm-up.

---

### Round 7 — Frontier closure

**Q20 — Single PR or phased?**  
Size and risk.

➡️ **Chosen:** **Phased AFK** (below); one phase per L3 worker; each phase green on vitest + tsc.

**Q21 — Documentation updates?**  
➡️ **Chosen:** This file + audit row; update `feature-world-update-reload.md` only when SceneView adapter actually switches (Phase 1+).

**Frontier:** empty.

---

## Deep module interface sketch

```typescript
// src/runtime/sceneRuntimeSession.ts (evolving)

export interface SceneRuntimeSession extends SceneRuntimeHandles {
  start(): void
  dispose(): void
}

export function buildSceneRuntimeRestartKey(inputs: SceneRuntimeRestartInputs): string

export function createSceneRuntimeSession(
  config: SceneRuntimeSessionConfig,
  deps: SceneRuntimeRuntimeDeps,
): SceneRuntimeSession
// Phase 1+: real implementation
// Phase 0: createSceneRuntimeSessionStub for contract tests only
```

**Lifecycle**

1. SceneView effect: `restartKey = buildSceneRuntimeRestartKey(...)`; if changed, `previousSession?.dispose()`; `session = createSceneRuntimeSession(...)`; `session.start()`.
2. **`start()`:** dispose prior resolver, reset host UI flags, `loadWorld` → on success attach camera/renderer/scripts/physics/registry/rAF/resize (today’s `.then` body).
3. **`dispose()`:** mirror today’s cleanup return block (cancel rAF, physics dispose, registry clear, DOM teardown, save camera session ref on host-owned ref).

**Injected deps (Phase 1+ `SceneRuntimeRuntimeDeps`)**

| Dep | Role |
|-----|------|
| `loadWorld` | Async scene + entities + resolver |
| `createPhysicsWorld` | Rapier bootstrap |
| `createRegistry` | `RenderItemRegistry.create` |
| `runSceneFrame` | Per-tick body (already module) |
| `installBuilderPickAndGizmo` | Editor picking |
| `schedulePrefetch` / `warmUpTextures` | GPU warm-up |
| `now`, `requestAnimationFrame`, `cancelAnimationFrame` | Test fakes |

---

## React vs runtime split

| Stays in `SceneView.tsx` | Moves to `SceneRuntimeSession` |
|--------------------------|--------------------------------|
| Props, JSX, overlays, HUD, ErrorBoundary children | `loadWorld` pipeline + success handler |
| `useImperativeHandle` (reads handle bag refs) | rAF loop + semi-fixed accumulator wiring |
| Incremental effects (gravity, shadows, camera, fog planes) | Physics async branch + registry create |
| `useSkyDome`, `useWorldAudio`, `useSceneFullscreen` | ScriptRunner + AvatarSession construction |
| Ref **declarations** for imperative API | ResizeObserver + window resize |
| `sceneKey` / `buildSceneRuntimeRestartKey` call | Pick/gizmo install, prefetch disposer |
| Selection/gizmo/overlay **re-bridge** effects | Teardown ordering + generation guards |
| `syncWorldEntitiesRef` implementation (until later phase) | Asset resolver dispose on cancel/restart |

---

## AFK phases (`composer-2.5-fast`)

### Phase 0 — Characterization + seam (DONE)

| | |
|--|--|
| **OWNED** | `src/runtime/sceneRuntimeSession.ts`, `src/runtime/sceneRuntimeSession.test.ts`, `src/components/SceneView.test.tsx`, this doc, `agent-context/codebase-cleanup-audit.md` |
| **DO NOT TOUCH** | SceneView main effect body, `executeTransformers`, `renderItemRegistry` hot paths, `sceneFrameLoop` internals |
| **Exit** | Restart-key tests + SceneView reload/dispose tests green; stub factory documented |
| **Tests** | `npx vitest run src/runtime/sceneRuntimeSession.test.ts src/components/SceneView.test.tsx`, full suite, `tsc` |

### Phase 1 — Adapter shell

| | |
|--|--|
| **OWNED** | `SceneView.tsx` (effect wrapper only), `sceneRuntimeSession.ts` (real `createSceneRuntimeSession` delegating to extracted helpers) |
| **DO NOT TOUCH** | Behaviour inside effect — **move verbatim** into session private functions; no refactors |
| **Exit** | Effect ≤ ~30 lines; single session instance per restart key; all SceneView tests pass |
| **Tests** | Full vitest + tsc |

### Phase 2 — Load path extraction (DONE)

| | |
|--|--|
| **OWNED** | `sceneRuntimeSession.ts`, `sceneRuntimeSessionLoad.ts` |
| **DO NOT TOUCH** | Teardown block (still in effect or stubbed passthrough), registry/physics |
| **Exit** | Camera, renderer, CSS2D, script runner, warm-up in session; generation guards on load |
| **Tests** | + session unit tests with fake `loadWorld`; SceneView tests |

**Artifacts:** `executeSceneRuntimeLoadPath`, `runSceneRuntimeGpuWarmUp`, exported `isStaleSceneRuntimeLoadGeneration` / `disposeAssetResolverIfStaleLoadWorld` for guard characterization.

### Phase 3 — Physics + registry async (DONE)

| | |
|--|--|
| **OWNED** | `sceneRuntimeSession.ts`, minimal SceneView diff |
| **DO NOT TOUCH** | `rapierPhysics` step/touching paths; `RenderItemRegistry.create` signature |
| **Exit** | Parity on `runPhysics` true/false; `restoreInitialPosesIntoRegistry`; `setRegistryEpoch` |
| **Tests** | `restoreInitialPoses.test.ts`, SceneView with mocked Rapier import |

**Artifacts:** `runSceneRuntimePhysicsAndRegistry`, `canApplySceneRuntimeRegistryGeneration` in `sceneRuntimeSessionPhysics.ts`; stale physics uses `isStaleSceneRuntimeLoadGeneration` (same predicate as pre-extract).

### Phase 4 — rAF + resize + gizmo install (DONE)

| | |
|--|--|
| **OWNED** | `sceneRuntimeSession.ts`, `sceneRuntimeSessionFrame.ts` |
| **DO NOT TOUCH** | `runSceneFrame` / `planSemiFixedPushFrames` implementations |
| **Exit** | Frame loop moved; `installPickGizmoIfBuilder` inside session; avatar keydown listener |
| **Tests** | `sceneFrameLoop.test.ts`, SceneView builder-props smoke |

**Artifacts:** `installSceneRuntimeBuilderPickGizmo`, `scheduleSceneRuntimeFrameLoop`, `installSceneRuntimeResizeHandling`, `installSceneRuntimeAvatarCycleKeydown` in `sceneRuntimeSessionFrame.ts`.

### Phase 5 — Teardown parity + cleanup (DONE)

| | |
|--|--|
| **OWNED** | `sceneRuntimeSession.ts`, `sceneRuntimeSessionTeardown.ts`, delete dead code from SceneView |
| **DO NOT TOUCH** | Incremental SceneView effects |
| **Exit** | Effect body gone; camera save to `savedCameraStateRef` preserved; no leak warnings in tests |
| **Tests** | Full vitest; optional `shadow-follow-camera` integration |

**Artifacts:** `disposeSceneRuntimeSession` — legacy SceneView teardown order (physics ref nulled before rAF cancel; registry cleared before `pw.dispose()`); unit tests for order + camera save.

### Phase 6 — Docs + audit closure (DONE)

| | |
|--|--|
| **OWNED** | `feature-world-update-reload.md` (SceneView bullet), audit table line counts |
| **Exit** | Audit marks SceneView effect **done**; line count updated |
| **Tests** | Full vitest + tsc (baseline: 225 files / 2019 passed / 3 skipped) |

**Closure metrics:** `SceneView.tsx` **906** lines; main restart `useEffect` **~35** lines; runtime modules **~1226** LOC (`sceneRuntimeSession.ts` + load/physics/frame/teardown).

---

## Phase 0 artifacts

- `src/runtime/sceneRuntimeSession.ts` — restart key, host/session types, stub factory
- `src/runtime/sceneRuntimeSession.test.ts` — key + stub tests
- Extended `SceneView.test.tsx` — reload/dispose characterization

---

## Leftover / risks

| Item | Notes |
|------|--------|
| **LEFTOVER** | `restartKey` on session config unused at runtime (config carries it for parity/tests only) |
| **Done (2026-09-19)** | World `shadowsEnabled` excluded from `buildSceneRuntimeRestartKey` — SceneView incremental shadow effect only (no pose reset on toggle) |
| **RISK** | Phase 3 async Rapier race regressions — keep generation checks byte-for-byte equivalent |
| **RISK** | Double-dispose on asset resolver if both host and session dispose — match current ordering |
| **RISK** | Imperative handle reads null refs during bootstrap — unchanged window |

---

## Related docs

- [feature-world-update-reload.md](./feature-world-update-reload.md)
- [codebase-cleanup-audit.md](./codebase-cleanup-audit.md) — SceneView row
- [codebase-cleanup-history.md](./codebase-cleanup-history.md) — Phase 10 notes
