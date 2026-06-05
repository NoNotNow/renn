# Coding tab & custom transformers — status & follow-ups

Working document to align on **what shipped**, **what is thin**, and **what to improve next** (API reference, user-facing docs, tests). Pair with [feature-transformers.md](feature-transformers.md) and [feature-scripting.md](feature-scripting.md).

---

## Scope

**Workspace** Transformers tab (Builder): the horizontal pipeline strip for editing the transformer chain, with Monaco for custom (`type: "custom"`) stages. The right sidebar **CodingTabPanel** shows transformer name-lists only; clicking a name opens the Workspace. This file focuses on **`type: "custom"`** transformers: naming, Monaco authoring, live edit path, and the runtime **`api`** surface.

---

## Implemented (current)

### UX & layout

- **CodingTabPanel** (`src/components/CodingTabPanel.tsx`): Right sidebar Code drawer — **name-lists only** (transformer IDs, script IDs). Active sub-tab persisted as `builderCodingPanelSubTab` in `localStorage`; defaults to Transformers. Clicking any name opens the Workspace anchored to that item.
- **Workspace** (`src/components/Workspace.tsx`): Full-screen overlay. **Shift+Escape** opens it; **Escape** closes it. Opening collapses left and right drawers. Portal container is `document.fullscreenElement` when native fullscreen is active, `document.body` otherwise (see the [pop-out post-mortem](#transformer-code-pop-out--post-mortem--contributor-warning) for the rationale). Glass shell header: reset-all-entities icon, stop/resume game, opaque toggle, ×. Per-selection restore saved pose remains on the PropertySidebar tab row.
- **Workspace Transformers tab** (`src/components/workspace/WorkspaceTransformersTab.tsx`): Horizontal pipeline strip (reorder, enable, drag, Configure drawer JSON including `name` / priority / `params` for custom stages), live trace on pipeline cards, preset **Load template** + **Field reference**, Monaco when a **custom** stage is selected. **Params (JSON)** for custom stages only, via the pipeline gear drawer. The transformer stack trace scrolls horizontally in the Workspace header.
  - **Documentation split**: drag the `ew-resize` separator (`data-testid="custom-transformer-code-popout-docs-split"`) to resize Monaco vs. `TransformerDocsContent`; width persisted as `rennWorkspaceTransformerDocsWidthPx`.
  - **Compile errors**: forbidden patterns and `new Function` failures shown in a panel below Monaco.
  - **Runtime errors**: uncaught exceptions publish via [`customTransformerErrorBridge`](../src/runtime/customTransformerErrorBridge.ts) (one entry per entity + stack index so multiple stages can error at once); pipeline cards show a runtime border on every failing stage. The selected custom stage shows an amber **Runtime error** overlay with expandable stack trace while the error is active; after it stops, the overlay stays visible briefly with a green border so it is clear the fault cleared. Right-click copies plain text for bug reports. A successful frame clears the stored error for that target only.

### Data & migration

- **`TransformerConfig.name`** (optional) in [`types/transformer.ts`](../src/types/transformer.ts); [`world-schema.json`](../world-schema.json).
- **`migrateCustomTransformerNames`** in [`migrateWorld.ts`](../src/scripts/migrateWorld.ts): assigns `Custom`, `Custom 2`, … to legacy nameless `custom` rows **per entity** in stack order.
- Migration invoked from [`loadWorld.ts`](../src/loader/loadWorld.ts), [`loadWorldFromStatic.ts`](../src/loader/loadWorldFromStatic.ts), [`indexedDb.ts`](../src/persistence/indexedDb.ts), [`Play.tsx`](../src/pages/Play.tsx).

### Runtime

- **Full function authoring**: `TransformerConfig.code` now stores the complete function definition: `function transform(input, dt, params, state, api) { … }`. The runtime detects `function transform(` in the source; legacy body-only code (bare `return` statements) is still wrapped automatically for backward compat.
- **`TRANSFORMER_RUNTIME_API`**: frozen singleton passed every frame; **`api.vec`** groups tuple vector helpers (`getForwardVector`, `getUpVector`, `dot`, `length`, `add`, `scale`, `getForwardSpeed`); top-level `getForwardVector` / `getUpVector` / `addVec3` / `scaleVec3` use the same math as `api.vec.*` (see table below). Invalid arguments throw **`Error`** messages prefixed with **`[TransformerRuntimeApi.…]`** (e.g. expected tuple shape vs. what was passed)—cheap checks only at this boundary; internal helpers stay unchanged.
- **`api.log`**: calls the play-mode snackbar (wired via `setTransformerSnackbarFn` from `SceneView`; no-op in tests unless explicitly wired). `durationSeconds` defaults to 4.
- **`api.watch`**: publishes a labeled value to the Workspace **Watch** panel when Builder has Workspace open with a single selected entity (`transformerWatchBridge`). Updates only when `watch()` is called; stale labels from prior simulation runs remain until **Clear**. No-op when the bridge is disabled.
- **`api.visualize`**: records overlay samples when Builder **Visualize** gizmo mode is active, the bridge is wired from `SceneView`, and the publishing entity matches the single selection (`variableOverlayBridge` + `publishVariableValue`). No-op in Play mode and tests by default.
- **Sanitization**: non-finite / invalid `TransformOutput` fields stripped.
- **`effectiveCustomTransformerCode`** + **default skeleton**: minimal `function transform(...)` with **inline `/** @type {…} */` on each parameter** (and `@returns`) so Monaco completions work immediately; body is a **`//your code goes here`** placeholder and **`return {  };`**. New **custom** presets use empty **`params: {}`** in [`transformerPresets.ts`](../src/transformers/transformerPresets.ts). For **`api.visualize`** patterns (plot every tick even in the air), call **`api.visualize`** before any `isTouchingObject` early-return in your own code — see tests in [`customCodeTransformer.test.ts`](../src/transformers/customCodeTransformer.test.ts).

### Monaco / IntelliSense

- [`transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts): type declarations for `Vec3`, `TransformInput`, `TransformOutput`, `TransformerVecApi`, `TransformerRuntimeApi` (including **`getAction`**, **`log`**, **`visualize`**, **`getWorldPosition`**, **`getStartPosition`**, **`getEntity`** → **`LiveWorldEntity`** / **`WorldEntity`** fields + **`getLivePosition()`**, and **`vec`**). **`declare const` globals** still apply for legacy **body-only** snippets. For **`function transform(…)`**, local parameters shadow those globals: without JSDoc, `input` / `api` stay **implicit `any`** — use **inline `/** @type {TransformInput} */` before `input`** (and likewise for **`TransformerRuntimeApi` on `api`**) or a matching **`@param` block**. Use **`api.vec.*`** for grouped vector helpers; **`input.velocity`** is a tuple, not an object with methods. Default skeleton ships with inline `@type` so autocomplete works without extra authoring.

### Tests (existing)

- [`migrateWorld.test.ts`](../src/scripts/migrateWorld.test.ts) — custom name migration.
- [`customTransformerNaming.test.ts`](../src/transformers/customTransformerNaming.test.ts).
- [`customCodeTransformer.test.ts`](../src/transformers/customCodeTransformer.test.ts) — legacy body, `api` / `api.vec` usage, default snippet behavior, `validateCustomTransformerSource`, runtime error bridge (`publish` / clear on success), runtime API argument validation (`[TransformerRuntimeApi.…]` errors).
- [`transformerRegistry.test.ts`](../src/transformers/transformerRegistry.test.ts) — custom + `api` factory path.
- [`CodingTabPanel.test.tsx`](../src/components/CodingTabPanel.test.tsx) — Transformer code tab controls (with `CopyProvider` + `EditorUndoProvider`); invalid custom code surfaces compile error under the editor.

---

## Transformer code pop-out — post-mortem / contributor warning

**Blunt summary:** A long stretch of work on the **Pop out** flow (portal root vs fullscreen, **`collapseSideDrawers`** interacting with sidebar mount/unmount, Monaco **`layout()`** timing, always-mounted portal + **`display:none`**, etc.) **did not fix** the real-browser problems (overlay invisible or wrong on first open, fullscreen weirdness). From a delivery perspective that effort was **mostly wasted** until someone invests in **Playwright + real Monaco + real fullscreen** and stops trusting Vitest/JSDOM alone. **Plain language:** contributors have described this stretch as a total mess — keep this section so nobody repeats the same loop expecting unit tests to validate it.

**What went wrong**

- **False confidence:** [`CodingTabPanel.test.tsx`](../src/components/CodingTabPanel.test.tsx) mocks **`@monaco-editor/react`** and cannot reproduce Chrome fullscreen, top-layer stacking, WebGL-adjacent layout, or Monaco WASM behavior.
- **Layered hypotheses:** Each fix addressed one plausible cause (e.g. portal under **`document.body`** vs **`fullscreenElement`**; **`Sidebar`** `{isOpen && children}` **unmounting** the tab when **`collapseSideDrawers`** closed the drawer — that interaction was real but **not sufficient** for a stable pop-out). The rabbit hole kept deepening without an automated GUI repro.
- **Revert:** Those experiments were **reverted** (do not assume any specific mitigation is still in **`Sidebar.tsx`**, **`CustomTransformerCodeTab.tsx`**, or **`TransformerCustomCodeEditor.tsx`** — verify git). If anything resembling **`Sidebar`** “keep mounted when closed” or Monaco **`onEditorReady`** still appears in the tree, treat it as **accidental drift**, not policy.

**What to do next**

- Treat pop-out as **broken or flaky** until a **Chromium E2E** (or disciplined manual script) proves otherwise.
- Prefer **`ResizeObserver` / `editor.layout()`** tied to **measured** container size *after* visibility changes, or a UX alternative (**native `<dialog>`**, dedicated window, inline maximize only), decided **after** measurement in real browsers — not from unit tests alone.

---

## Runtime `api` surface (authoritative list)

`Vec3` in custom code is always a **tuple** `[x, y, z]`. Vector *operations* are grouped under **`api.vec`** (Monaco completions on `api.vec.` when `api` is typed as `TransformerRuntimeApi`). `input.velocity` uses the same tuple shape — use `[0]`–`[2]` or pass the tuple into `api.vec.*`; tuple values do not have methods.

| Method | Signature | Purpose |
|--------|-----------|---------|
| `getAction` | `(input, name) → number` | `input.actions[name] ?? 0` |
| `getForwardVector` | `(rotation) → Vec3` | Forward unit direction from Euler (Three -Z convention). |
| `getUpVector` | `(rotation) → Vec3` | Up from Euler (+Y). |
| `addVec3` | `(a, b) → Vec3` | Component-wise sum (same as `api.vec.add`). |
| `subtractVec3` | `(a, b) → Vec3` | Component-wise difference (same as `api.vec.subtract`). |
| `scaleVec3` | `(v, s) → Vec3` | Scale all components by s (same as `api.vec.scale`). |
| `normalizeVec3` | `(v) → Vec3` | Unit direction (same as `api.vec.normalize`). |
| `vec.getForwardVector` | `(rotation) → Vec3` | Same as `getForwardVector`. |
| `vec.getUpVector` | `(rotation) → Vec3` | Same as `getUpVector`. |
| `vec.dot` | `(a, b) → number` | Dot product. |
| `vec.cross` | `(a, b) → Vec3` | Cross product **a × b** (right-handed). |
| `vec.length` | `(v) → number` | Euclidean length. |
| `vec.normalize` | `(v) → Vec3` | Unit vector; `[0,0,0]` when length is negligible. |
| `vec.add` | `(a, b) → Vec3` | Component-wise sum. |
| `vec.subtract` | `(a, b) → Vec3` | Component-wise difference (a − b). |
| `vec.scale` | `(v, s) → Vec3` | Scale all components by s. |
| `vec.getForwardSpeed` | `(velocity, forward) → number` | Signed speed along `forward` (dot product); prefer unit `forward` from `getForwardVector`. |
| `vec.projectOntoPlane` | `(vec, planeNormal) → Vec3` | Project onto plane ⊥ normal (entity up for slope-relative horizontal math; `[0,1,0]` for world XZ). |
| `vec.rotateAroundAxis` | `(vec, axis, angle) → Vec3` | Rotate vector by `angle` radians around `axis` (entity up for path-finding on slopes). |
| `vec.offsetAlong` | `(origin, direction, distance) → Vec3` | `origin + direction * distance` (probe point ahead of entity). |
| `vec.angleBetween` | `(from, to) → number` | Unsigned angle in radians (0 … π); clamps dot before `acos`. |
| `vec.signedAngleAroundAxis` | `(from, to, axis) → number` | Signed turn angle around `axis`; 0 when nearly parallel. |
| `vec.rightFromForward` | `(forward, upHint?) → Vec3` | Unit right vector ⊥ `forward` (default `upHint` = world +Y). |
| `raycast` | `(origin, fwd, maxDistance?, options?) → RaycastResult` | Physics ray; optional `{ visualize, hitColor, missColor }` in Builder Visualize mode. |
| `raycastSpread` | `(origin, direction, maxDistance, spreadWidth, rayCount, options?) → RaycastResult` | Parallel rays spread sideways; closest hit, else center ray. |
| `clamp` | `(value, min, max) → number` | Inclusive clamp. |
| `eulerDeltaAroundAxis` | `(currentRotation, axis, angleRad) → Rotation` | Euler delta for yaw-like turns around a world axis. |
| `log` | `(message, durationSeconds?) → void` | Show message in play-mode snackbar. Default duration: 4 s. Wired via `setTransformerSnackbarFn` from `SceneView`; no-op otherwise. |
| `watch` | `(value, label) → void` | Builder Workspace only: show `label: value` in the draggable Watch panel (top-right of Monaco). Updates only on call; stale labels persist until **Clear**. Requires non-empty string `label`; invalid args throw **`[TransformerRuntimeApi.watch]`**. No-op when bridge disabled (Workspace closed, multi-select, tests unless wired). |
| `visualize` | `(value, color, name, index) → void` | Builder only: push a numeric sample to the variable overlay (`api.visualize(0.7, '#ff4444', 'speed', 1)`). `color` fills the bar; labels are white. Requires finite `value`, string `color`/`name`, and integer **`index` 1–16** (see `VARIABLE_OVERLAY_MAX_INDEX`); invalid args throw **`[TransformerRuntimeApi.visualize]`**. Requires Visualize gizmo mode + single selection + wired bridge to display. No-op in Play/tests when unwired (after args are validated). |
| `getWorldPosition` | `(id) → Vec3 \| null` | Live position from physics cache or mesh during `executeTransformers` (same as registry `getPosition`). Null when unwired or unavailable. No `getEntity` snapshot allocation. |
| `getStartPosition` | `(id) → Vec3 \| null` | Persisted `entity.position` from world JSON (spawn/start). Null when unwired, unknown id, or missing/invalid position. Independent of live physics. |
| `getEntity` | `(id) → LiveWorldEntity \| undefined` | Shallow snapshot of persisted fields plus **`getLivePosition(): Vec3 \| null`**. Prefer **`getWorldPosition`** / **`getStartPosition`** on hot paths. Undefined when the id is missing or entity lookup is unwired. |

**Intention:** Port **car2-style** logic gradually without pasting all of [`car2Transformer.ts`](../src/transformers/presets/car2Transformer.ts). Not every `BaseTransformer` helper is exposed yet; extend deliberately.

---

## Documentation (in-app + agent-context)

### In-app (`TransformerDocs`, EN/DE)

- **Bundled API reference** chapter: `transform(...)` signature, `TransformInput` / `EnvironmentState` / `TransformTarget`, `TransformOutput`, `api.vec`, and top-level `api` with signatures + bilingual descriptions. Source: [`transformerApiReference.ts`](../src/components/transformerDocs/transformerApiReference.ts).
- **Prose chapters** (Overview, Examples, Troubleshooting): Markdown under [`transformerDocs/content/en`](../src/components/transformerDocs/content/en) and [`content/de`](../src/components/transformerDocs/content/de). Inline glossary links use `{{termKey|display}}`; rendered via `TransformerDocMarkdown.tsx`.
- **Glossary** tooltips: [`content/glossary.yaml`](../src/components/transformerDocs/content/glossary.yaml) (loaded in [`glossary.ts`](../src/components/transformerDocs/glossary.ts)). After editing YAML keys, run `npm run generate:glossary-keys`.
- Chapters: Overview → API reference → Glossary → Examples → Troubleshooting.

### Contributor follow-ups

- **Changelog-style note** for breaking changes: old bodies (bare `return` statements) wrapped automatically; canonical format is `function transform(input, dt, params, state, api)`; legacy code still runs via auto-detection.
- **Security / sandbox**: document forbidden patterns in `compileCustomTransform` and why (`Function`, `eval`, etc.) in troubleshooting if not already in UI.
- Keep this file’s runtime table in sync when adding `api` methods; update `transformerApiReference.ts` in the same PR.

### User-facing docs

- **Builder walkthrough**: Transformers vs Transformer code vs Scripts; when to use **Add custom** in Transformer code vs **custom (code)** in Transformers; how **names** appear in JSON and in UI; **live edit** vs **Apply code** in Transformers tab.
- **Recipe / snippet library**: minimal impulse example, “grounded only” pattern, pointer to **car2** preset for full vehicle behavior.
- **Troubleshooting**: compile error vs runtime warning in console; empty `{}` output; performance expectations (heavy code per step).

#### Recipe: synthetic actions

Same idea as the **`input`** preset: **mutate** `input.actions` (semantic names like `throttle`, `brake`, `steer_left`, `steer_right` for car stacks) and **`return {}`**. Downstream transformers (`car2`, `person`, …) read those values via `getAction` / `input.actions`.

- **Stack order:** lower **priority** runs **first**. Typical car entity: **`input`** (e.g. 0) fills actions from hardware → **`custom`** (between input and movement) overlays or replaces actions → **`car2`** applies physics. Put the custom stage **after** `input` and **before** `car2` so your writes are visible to the mover.
- **Merging:** assign only the axes you care about; unmentioned keys stay whatever the input stage set (often `0`). To **override** player input for a lane, write your values after `input` has run (higher priority than `input`).
- **Time bases:** **`new Date()`** is wall-clock (real time); it **does not** pause with Builder Play or track simulation time alone. Prefer **`state` + `dt`** for timers that advance with physics steps (accumulate `(state.timer ?? 0) + dt` in `state`, then branch). Wall-clock is fine for quick demos.

Example shape (abbreviated):

```js
/** @returns {TransformOutput | undefined} */
function transform(
  /** @type {TransformInput} */ input,
  /** @type {number} */ dt,
  /** @type {Record<string, unknown>} */ params,
  /** @type {Record<string, unknown>} */ state,
  /** @type {TransformerRuntimeApi} */ api,
) {
  state.t = (typeof state.t === 'number' ? state.t : 0) + dt;

  // Open-loop cues for a car stack (names match keyboard-car style mappings)
  if (state.t > 2 && state.t < 5) input.actions.throttle = 0.3;
  if (input.position[0] > 8) input.actions.steer_right = 1;
  else if (input.position[0] < -8) input.actions.steer_left = 1;

  return {};
}
```

Linked in-app docs: **`TransformerDocs`** (toggle **EN** / **DE**, saved as `rennTransformerDocsLocale`) → **API reference** / **Examples** / **Glossary** — code identifiers stay English; DE/EN structure matches (`content/glossary.yaml`, `content/{en,de}/*.md`, `transformerApiReference.ts`).

---

## Testing gaps (to implement later)

| Area | Idea |
|------|------|
| **Workspace Transformers tab** | Pipeline reorder + enable toggle; switching custom stage flushes draft; rename uniqueness. |
| **Integration** | Builder `handleEntityTransformersChange` / `syncEntityTransformers` path after Code-tab code edit (scene key unchanged). |
| **E2E (Playwright)** | Open Workspace, select custom stage, edit code, apply, optional play-mode smoke. |
| **Migration** | Round-trip export/import with mixed named / legacy custom stacks. |
| **`api` coverage** | One test per `TransformerRuntimeApi` / `api.vec` method against known vectors / angles (golden or tolerance). |
| **Regression** | Worlds with legacy body-only snippets (bare `return` statements) still compile and run via auto-detection. |

---

## Plan: Transformers tab — live I/O visualization (Builder)

Concise roadmap for **Transformers | Transformer code | Scripts** → **Transformers** segment ([`TransformerEditor.tsx`](../src/components/TransformerEditor.tsx)).

1. **Runtime trace (single entity, opt-in)**  
   When exactly one entity is selected and the **Transformers** sub-tab is active, record **per-step** snapshots for that entity only: `TransformInput` **before** each `transform()` call and the returned `TransformOutput`. Steps include **`configStackIndex`** (matches stack row order in the UI, not necessarily priority execution order — both are stored so we can debug ordering). **Performance:** no cloning when tracing is off; no tracing when multi-select or wrong tab.

2. **`input` transformer semantics**  
   `input` mutates `input.actions` and usually returns `{}`. The **output summary** treats **published actions** (delta on `actions`) as active the same way a non-empty `TransformOutput` is active for other transformer types.

3. **UI per stack row**  
   After configuration: **collapsed-by-default** `<details>` for input snapshot JSON and per-step `transformOutput` JSON (left-aligned). **Summary line color** replaces separate LEDs: green (`theme.status.enabled`) when that signal is active, muted when disabled / no frame, secondary when idle.

4. **Scrolling**  
   Fix Code-drawer layout so long transformer stacks scroll ([`PropertySidebar.tsx`](../src/components/PropertySidebar.tsx) `overflow: visible` vs [`CodingTabPanel.tsx`](../src/components/CodingTabPanel.tsx) tabpanel). Prefer an inner **`minHeight: 0` + `overflow: auto`** scroll region without clipping Monaco hovers where possible.

5. **Tests (TDD)**  
   Pure helpers: serialisation / “empty” output detection / input-vs-actions activity rules; **`TransformerChain.execute`** with trace collector; component test for collapsed trace summaries (`data-testid`) and active header color.

---

## Implemented addendum (live trace UI revision)

- **No separate In/Out LED dots**; activity is indicated by **summary text color** on each collapsible.
- **Custom** transformers: live trace stacks **beside** **Apply code** (Input above Output, flex fills left; Apply **bottom-right** on the same row).
- **Preset** transformers: trace stays **below** configuration with a top border.

---

## Open questions (for a follow-up session)

- Should **tab labels** or **in-app hints** spell out “custom transformer authoring” vs “Transformer code” more clearly for new users?
- **Undo coalescing** for rapid debounced commits: current behavior vs desired (single undo step per “session” vs per debounce flush).
- **`api` growth**: which `BaseTransformer` / car2 helpers to add next (e.g. shared slip logic) without bloating the object.
- **Export**: whether to enforce **unique `name`** at schema validation time vs UI-only.
- **Play mode**: any need for a **read-only** viewer of custom code (out of scope today).

---

---

## Monaco IntelliSense: Setup Notes

Key findings from implementing transformer code completion.

### Findings

1. **Monaco `javascriptDefaults` vs `typescriptDefaults`**: Editors use `language="javascript"`. Extra libs registered only on `typescriptDefaults` are **not** part of the JavaScript language service project. Registration must call **`javascriptDefaults.addExtraLib`** as well (same URI + content). Implemented in [`src/utils/monacoExtraLib.ts`](../src/utils/monacoExtraLib.ts).

2. **Why scripts felt "fine" but `transform(input, …)` did not**: Script buffers use `ctx.*` against `declare const ctx` in [`scriptCtxDecl.ts`](../src/scripts/scriptCtxDecl.ts). Custom transformer **`function transform(input, …)`** parameters **shadow** `declare const input` / `api`, so completions need **`/** @type {TransformInput} */` before `input`** (and **`TransformerRuntimeApi` on `api`**) or an equivalent **`@param` block**. The default skeleton ships **inline `@type` tags**.

3. **`api.log` "missing"**: Same root cause — untyped `api` parameter + invisible extra lib → weak `api.*` completions. Not a gap in [`transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) for `log`; it was resolution/context.

4. **Testing without headless Monaco**: Use **`ts.createLanguageService`** with a virtual file for `TRANSFORMER_CODE_EXTRA_LIB_URI` + a `.js` user file (`allowJs`, `checkJs`), then **`getCompletionsAtPosition`**. See [`src/transformers/transformerIntellisense.integration.test.ts`](../src/transformers/transformerIntellisense.integration.test.ts).

5. **Implicit `any` parameters**: If authors delete the JSDoc block, `input.` completions **lose** typed members (regression test documents this).

### Quick reference

| Need | Location |
|------|-----------|
| Dual extra-lib registration | [`src/utils/monacoExtraLib.ts`](../src/utils/monacoExtraLib.ts) |
| Declarations / `TRANSFORMER_CODE_EXTRA_LIB_URI` | [`src/transformers/transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) |
| Default skeleton + inline param @type | [`defaultCustomTransformerCode`](../src/transformers/customCodeTransformer.ts) |
| Monaco editor host | [`src/components/TransformerCustomCodeEditor.tsx`](../src/components/TransformerCustomCodeEditor.tsx) |
| Completion golden tests | [`src/transformers/transformerIntellisense.integration.test.ts`](../src/transformers/transformerIntellisense.integration.test.ts) |
| Mock unit test for registration | [`src/utils/monacoExtraLib.test.ts`](../src/utils/monacoExtraLib.test.ts) |

```bash
npm run test:run -- src/utils/monacoExtraLib.test.ts src/transformers/transformerIntellisense.integration.test.ts
```

### Implemented

- [x] Register transformer (and script) extra libs on **both** `typescriptDefaults` and `javascriptDefaults`; composite `dispose()`.
- [x] Integration tests: `input.` / `api.` on default skeleton; legacy global body; untyped-params negative case; inline `@type` positive case.
- [x] Unit test: mock Monaco verifies dual `addExtraLib` + both disposes.
- [x] Default skeleton uses **inline `@type`** (avoids fragile block comments with `*/`).

### Follow-ups

- [ ] Optional: scoped `checkJs` / diagnostics tuning only if real-app completion gaps remain after manual QA in Builder.
- [ ] E2E: avoid asserting Monaco completion menus (flaky); smoke "Workspace Transformers tab mounts" only if needed.
- [ ] Enrich `.d.ts` / snippets further (e.g. `TransformOutput` field tooltips) as API grows.

---

## Key file index

| Concern | File |
|---------|------|
| Live trace bridge (Builder) | [`transformerTraceBridge.ts`](../src/runtime/transformerTraceBridge.ts) |
| Custom runtime errors (Builder Transformer code tab) | [`customTransformerErrorBridge.ts`](../src/runtime/customTransformerErrorBridge.ts) |
| Watch panel bridge (Builder Workspace) | [`transformerWatchBridge.ts`](../src/runtime/transformerWatchBridge.ts) |
| Watch panel UI | [`TransformerWatchPanel.tsx`](../src/components/workspace/TransformerWatchPanel.tsx) |
| Trace serialization + activity rules | [`transformerTrace.ts`](../src/transformers/transformerTrace.ts) |
| Inspector name list | [`CodingTabPanel.tsx`](../src/components/CodingTabPanel.tsx) |
| Workspace shell | [`Workspace.tsx`](../src/components/Workspace.tsx) |
| Workspace Transformers tab | [`WorkspaceTransformersTab.tsx`](../src/components/workspace/WorkspaceTransformersTab.tsx) |
| Monaco editor widget | [`TransformerCustomCodeEditor.tsx`](../src/components/TransformerCustomCodeEditor.tsx) (`layout: fixed` + resize handle; `fill` for pop-out flex height) |
| Full stack editor | [`TransformerEditor.tsx`](../src/components/TransformerEditor.tsx) |
| Compile + `api` | [`customCodeTransformer.ts`](../src/transformers/customCodeTransformer.ts) |
| Monaco `.d.ts` | [`transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) |
| Names / uniqueness | [`customTransformerNaming.ts`](../src/transformers/customTransformerNaming.ts) |
| Load-time migration | [`migrateWorld.ts`](../src/scripts/migrateWorld.ts) |
| Sidebar host | [`PropertySidebar.tsx`](../src/components/PropertySidebar.tsx) |
