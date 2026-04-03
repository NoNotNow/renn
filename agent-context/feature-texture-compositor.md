# Texture compositor & non-destructive paint

## Pitfalls

### Immediate IndexedDB overwrite (`updateAssets`)

[`ProjectContext.updateAssets`](../src/contexts/ProjectContext.tsx) walks the next `Map<string, Blob>` and calls `persistence.saveAsset(assetId, blob)` whenever the blob reference changed. That runs **on every** `updateAssets` call—not only on explicit project save.

If the brush writes painted pixels back to the **same** asset id as the imported/shared texture, the original blob in IndexedDB is replaced **immediately**. Reloading the project (or loading assets) then shows the painted version; the original file is gone unless the user has a backup.

**Mitigation:** **Copy-on-first-paint** — the first stroke on a non–paint-copy asset creates a new id (`tex_paint_*`), stores the result there, and updates `entity.material.map` to that id. Imports keep ids like `asset_*` or filenames; they never receive in-place brush writes.

### Writable id prefix

Paint copies use ids from [`generatePaintAssetId`](../src/utils/idGenerator.ts) (`tex_paint_*`). The stroke handler treats any other id as “source texture” and forks once per chain until the entity points at a `tex_paint_*` asset (or uses layer ids in compositor mode).

### Compositor vs single texture

When a [`TextureDocument`](../src/utils/textureCompositor.ts) is active, the entity’s `material.map` is the **composite** output. The brush paints the **selected layer** blob (`texlayer_*`). Stroke end updates that layer, recomposites, and writes the composite blob—without changing which asset id the material references.

## Architecture

### Asset layout (compositor)

| Key | Role |
|-----|------|
| `composite_*` | Flattened PNG for Three.js (`entity.material.map`) |
| `texdoc_<compositeId>` | JSON sidecar: layer stack, dimensions, blend/opacity |
| `texlayer_*` | Per-layer PNG blobs (document-sized rasters; optional per-layer `dest` rect for draw position/size on the composite) |

**Document size** — presets (256–2048) and custom W×H in Texture Maker call `resizeTextureDocument`: each layer image is rescaled to the new dimensions and custom `dest` rects scale proportionally.

### Data flow (brush + compositor)

1. `getPaintTargetAssetId(entityId)` (optional) — if set, gizmo reads that blob for strokes; else `entity.material.map`.
2. Stroke end ([`handleTexturePaintStrokeEnd`](../src/pages/Builder.tsx)): if `mapAssetId` is a compositor layer (`texlayer_*`) and a doc is loaded for the entity, update that layer blob, run `compositeTextureLayers`, then `updateAssets` for composite + `texdoc_*` sidecar. Otherwise use [`resolvePaintStrokeWriteTarget`](../src/utils/paintAssetRouting.ts) for flat textures.

### UI

**Texture Maker** — floating, draggable, resizable panel ([`TextureMaker`](../src/components/TextureMaker/TextureMaker.tsx), `data-testid="texture-maker-panel"`). **Revert to original** (header) restores the full layered document and every layer’s raster to a snapshot taken when Texture Maker was opened for this session (after confirm); removes layer assets added since then; pushes undo first ([`Builder`](../src/pages/Builder.tsx) `textureMakerBaselineRef` + `handleTextureMakerRevertToOriginal`). **Layout:** left = document size controls + composite preview (with tool strip, zoom/pan viewport); right = layer list + layer properties. **Tools:** Transform (default) — [`LayerTransformOverlay`](../src/components/TextureMaker/LayerTransformOverlay.tsx) move + 8 handles; **Hand** — drag to pan the preview; **Brush** / **Pen** — paint the selected layer raster in 2D via a persistent working surface: decode the layer blob once per stroke, stamp directly at texel coordinates into the working canvas, update the preview synchronously from that working canvas, and export a PNG blob only on stroke end (no per-pointer PNG encode/decode round-trip). Wheel zooms toward the cursor (`translate` + `scale` on the preview content). Studio strokes call the same `pushUndoBeforePaintStroke` and `handleTexturePaintStrokeEnd` as the 3D brush (layer + recomposite). **Layer props:** opacity and name use local draft state; **Apply opacity** / **Apply name** (and name **onBlur**) commit — no `onPatchLayer` on every slider or keystroke. **Global brush:** RGB + **opacity** in [`BrushToolPopover`](../src/components/BrushToolPopover.tsx) (`HexColorPicker`, hex input, opacity slider); [`SceneView`](../src/components/SceneView.tsx) passes alpha into `getBrushRgba`. **Texture Maker** can show **Color & size** (Brush/Pen tools) — floating [`TextureMakerBrushPopover`](../src/components/TextureMaker/TextureMakerBrushPopover.tsx) portaled to `document.body`, same controls as the main brush popover; [`Builder`](../src/pages/Builder.tsx) wires `onTextureBrushColorHexChange` / `onTextureBrushAlphaChange` / `onTextureBrushRadiusPxChange` so studio edits stay in sync with the header brush. Clicks inside `[data-texture-maker-root]` do not dismiss that popover (paint without closing). Hex normalization for pickers lives in [`colorUtils.normalizeHexForPicker`](../src/utils/colorUtils.ts). Opens from the brush popover (**Open texture maker**) and **Texture maker…** in [`MaterialEditor`](../src/components/MaterialEditor.tsx). Integration scenarios: [`texture-maker.integration.test.tsx`](../src/test/scenarios/texture-maker.integration.test.tsx). Paint is disabled when `material.map` is `composite_*` but the in-memory `TextureDocument` is missing. Canvas clicks do not close the brush popover (`BUILDER_SCENE_CANVAS_HOST_ATTR`).

## Test matrix

| Layer | What |
|-------|------|
| Unit | `textureCompositor` (blend, opacity, hidden layers, serialize), `paintAssetRouting` (fork vs reuse), `layerTransformHandles` (move, corners/edges, `clientToDocPoint`, `clientToDocPointFromImageRect`, `docPointToLayerTexel`), `texturePaint` (RGBA stamp + buffer pipeline, and canvas working-surface helpers used by TextureMaker) |
| Integration | IndexedDB + assets map: original key unchanged after forked paint |
| Component / integration | Texture Maker layout, overlay rules, document resize, transform drag commit, reset placement ([`texture-maker.integration.test.tsx`](../src/test/scenarios/texture-maker.integration.test.tsx)) |
| E2E | Paint preview pixels + verify Apply persistence + reopen ([`e2e/texture-maker-painting.spec.ts`](../e2e/texture-maker-painting.spec.ts)) |

## Related

- [feature-world-update-reload.md](./feature-world-update-reload.md) — incremental material / brush pipeline
- [transformGizmoController.ts](../src/editor/transformGizmoController.ts) — paint pointer + `getPaintTargetAssetId`
