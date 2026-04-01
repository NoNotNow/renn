import { generatePaintAssetId } from '@/utils/idGenerator'

/** Ids created by {@link generatePaintAssetId}; in-place brush writes are allowed. */
export const TEXTURE_PAINT_COPY_PREFIX = 'tex_paint_' as const

/** Per-layer PNG in a TextureDocument; brush writes the layer, then recomposites. */
export const TEXTURE_LAYER_PREFIX = 'texlayer_' as const

export interface PaintStrokeWriteTarget {
  /** Blob key to receive `newBlob` from the stroke. */
  writeAssetId: string
  /** When true, set `entity.material.map` to `writeAssetId` after the stroke. */
  entityShouldPointToWriteId: boolean
}

/**
 * Routes brush output so imported textures are never overwritten in the asset store.
 * Paint copies and layer blobs are updated in place.
 */
export function resolvePaintStrokeWriteTarget(mapAssetId: string): PaintStrokeWriteTarget {
  if (
    mapAssetId.startsWith(TEXTURE_PAINT_COPY_PREFIX) ||
    mapAssetId.startsWith(TEXTURE_LAYER_PREFIX)
  ) {
    return { writeAssetId: mapAssetId, entityShouldPointToWriteId: false }
  }
  return { writeAssetId: generatePaintAssetId(), entityShouldPointToWriteId: true }
}
