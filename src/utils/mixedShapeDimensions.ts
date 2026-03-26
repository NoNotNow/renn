import type { Entity, Shape } from '@/types/world'

const VEC_EPS = 1e-5

export type MixedDimensionKind = 'radius' | 'height' | 'width' | 'depth' | 'baseSize'

export interface MixedDimensionFieldSpec {
  kind: MixedDimensionKind
  value: number | null
  /** Shown when not every selected entity uses this parameter. */
  partialNote?: string
}

const MIXED_PARTIAL_NOTE = 'Only updates shapes that use this value.'

export function shapeHasRadius(shape: Shape | undefined): boolean {
  if (!shape) return false
  return shape.type === 'sphere' || shape.type === 'cylinder' || shape.type === 'capsule' || shape.type === 'cone'
}

export function shapeHasHeight(shape: Shape | undefined): boolean {
  if (!shape) return false
  return (
    shape.type === 'box' ||
    shape.type === 'cylinder' ||
    shape.type === 'capsule' ||
    shape.type === 'cone' ||
    shape.type === 'pyramid' ||
    shape.type === 'ring'
  )
}

export function shapeHasWidthDepth(shape: Shape | undefined): boolean {
  return shape?.type === 'box'
}

export function shapeHasBaseSize(shape: Shape | undefined): boolean {
  return shape?.type === 'pyramid'
}

function readRadius(shape: Shape): number | undefined {
  if (shapeHasRadius(shape)) return shape.radius
  return undefined
}

function readHeight(shape: Shape): number | undefined {
  switch (shape.type) {
    case 'box':
    case 'cylinder':
    case 'capsule':
    case 'cone':
    case 'pyramid':
      return shape.height
    case 'ring':
      return shape.height ?? 0.1
    default:
      return undefined
  }
}

function mergeAmongApplicable(
  entities: Entity[],
  applies: (s: Shape | undefined) => boolean,
  read: (s: Shape) => number | undefined
): number | null {
  const values: number[] = []
  for (const e of entities) {
    const s = e.shape
    if (!s || !applies(s)) continue
    const v = read(s)
    if (v === undefined) continue
    values.push(v)
  }
  if (values.length === 0) return null
  const v0 = values[0]!
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i]! - v0) > VEC_EPS) return null
  }
  return v0
}

function countApplicable(entities: Entity[], applies: (s: Shape | undefined) => boolean): number {
  return entities.filter((e) => e.shape != null && applies(e.shape)).length
}

/** Build merged display values and visibility for mixed-type multi-select. */
export function getMixedDimensionFieldSpecs(entities: Entity[]): MixedDimensionFieldSpec[] {
  if (entities.length < 2) return []

  const n = entities.length
  const specs: MixedDimensionFieldSpec[] = []

  const nRadius = countApplicable(entities, shapeHasRadius)
  if (nRadius > 0) {
    specs.push({
      kind: 'radius',
      value: mergeAmongApplicable(entities, shapeHasRadius, (s) => readRadius(s)!),
      partialNote: nRadius < n ? MIXED_PARTIAL_NOTE : undefined,
    })
  }

  const nHeight = countApplicable(entities, shapeHasHeight)
  if (nHeight > 0) {
    specs.push({
      kind: 'height',
      value: mergeAmongApplicable(entities, shapeHasHeight, (s) => readHeight(s) ?? undefined),
      partialNote: nHeight < n ? MIXED_PARTIAL_NOTE : undefined,
    })
  }

  const nBox = countApplicable(entities, shapeHasWidthDepth)
  if (nBox > 0) {
    specs.push({
      kind: 'width',
      value: mergeAmongApplicable(entities, shapeHasWidthDepth, (s) => (s.type === 'box' ? s.width : undefined)),
      partialNote: nBox < n ? MIXED_PARTIAL_NOTE : undefined,
    })
    specs.push({
      kind: 'depth',
      value: mergeAmongApplicable(entities, shapeHasWidthDepth, (s) => (s.type === 'box' ? s.depth : undefined)),
      partialNote: nBox < n ? MIXED_PARTIAL_NOTE : undefined,
    })
  }

  const nPyr = countApplicable(entities, shapeHasBaseSize)
  if (nPyr > 0) {
    specs.push({
      kind: 'baseSize',
      value: mergeAmongApplicable(entities, shapeHasBaseSize, (s) => (s.type === 'pyramid' ? s.baseSize : undefined)),
      partialNote: nPyr < n ? MIXED_PARTIAL_NOTE : undefined,
    })
  }

  return specs
}

/** Apply one mixed dimension to a shape; returns same reference if unchanged. */
export function patchShapeWithMixedDimension(shape: Shape, kind: MixedDimensionKind, value: number): Shape {
  switch (kind) {
    case 'radius':
      if (shape.type === 'sphere') return { type: 'sphere', radius: value }
      if (shape.type === 'cylinder') return { ...shape, radius: value }
      if (shape.type === 'capsule') return { ...shape, radius: value }
      if (shape.type === 'cone') return { ...shape, radius: value }
      return shape
    case 'height':
      if (shape.type === 'box') return { ...shape, height: value }
      if (shape.type === 'cylinder') return { ...shape, height: value }
      if (shape.type === 'capsule') return { ...shape, height: value }
      if (shape.type === 'cone') return { ...shape, height: value }
      if (shape.type === 'pyramid') return { ...shape, height: value }
      if (shape.type === 'ring')
        return { type: 'ring', innerRadius: shape.innerRadius, outerRadius: shape.outerRadius, height: value }
      return shape
    case 'width':
      if (shape.type === 'box') return { ...shape, width: value }
      return shape
    case 'depth':
      if (shape.type === 'box') return { ...shape, depth: value }
      return shape
    case 'baseSize':
      if (shape.type === 'pyramid') return { ...shape, baseSize: value }
      return shape
    default:
      return shape
  }
}

export function patchEntityWithMixedDimension(entity: Entity, kind: MixedDimensionKind, value: number): Entity {
  const s = entity.shape
  if (!s) return entity
  const next = patchShapeWithMixedDimension(s, kind, value)
  if (next === s) return entity
  return { ...entity, shape: next }
}
