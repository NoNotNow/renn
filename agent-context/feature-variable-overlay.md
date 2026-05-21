# Variable Overlay & Coordinate Overlay — design & implementation plan

Builder feature: visualize numeric values from custom transformer `api.visualize()` calls as bidirectional bar charts anchored to the selected entity in the 3D scene, and world-space lines between arbitrary coordinates via `api.visualizeLine()`.

Pair with [feature-coding-custom-transformers.md](feature-coding-custom-transformers.md) and [feature-transformers.md](feature-transformers.md).

---

## Implementation status (shipped)

Steps 1–3 are **done** in the codebase: `visualize` gizmo mode, `CSS2DRenderer`, `variableOverlayBridge`, `variableOverlayController`, `api.visualize` on `TransformerRuntimeApi`, SceneView wiring, Monaco decls, and docs in `feature-coding-custom-transformers.md`.

`api.visualizeLine` is also **done**: `coordinateOverlayBridge`, `coordinateOverlayController`, API surface on `TransformerRuntimeApi`, SceneView wiring, Monaco decls.

**Rendering note:** Bars and zero-line use **scaled `BoxGeometry` meshes** (not `LineSegments`), because WebGL line width is not reliable. Thickness scales with `BUILDER_VARIABLE_OVERLAY_GROUP_WIDTH` via `STROKE_WIDTH_FACTOR` in `variableOverlayController.ts`. Bar **fill color** uses the API color string on each slot’s `MeshBasicMaterial` (`THREE.Color.setStyle`). Materials use **`depthTest` / `depthWrite` off and `renderOrder = Infinity`**, matching Three.js `TransformControls`, so bars stay visible when a large selection mesh would otherwise occlude them in depth. Name labels use **larger type with `writing-mode: vertical-rl`** so adjacent columns overlap less in screen space; label text is **always white** for contrast (bar fill still uses the API color).

**Slot cap:** `VARIABLE_OVERLAY_MAX_INDEX = 16` in `variableOverlayBridge.ts` — higher indices are ignored.

**Layout helpers (unit-tested):** `variableOverlayColumnX`, `variableOverlaySignedBarLength` in `variableOverlayController.ts`.

**Example (`api.visualize` before a touch gate):** If `api.visualize(power, …)` runs **before** an `isTouchingObject` / `power === 0` early return, **`power` is plotted every transformer tick** in Builder Visualize mode without ground contact; physics impulse behavior can still require touch. See the **`api.visualize before touch gate`** test in [`customCodeTransformer.test.ts`](../src/transformers/customCodeTransformer.test.ts).

**Scene rebuild:** Adding/removing transformer **configs** changes `getSceneDependencyKey` and forces a full `SceneView` reload. Its cleanup clears `setVariableOverlayFn`; the visualize-only `useEffect` must depend on **`sceneKey` + `version`** (same as the main scene effect) so the bridge is **rewired** while Visualize stays selected.

---

## What it is

When **Visualize mode** is active in the Builder, the selected entity shows a set of vertical bar columns floating at its world position. Each bar corresponds to one numeric variable exposed via `api.visualize()` in any custom transformer on that entity. A bidirectional zero-line anchors the bars; bars grow upward for positive values and downward for negative values. A name label rendered via `CSS2DRenderer` appears below each column (upright vertical text per column).

---

## Design decisions (locked)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Mode type | Exclusive — `'visualize'` added to `BuilderGizmoMode`. `TransformControls` detaches. |
| 2 | Bar orientation | **Screen-vertical:** overlay group uses the camera world quaternion each frame so local +Y/+X match screen up/right (bars stay upright when tilting orbit). Tracks entity **world** position; ignores entity rotation. |
| 3 | Min/max window | Per-activation. Resets on mode entry, expands monotonically, discarded on exit. |
| 4 | Column layout | Evenly distributed and centered on entity. 1-based `index`. Last write wins per frame. |
| 5 | Total group width | Fixed world-space — `BUILDER_VARIABLE_OVERLAY_GROUP_WIDTH` in `transformGizmoController.ts`. |
| 6 | Label rendering | `CSS2DRenderer` (`three/addons/renderers/CSS2DRenderer`) — HTML `<div>`, pointer-events disabled; vertical column text below the zero-line. |
| 7 | Which entities | Selected entity only. No bars if nothing is selected. |
| 8 | Runtime scope | Builder-only. `api.visualize()` is a no-op in Play mode and tests (nullable `_visualizeFn` pattern from `api.log`). |
| 9 | History on exit | Discarded immediately when switching away from `'visualize'` mode. |
| 10 | Negative values | Bidirectional bars. Zero-line spans full group width through the entity’s world-space anchor, horizontal on screen. |

---

## API

```ts
api.visualize(value: number, color: string, name: string, index: number): void
```

- **`value`** — the number to visualize (any finite value; non-finite is ignored).
- **`color`** — CSS color string (e.g. `'#ff4444'`, `'cyan'`). Applied to the **bar** only; name labels always render white.
- **`name`** — short label displayed below the column (e.g. `'speed'`, `'throttle'`).
- **`index`** — 1-based column slot (1 = first/leftmost), **≤ `VARIABLE_OVERLAY_MAX_INDEX` (16)**. Columns are auto-distributed across the total group width. If two calls use the same index in the same frame, last write wins.

The call is a no-op unless the visualize bridge is wired (i.e. Builder mode with `'visualize'` gizmo mode active and the entity is selected).

---

## Visual layout

