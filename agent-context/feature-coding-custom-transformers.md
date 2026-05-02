# Coding tab & custom transformers — status & follow-ups

Working document to align on **what shipped**, **what is thin**, and **what to improve next** (API reference, user-facing docs, tests). Pair with [feature-transformers.md](feature-transformers.md) and [feature-scripting.md](feature-scripting.md).

---

## Scope

Right sidebar **Code** drawer (Builder): **Scripts** | **Transformers** | **Code** (third segment). This file focuses on the **Code** segment and **`type: "custom"`** transformers: naming, Monaco authoring, live edit path, and the runtime **`api`** surface.

---

## Implemented (current)

### UX & layout

- **Three segments** in [`CodingTabPanel.tsx`](../src/components/CodingTabPanel.tsx): Scripts, Transformers, Code. Tab strip uses `role="tablist"` / `tab` / `tabpanel`, accent underline for active tab, content-sized tab labels (`flex: 0 0 auto`, `whiteSpace: nowrap`), strip background aligned with [`SidebarTabs`](../src/components/SidebarTabs.tsx).
- **Code segment** via [`CustomTransformerCodeTab.tsx`](../src/components/CustomTransformerCodeTab.tsx):
  - Dropdown of `custom` rows by **stack index** (label from **`name`**).
  - **Name** field (blur commit); uniqueness among customs on the entity via [`customTransformerNaming.ts`](../src/transformers/customTransformerNaming.ts).
  - **Add custom**; **priority**; **Params (JSON)**; **LED-style enabled** toggle.
  - **Monaco** code: **debounced live commit** (~350 ms) to world; undo primed on first edit per selection; flush pending code when switching selected custom row.
- **Transformers** segment unchanged as full stack editor (reorder, all presets, **Apply code** for custom rows there).

### Data & migration

- **`TransformerConfig.name`** (optional) in [`types/transformer.ts`](../src/types/transformer.ts); [`world-schema.json`](../world-schema.json).
- **`migrateCustomTransformerNames`** in [`migrateWorld.ts`](../src/scripts/migrateWorld.ts): assigns `Custom`, `Custom 2`, … to legacy nameless `custom` rows **per entity** in stack order.
- Migration invoked from [`loadWorld.ts`](../src/loader/loadWorld.ts), [`loadWorldFromStatic.ts`](../src/loader/loadWorldFromStatic.ts), [`indexedDb.ts`](../src/persistence/indexedDb.ts), [`Play.tsx`](../src/pages/Play.tsx).

### Runtime

- Compiled body signature: `function (input, dt, params, state, api) { … }` in [`customCodeTransformer.ts`](../src/transformers/customCodeTransformer.ts).
- **`TRANSFORMER_RUNTIME_API`**: frozen singleton passed every frame; thin wrappers over shared utils (see table below).
- **Sanitization**: non-finite / invalid `TransformOutput` fields stripped.
- **`effectiveCustomTransformerCode`** + **default skeleton** (params + `api` + touching gate); preset default includes `params.power` in [`transformerPresets.ts`](../src/transformers/transformerPresets.ts).

### Monaco / IntelliSense

