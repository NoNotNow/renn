# Coding tab & custom transformers — status & follow-ups

Working document to align on **what shipped**, **what is thin**, and **what to improve next** (API reference, user-facing docs, tests). Pair with [feature-transformers.md](feature-transformers.md) and [feature-scripting.md](feature-scripting.md).

---

## Scope

Right sidebar **Code** drawer (Builder): **Transformers** | **Transformer code** | **Scripts** (middle segment: custom Monaco). This file focuses on the **Transformer code** segment and **`type: "custom"`** transformers: naming, Monaco authoring, live edit path, and the runtime **`api`** surface.

---

## Implemented (current)

### UX & layout

- **Three segments** in [`CodingTabPanel.tsx`](../src/components/CodingTabPanel.tsx): Transformers, Transformer code, Scripts. Tab strip uses `role="tablist"` / `tab` / `tabpanel`, accent underline for active tab, content-sized tab labels (`flex: 0 0 auto`, `whiteSpace: nowrap`), strip background aligned with [`SidebarTabs`](../src/components/SidebarTabs.tsx). The active segment is persisted (`localStorage` key `builderCodingPanelSubTab`) so switching away from the Code drawer restores it; with no saved value it defaults to **Transformers**.
- **Transformer code** segment via [`CustomTransformerCodeTab.tsx`](../src/components/CustomTransformerCodeTab.tsx):
  - Dropdown of `custom` rows by **stack index** (label from **`name`**).
  - **Name** field (blur commit); uniqueness among customs on the entity via [`customTransformerNaming.ts`](../src/transformers/customTransformerNaming.ts).
  - **Add custom**; **priority**; **Params (JSON)**; **LED-style enabled** toggle.
  - **Monaco** code: **debounced live commit** (~350 ms) to world; undo primed on first edit per selection; flush pending code when switching selected custom row.
  - **Resizable code height**: drag handle under the Monaco surface (horizontal separator, `ns-resize`).
  - **Pop out**: **Pop out** beside the Code label opens Monaco plus compile/runtime error panels in **`createPortal`**. The portal **container** is **`document.fullscreenElement` when native fullscreen is active** (otherwise the overlay would not paint) and **`document.body` otherwise** so Monaco stays aligned with auxiliary DOM such as **`monaco-area-container`** (overflow widgets appended under `document.body`; nesting the portal only inside the Builder column desynchronizes sizing and can collapse to ~1×1). Reactive on fullscreenchange. **Pop out** also **collapses left and right drawers** (same closed state as entering fullscreen); toggles keep working afterward. Softer full-bleed dim ([`theme.bg.modalBackdropSoft`](../src/config/theme.ts)) on the viewport region **below the Builder header** (`#builder-app-header`; height tracked with **`ResizeObserver`**). The pop-out shell is **edge-to-edge** in that region using [**`theme.bg.modalGlass`**](../src/config/theme.ts) (body) and **`theme.bg.modalGlassHeader`** (header strip: title, **restore saved position and rotation** icon matching the right sidebar tab strip, **window opaque toggle** (toggles between frosted glass and solid background), **Refresh editor**, **×**), **without** backdrop blur, **Escape** (without Shift) / backdrop click / header **×** / **Dock editor** flushes pending code (same as tab switch) and closes **without** clearing entity selection (global Builder **Escape** is suppressed for that keydown); **Shift+Escape** on this segment (when focus is not in an editable control) reopens the same pop-out. Inline editor is replaced by a short placeholder until docked.
  - **Compile errors**: forbidden patterns and `new Function` parse/compile failures from [`validateCustomTransformerSource`](../src/transformers/customCodeTransformer.ts) are shown in a panel **below** the code block.
  - **Runtime errors**: uncaught exceptions inside `transform()` publish to [`customTransformerErrorBridge`](../src/runtime/customTransformerErrorBridge.ts) when the instance has `runtimeEntityId` / `configStackIndex` (set by [`createTransformerChain`](../src/transformers/transformerRegistry.ts)); the **Transformer code** tab shows a **Runtime error** panel (amber) for the matching selection and stack row with **expandable Stack trace** and **Transformer code** (authoring source from the failing runtime instance). Right-click copies plain text: message, stack, then a `---` / `Transformer code` section with the full source for bug reports. A successful frame clears the stored error for that target. Duplicate snapshots (same entity, stack index, message, stack trim, and code) are not re-notified every frame.