```
      ▲          │          ▲
      │  (bar)   │  (bar)   │
──────┼──────────┼──────────┼──────  ← zero-line (through entity world position, horizontal on screen)
      │          │          │
      ▼          │          ▼
   [speed]   [throttle]  [grip]
```

- **Zero-line**: thin **mesh strip** spanning the full group width through the entity’s world position, perpendicular to screen vertical (horizontal on screen).
- **Bars**: one **mesh column** per slot, updated each frame from bridge data.
- **Labels**: one `CSS2DObject` per slot, positioned below the zero-line; larger font and vertical (`writing-mode: vertical-rl`) to reduce horizontal overlap between columns.
- **Heights**: `barHeight = (value / maxAbsValue) * groupWidth`. `maxAbsValue = Math.max(|observedMin|, |observedMax|)` accumulated since activation.
- **Column spacing**: `x_i = -groupWidth/2 + (i / (n+1)) * groupWidth` for `n` known slots.

---

## Implementation plan (reference)

### Step 1 — Visual scaffold ✓

Goal: bars appear on the selected entity; scaffold verified via live `api.visualize` path.

### Step 2 — Data bridge ✓

Bridge: `setVariableOverlayFn`, `publishVariableValue`, `getVariableOverlaySlots`, `clearSlots`, display-entity filter.

### Step 3 — API surface ✓

`TransformerRuntimeApi.visualize`, Monaco `transformerCodeDecl.ts`, default snippet example, feature-coding doc table.

**Deliverable**: `api.visualize(value, '#ff4444', 'speed', 1)` works end-to-end in Builder when visualize mode + single selection + matching entity.

---

## Key files

| Concern | File |
|---------|------|
| Gizmo mode type | [`src/editor/transformGizmoController.ts`](../src/editor/transformGizmoController.ts) |
| Header button | [`src/components/BuilderHeader.tsx`](../src/components/BuilderHeader.tsx) |
| Header icons | [`src/components/GizmoModeIcons.tsx`](../src/components/GizmoModeIcons.tsx) |
| Scene renderer / CSS2DRenderer wiring | [`src/components/SceneView.tsx`](../src/components/SceneView.tsx) |
| Bar overlay geometry + labels | [`src/runtime/variableOverlayController.ts`](../src/runtime/variableOverlayController.ts) |
| Bar overlay bridge | [`src/runtime/variableOverlayBridge.ts`](../src/runtime/variableOverlayBridge.ts) |
| Coordinate line geometry | [`src/runtime/coordinateOverlayController.ts`](../src/runtime/coordinateOverlayController.ts) |
| Coordinate line bridge | [`src/runtime/coordinateOverlayBridge.ts`](../src/runtime/coordinateOverlayBridge.ts) |
| Custom transformer runtime API | [`src/transformers/customCodeTransformer.ts`](../src/transformers/customCodeTransformer.ts) |
| Monaco type declarations | [`src/transformers/transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) |

---

## Tests

| Area | Coverage |
|------|----------|
| `variableOverlayBridge` | [`variableOverlayBridge.test.ts`](../src/runtime/variableOverlayBridge.test.ts) — min/max, last-write, entity filter, cap >16, clear on unwire. |
| Layout math | [`variableOverlayController.test.ts`](../src/runtime/variableOverlayController.test.ts) — column X, signed bar length. |
| `coordinateOverlayBridge` | [`coordinateOverlayBridge.test.ts`](../src/runtime/coordinateOverlayBridge.test.ts) — entity filter, cap, clear, mutation-safety, copy safety. |
| `api.visualize` / `api.visualizeLine` | [`customCodeTransformer.test.ts`](../src/transformers/customCodeTransformer.test.ts) — wired vs mismatched selection for both APIs. |
| Integration | Optional: Playwright Builder session (future). |

---

## Resolved notes

- **Cap on simultaneous indices (bars):** **16** — see `VARIABLE_OVERLAY_MAX_INDEX`.
- **Cap on simultaneous coordinate lines:** **16** — see `COORDINATE_OVERLAY_MAX_COUNT`.
- **Multi-select:** **No overlay** — display entity id is set only when exactly one entity is selected.
- **Bar thickness:** **World-space mesh boxes** with `STROKE_WIDTH_FACTOR` (not `Line2` / `LineSegments` width).
- **Line rendering:** **`CylinderGeometry`** meshes oriented between coordinates; `depthTest: false`, `renderOrder: Infinity`.
- **Per-frame clear:** Coordinate entries are cleared once per **physics step** at the start of `RenderItemRegistry.executeTransformers` (and when the visualize target entity changes), so **render-only** rAF ticks reuse the last step’s lines and do not flicker. Stale lines disappear on the next simulated frame if the transformer stops calling `visualizeLine`.

---

## `api.visualizeLine`

```ts
api.visualizeLine(from: Vec3, to: Vec3, color: string): void
```

- **`from`** — world-space `[x, y, z]` start point (non-finite components are ignored).
- **`to`** — world-space `[x, y, z]` end point (non-finite components are ignored).
- **`color`** — CSS color string (e.g. `'blue'`, `'#ff4444'`).
- Active in Builder Visualize mode with exactly one entity selected; no-op otherwise.
- Up to 16 lines per frame (`COORDINATE_OVERLAY_MAX_COUNT`); excess calls are dropped.

Example usage:

```js
// Draw a line to a target waypoint each frame
api.visualizeLine(input.position, [0, 0, 0], 'blue');
```
