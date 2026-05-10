# Variable Overlay — design & implementation plan

Builder feature: visualize numeric values from custom transformer `api.visualize()` calls as bidirectional bar charts anchored to the selected entity in the 3D scene.

Pair with [feature-coding-custom-transformers.md](feature-coding-custom-transformers.md) and [feature-transformers.md](feature-transformers.md).

---

## Implementation status (shipped)

Steps 1–3 are **done** in the codebase: `visualize` gizmo mode, `CSS2DRenderer`, `variableOverlayBridge`, `variableOverlayController`, `api.visualize` on `TransformerRuntimeApi`, SceneView wiring, Monaco decls, and docs in `feature-coding-custom-transformers.md`.

**Rendering note:** Bars and zero-line use **scaled `BoxGeometry` meshes** (not `LineSegments`), because WebGL line width is not reliable. Thickness scales with `BUILDER_VARIABLE_OVERLAY_GROUP_WIDTH` via `STROKE_WIDTH_FACTOR` in `variableOverlayController.ts`. Bar **fill color** uses the API color string on each slot’s `MeshBasicMaterial` (`THREE.Color.setStyle`). Materials use **`depthTest` / `depthWrite` off and `renderOrder = Infinity`**, matching Three.js `TransformControls`, so bars stay visible when a large selection mesh would otherwise occlude them in depth. Name labels use **larger type with `writing-mode: vertical-rl`** so adjacent columns overlap less in screen space.

**Slot cap:** `VARIABLE_OVERLAY_MAX_INDEX = 16` in `variableOverlayBridge.ts` — higher indices are ignored.

**Layout helpers (unit-tested):** `variableOverlayColumnX`, `variableOverlaySignedBarLength` in `variableOverlayController.ts`.

**Default custom-transformer snippet:** `api.visualize` runs **before** the `isTouchingObject` / `power === 0` early return (`defaultCustomTransformerCode` in `customCodeTransformer.ts`), so **`power` is plotted every transformer tick** in Builder Visualize mode without needing ground contact; physics impulse behavior is unchanged.

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
- **`color`** — CSS color string (e.g. `'#ff4444'`, `'cyan'`). Applied to the bar and its label.
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
| Overlay geometry + labels | [`src/runtime/variableOverlayController.ts`](../src/runtime/variableOverlayController.ts) |
| Runtime bridge | [`src/runtime/variableOverlayBridge.ts`](../src/runtime/variableOverlayBridge.ts) |
| Custom transformer runtime API | [`src/transformers/customCodeTransformer.ts`](../src/transformers/customCodeTransformer.ts) |
| Monaco type declarations | [`src/transformers/transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) |

---

## Tests

| Area | Coverage |
|------|----------|
| `variableOverlayBridge` | [`variableOverlayBridge.test.ts`](../src/runtime/variableOverlayBridge.test.ts) — min/max, last-write, entity filter, cap >16, clear on unwire. |
| Layout math | [`variableOverlayController.test.ts`](../src/runtime/variableOverlayController.test.ts) — column X, signed bar length. |
| `api.visualize` | [`customCodeTransformer.test.ts`](../src/transformers/customCodeTransformer.test.ts) — wired vs mismatched selection. |
| Integration | Optional: Playwright Builder session (future). |

---

## Resolved notes

- **Cap on simultaneous indices:** **16** — see `VARIABLE_OVERLAY_MAX_INDEX`.
- **Multi-select:** **No bars** — display entity id is set only when exactly one entity is selected.
- **Bar thickness:** **World-space mesh boxes** with `STROKE_WIDTH_FACTOR` (not `Line2` / `LineSegments` width).
