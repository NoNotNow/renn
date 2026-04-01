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

**Texture Maker** — floating, draggable, resizable panel ([`TextureMaker`](../src/components/TextureMaker/TextureMaker.tsx), `data-testid="texture-maker-panel"`). **Layout:** left = document size controls + composite preview; right = layer list + layer properties (opacity, blend, name, stack). With a layer selected and a preview URL, [`LayerTransformOverlay`](../src/components/TextureMaker/LayerTransformOverlay.tsx) shows move + 8 resize handles on the preview; drags update `placementDraft` live and **commit `dest` on pointer-up** only (layer PNGs unchanged — non-destructive placement). Opens from the brush popover (**Open texture maker**) and **Texture maker…** in [`MaterialEditor`](../src/components/MaterialEditor.tsx). Integration scenarios: [`texture-maker.integration.test.tsx`](../src/test/scenarios/texture-maker.integration.test.tsx). Math for handles: [`layerTransformHandles.ts`](../src/utils/layerTransformHandles.ts). Paint is disabled when `material.map` is `composite_*` but the in-memory `TextureDocument` is missing. Canvas clicks do not close the brush popover (`BUILDER_SCENE_CANVAS_HOST_ATTR`).

## Test matrix

| Layer | What |
|-------|------|
| Unit | `textureCompositor` (blend, opacity, hidden layers, serialize), `paintAssetRouting` (fork vs reuse), `layerTransformHandles` (move, corners/edges, `clientToDocPoint`) |
| Integration | IndexedDB + assets map: original key unchanged after forked paint |
| Component / integration | Texture Maker layout, overlay rules, document resize, transform drag commit, reset placement ([`texture-maker.integration.test.tsx`](../src/test/scenarios/texture-maker.integration.test.tsx)) |
| E2E | Optional smoke: open Texture Maker, adjust opacity |

## Related

- [feature-world-update-reload.md](./feature-world-update-reload.md) — incremental material / brush pipeline
- [transformGizmoController.ts](../src/editor/transformGizmoController.ts) — paint pointer + `getPaintTargetAssetId`