- **Transformers** segment unchanged as full stack editor (reorder, all presets, **Apply code** for custom rows there).

### Data & migration

- **`TransformerConfig.name`** (optional) in [`types/transformer.ts`](../src/types/transformer.ts); [`world-schema.json`](../world-schema.json).
- **`migrateCustomTransformerNames`** in [`migrateWorld.ts`](../src/scripts/migrateWorld.ts): assigns `Custom`, `Custom 2`, … to legacy nameless `custom` rows **per entity** in stack order.
- Migration invoked from [`loadWorld.ts`](../src/loader/loadWorld.ts), [`loadWorldFromStatic.ts`](../src/loader/loadWorldFromStatic.ts), [`indexedDb.ts`](../src/persistence/indexedDb.ts), [`Play.tsx`](../src/pages/Play.tsx).

### Runtime

- **Full function authoring**: `TransformerConfig.code` now stores the complete function definition: `function transform(input, dt, params, state, api) { … }`. The runtime detects `function transform(` in the source; legacy body-only code (bare `return` statements) is still wrapped automatically for backward compat.
- **`TRANSFORMER_RUNTIME_API`**: frozen singleton passed every frame; **`api.vec`** groups tuple vector helpers (`getForwardVector`, `getUpVector`, `dot`, `length`, `add`, `scale`, `getForwardSpeed`); top-level `getForwardVector` / `getUpVector` / `addVec3` / `scaleVec3` use the same math as `api.vec.*` (see table below). Invalid arguments throw **`Error`** messages prefixed with **`[TransformerRuntimeApi.…]`** (e.g. expected tuple shape vs. what was passed)—cheap checks only at this boundary; internal helpers stay unchanged.
- **`api.log`**: calls the play-mode snackbar (wired via `setTransformerSnackbarFn` from `SceneView`; no-op in tests unless explicitly wired). `durationSeconds` defaults to 4.
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
| `scaleVec3` | `(v, s) → Vec3` | Scale all components by s (same as `api.vec.scale`). |
| `vec.getForwardVector` | `(rotation) → Vec3` | Same as `getForwardVector`. |
| `vec.getUpVector` | `(rotation) → Vec3` | Same as `getUpVector`. |
| `vec.dot` | `(a, b) → number` | Dot product. |
| `vec.length` | `(v) → number` | Euclidean length. |
| `vec.add` | `(a, b) → Vec3` | Component-wise sum. |
| `vec.scale` | `(v, s) → Vec3` | Scale all components by s. |
| `vec.getForwardSpeed` | `(velocity, forward) → number` | Signed speed along `forward` (dot product); prefer unit `forward` from `getForwardVector`. |
| `clamp` | `(value, min, max) → number` | Inclusive clamp. |
| `eulerDeltaAroundAxis` | `(currentRotation, axis, angleRad) → Rotation` | Euler delta for yaw-like turns around a world axis. |
| `log` | `(message, durationSeconds?) → void` | Show message in play-mode snackbar. Default duration: 4 s. Wired via `setTransformerSnackbarFn` from `SceneView`; no-op otherwise. |
| `visualize` | `(value, color, name, index) → void` | Builder only: push a numeric sample to the variable overlay (`api.visualize(0.7, '#ff4444', 'speed', 1)`). `color` fills the bar; labels are white. Requires finite `value`, string `color`/`name`, and integer **`index` 1–16** (see `VARIABLE_OVERLAY_MAX_INDEX`); invalid args throw **`[TransformerRuntimeApi.visualize]`**. Requires Visualize gizmo mode + single selection + wired bridge to display. No-op in Play/tests when unwired (after args are validated). |
| `getWorldPosition` | `(id) → Vec3 \| null` | Live position from physics cache or mesh during `executeTransformers` (same as registry `getPosition`). Null when unwired or unavailable. No `getEntity` snapshot allocation. |
| `getStartPosition` | `(id) → Vec3 \| null` | Persisted `entity.position` from world JSON (spawn/start). Null when unwired, unknown id, or missing/invalid position. Independent of live physics. |
| `getEntity` | `(id) → LiveWorldEntity \| undefined` | Shallow snapshot of persisted fields plus **`getLivePosition(): Vec3 \| null`**. Prefer **`getWorldPosition`** / **`getStartPosition`** on hot paths. Undefined when the id is missing or entity lookup is unwired. |