- [`transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts): `declare const` for `input`, `dt`, `params`, `state`, **`api`** and `TransformerRuntimeApi` method typings.

### Tests (existing)

- [`migrateWorld.test.ts`](../src/scripts/migrateWorld.test.ts) — custom name migration.
- [`customTransformerNaming.test.ts`](../src/transformers/customTransformerNaming.test.ts).
- [`customCodeTransformer.test.ts`](../src/transformers/customCodeTransformer.test.ts) — legacy body, `api` usage, default snippet behavior.
- [`transformerRegistry.test.ts`](../src/transformers/transformerRegistry.test.ts) — custom + `api` factory path.
- [`CodingTabPanel.test.tsx`](../src/components/CodingTabPanel.test.tsx) — Code tab exposes controls (with `CopyProvider` + `EditorUndoProvider`).

---

## Runtime `api` surface (authoritative list)

| Method | Purpose |
|--------|---------|
| `getAction(input, name)` | `input.actions[name] ?? 0` |
| `getForwardVector(rotation)` | Forward unit direction from Euler (Three -Z convention). |
| `getUpVector(rotation)` | Up from Euler. |
| `addVec3(a, b)` | Component-wise sum. |
| `scaleVec3(v, s)` | Scale vector. |
| `clamp(value, min, max)` | Inclusive clamp. |
| `eulerDeltaAroundAxis(currentRotation, axis, angleRad)` | Euler delta for yaw-like turns around a world axis. |

**Intention:** Port **car2-style** logic gradually without pasting all of [`car2Transformer.ts`](../src/transformers/presets/car2Transformer.ts). Not every `BaseTransformer` helper is exposed yet; extend deliberately.

---

## Documentation gaps (to shape together)

### API / contributor docs

- **Single consolidated reference** for custom transformer authoring: full `TransformInput` / `TransformOutput` field semantics, environment flags, **`api`** JSDoc parity with runtime (parameter meanings, units, when `supportVelocity` is set).
- **Changelog-style note** for breaking changes: old bodies used 4-arg mental model; now **`api`** is the fifth parameter (legacy code that ignores `api` still runs).
- **Security / sandbox**: documented forbidden patterns in `compileCustomTransform` and why (`Function`, `eval`, etc.).
- **Cross-link** from [feature-transformers.md](feature-transformers.md) “Custom code” section to this doc once API section is stable (avoid duplication drift).

### User-facing docs

- **Builder walkthrough**: Scripts vs Transformers vs Code; when to use **Add custom** in Code vs **custom (code)** in Transformers; how **names** appear in JSON and in UI; **live edit** vs **Apply code** in Transformers tab.
- **Recipe / snippet library**: minimal impulse example, “grounded only” pattern, pointer to **car2** preset for full vehicle behavior.
- **Troubleshooting**: compile error vs runtime warning in console; empty `{}` output; performance expectations (heavy code per step).

---

## Testing gaps (to implement later)

| Area | Idea |
|------|------|
| **CustomTransformerCodeTab** | Debounced commit updates `transformers`; switching row flushes draft; rename uniqueness; LED toggles `enabled`. |
| **Integration** | Builder `handleEntityTransformersChange` / `syncEntityTransformers` path after Code-tab code edit (scene key unchanged). |
| **E2E (Playwright)** | Open Code drawer, third tab, edit custom, optional play-mode smoke. |
| **Migration** | Round-trip export/import with mixed named / legacy custom stacks. |
| **`api` coverage** | One test per `TransformerRuntimeApi` method against known vectors / angles (golden or tolerance). |
| **Regression** | Worlds with only 4-arg-era snippets still compile and run. |

---

## Open questions (for a follow-up session)

- Should **tab labels** or **in-app hints** spell out “Custom transformer” vs “Code” more clearly for new users?
- **Undo coalescing** for rapid debounced commits: current behavior vs desired (single undo step per “session” vs per debounce flush).
- **`api` growth**: which `BaseTransformer` / car2 helpers to add next (e.g. shared slip logic) without bloating the object.
- **Export**: whether to enforce **unique `name`** at schema validation time vs UI-only.
- **Play mode**: any need for a **read-only** viewer of custom code (out of scope today).

---

## Key file index

| Concern | File |
|---------|------|
| Tab shell | [`CodingTabPanel.tsx`](../src/components/CodingTabPanel.tsx) |
| Code segment UI | [`CustomTransformerCodeTab.tsx`](../src/components/CustomTransformerCodeTab.tsx) |
| Monaco editor widget | [`TransformerCustomCodeEditor.tsx`](../src/components/TransformerCustomCodeEditor.tsx) |
| Full stack editor | [`TransformerEditor.tsx`](../src/components/TransformerEditor.tsx) |
| Compile + `api` | [`customCodeTransformer.ts`](../src/transformers/customCodeTransformer.ts) |
| Monaco `.d.ts` | [`transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) |
| Names / uniqueness | [`customTransformerNaming.ts`](../src/transformers/customTransformerNaming.ts) |
| Load-time migration | [`migrateWorld.ts`](../src/scripts/migrateWorld.ts) |
| Sidebar host | [`PropertySidebar.tsx`](../src/components/PropertySidebar.tsx) |
