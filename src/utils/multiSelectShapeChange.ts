import type { Entity, Shape } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import { shapeWithPreservedSize } from '@/utils/shapeConversion'

export function shapePatchForEntity(entity: Entity, shape: Shape): Partial<Entity> {
  const switchingToTrimesh = shape.type === 'trimesh'
  if (switchingToTrimesh && entity.model) {
    return { shape, model: undefined, showShapeWireframe: undefined }
  }
  if (switchingToTrimesh) {
    return { shape, showShapeWireframe: undefined }
  }
  return { shape }
}

/**
 * Applies a shape edit from the inspector when multiple entities are selected.
 * If the UI shape type differs from the entity's current type, converts using
 * {@link shapeWithPreservedSize} for that entity. Otherwise applies the UI shape
 * uniformly (same-type dimension edits).
 */
export function applyMultiShapeEdit(entity: Entity, uiShape: Shape): Partial<Entity> {
  const typeChanging = uiShape.type !== entity.shape?.type
  const nextShape = typeChanging
    ? shapeWithPreservedSize(entity.shape, uiShape.type as AddableShapeType)
    : uiShape
  return shapePatchForEntity(entity, nextShape)
}