**Intention:** Port **car2-style** logic gradually without pasting all of [`car2Transformer.ts`](../src/transformers/presets/car2Transformer.ts). Not every `BaseTransformer` helper is exposed yet; extend deliberately.

---

## Documentation gaps (to shape together)

### API / contributor docs

- **Single consolidated reference** for custom transformer authoring: full `TransformInput` / `TransformOutput` field semantics, environment flags, **`api`** JSDoc parity with runtime (parameter meanings, units, when `supportVelocity` is set).
- **Changelog-style note** for breaking changes: old bodies (bare `return` statements) wrapped automatically; new canonical format is a named `function transform(input, dt, params, state, api)` definition; legacy code still runs via auto-detection.
- **Security / sandbox**: documented forbidden patterns in `compileCustomTransform` and why (`Function`, `eval`, etc.).
- **Cross-link** from [feature-transformers.md](feature-transformers.md) “Custom code” section to this doc once API section is stable (avoid duplication drift).

### User-facing docs

- **Builder walkthrough**: Transformers vs Transformer code vs Scripts; when to use **Add custom** in Transformer code vs **custom (code)** in Transformers; how **names** appear in JSON and in UI; **live edit** vs **Apply code** in Transformers tab.
- **Recipe / snippet library**: minimal impulse example, “grounded only” pattern, pointer to **car2** preset for full vehicle behavior.
- **Troubleshooting**: compile error vs runtime warning in console; empty `{}` output; performance expectations (heavy code per step).

---

## Testing gaps (to implement later)

| Area | Idea |
|------|------|
| **CustomTransformerCodeTab** | Debounced commit updates `transformers`; switching row flushes draft; rename uniqueness; LED toggles `enabled`. |
| **Integration** | Builder `handleEntityTransformersChange` / `syncEntityTransformers` path after Code-tab code edit (scene key unchanged). |
| **E2E (Playwright)** | Open Code drawer, **Transformer code** subtab (middle), edit custom, optional play-mode smoke. |
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

## Key file index

| Concern | File |
|---------|------|
| Live trace bridge (Builder) | [`transformerTraceBridge.ts`](../src/runtime/transformerTraceBridge.ts) |
| Custom runtime errors (Builder Transformer code tab) | [`customTransformerErrorBridge.ts`](../src/runtime/customTransformerErrorBridge.ts) |
| Trace serialization + activity rules | [`transformerTrace.ts`](../src/transformers/transformerTrace.ts) |
| Tab shell | [`CodingTabPanel.tsx`](../src/components/CodingTabPanel.tsx) |
| Code segment UI | [`CustomTransformerCodeTab.tsx`](../src/components/CustomTransformerCodeTab.tsx) |
| Monaco editor widget | [`TransformerCustomCodeEditor.tsx`](../src/components/TransformerCustomCodeEditor.tsx) (`layout: fixed` + resize handle; `fill` for pop-out flex height) |
| Full stack editor | [`TransformerEditor.tsx`](../src/components/TransformerEditor.tsx) |
| Compile + `api` | [`customCodeTransformer.ts`](../src/transformers/customCodeTransformer.ts) |
| Monaco `.d.ts` | [`transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) |
| Names / uniqueness | [`customTransformerNaming.ts`](../src/transformers/customTransformerNaming.ts) |
| Load-time migration | [`migrateWorld.ts`](../src/scripts/migrateWorld.ts) |
| Sidebar host | [`PropertySidebar.tsx`](../src/components/PropertySidebar.tsx) |
