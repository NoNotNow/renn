import type { Entity, Vec3, Rotation, Shape, MaterialRef } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { DEFAULT_SCALE, DEFAULT_POSITION, DEFAULT_ROTATION } from '@/types/world'
import { VEC_EPS } from '@/utils/editorConstants'

export function vec3Equal(a: Vec3 | undefined, b: Vec3 | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  return (
    Math.abs(a[0] - b[0]) < VEC_EPS &&
    Math.abs(a[1] - b[1]) < VEC_EPS &&
    Math.abs(a[2] - b[2]) < VEC_EPS
  )
}

export function rotationEqual(a: Rotation | undefined, b: Rotation | undefined): boolean {
  return vec3Equal(a, b)
}

/** Stable deep equality for JSON-like trees (entity subtrees, scripts, transformers). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  const ak = Object.keys(a as object).sort()
  const bk = Object.keys(b as object).sort()
  if (ak.length !== bk.length) return false
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false
  }
  for (const k of ak) {
    if (!deepEqual((a as Record<string, unknown>)[k!], (b as Record<string, unknown>)[k!])) return false
  }
  return true
}

export function mergeVec3(entities: Entity[], pick: (e: Entity) => Vec3 | undefined): Vec3 | null {
  if (entities.length === 0) return null
  const first = pick(entities[0]!) ?? DEFAULT_POSITION
  for (let i = 1; i < entities.length; i++) {
    const v = pick(entities[i]!) ?? DEFAULT_POSITION
    if (!vec3Equal(first, v)) return null
  }
  return [first[0], first[1], first[2]]
}

export function mergeRotation(entities: Entity[], pick: (e: Entity) => Rotation | undefined): Rotation | null {
  if (entities.length === 0) return null
  const first = pick(entities[0]!) ?? DEFAULT_ROTATION
  for (let i = 1; i < entities.length; i++) {
    const v = pick(entities[i]!) ?? DEFAULT_ROTATION
    if (!rotationEqual(first, v)) return null
  }
  return [first[0], first[1], first[2]]
}

export function mergeScalar<T>(entities: Entity[], pick: (e: Entity) => T | undefined, eq: (a: T, b: T) => boolean): T | null {
  if (entities.length === 0) return null
  const first = pick(entities[0]!)
  for (let i = 1; i < entities.length; i++) {
    const v = pick(entities[i]!)
    if (first === undefined && v === undefined) continue
    if (first === undefined || v === undefined) return null
    if (!eq(first as T, v as T)) return null
  }
  return (first === undefined ? null : first) as T | null
}

export function mergeShape(entities: Entity[]): Shape | null {
  if (entities.length === 0) return null
  const s0 = entities[0]!.shape
  for (let i = 1; i < entities.length; i++) {
    if (!deepEqual(s0, entities[i]!.shape)) return null
  }
  return s0 ?? null
}

/** Same material on all, or `null` if they differ, or `undefined` if all have no material. */
export function mergeMaterial(entities: Entity[]): MaterialRef | null | undefined {
  if (entities.length === 0) return undefined
  const m0 = entities[0]!.material
  for (let i = 1; i < entities.length; i++) {
    if (!deepEqual(m0, entities[i]!.material)) return null
  }
  return m0
}

export function mergeModelRef(entities: Entity[]): string | null | undefined {
  if (entities.length === 0) return undefined
  const v0 = entities[0]!.model
  for (let i = 1; i < entities.length; i++) {
    if (v0 !== entities[i]!.model) return null
  }
  return v0
}

export function mergeTransformers(entities: Entity[]): TransformerConfig[] | null {
  if (entities.length === 0) return null
  const t0 = entities[0]!.transformers
  for (let i = 1; i < entities.length; i++) {
    if (!deepEqual(t0, entities[i]!.transformers)) return null
  }
  return t0 ?? []
}

export function mergeScripts(entities: Entity[]): string[] | null {
  if (entities.length === 0) return null
  const s0 = entities[0]!.scripts
  for (let i = 1; i < entities.length; i++) {
    if (!deepEqual(s0, entities[i]!.scripts)) return null
  }
  return s0 ?? []
}

export function mergeLocked(entities: Entity[]): boolean | null {
  if (entities.length === 0) return null
  const l0 = entities[0]!.locked === true
  for (let i = 1; i < entities.length; i++) {
    if ((entities[i]!.locked === true) !== l0) return null
  }
  return l0
}

export function mergeScale(entities: Entity[]): Vec3 | null {
  return mergeVec3(entities, (e) => e.scale ?? DEFAULT_SCALE)
}

export function mergeNumber(
  entities: Entity[],
  pick: (e: Entity) => number | undefined,
  defaultValue: number
): number | null {
  if (entities.length === 0) return null
  const v0 = pick(entities[0]!) ?? defaultValue
  for (let i = 1; i < entities.length; i++) {
    const v = pick(entities[i]!) ?? defaultValue
    if (Math.abs(v - v0) > VEC_EPS) return null
  }
  return v0
}

export function mergeBodyType(entities: Entity[]): Entity['bodyType'] | null {
  if (entities.length === 0) return null
  const b0 = entities[0]!.bodyType ?? 'static'
  for (let i = 1; i < entities.length; i++) {
    const b = entities[i]!.bodyType ?? 'static'
    if (b !== b0) return null
  }
  return b0
}

export function mergeName(entities: Entity[]): string | null {
  if (entities.length === 0) return null
  const n0 = entities[0]!.name ?? ''
  for (let i = 1; i < entities.length; i++) {
    const n = entities[i]!.name ?? ''
    if (n !== n0) return null
  }
  return n0
}

export function allSameShapeTopology(entities: Entity[]): boolean {
  const t0 = entities[0]?.shape?.type
  return entities.every((e) => e.shape?.type === t0)
}

export function allTrimeshOrAllPrimitiveModelLayout(entities: Entity[]): 'trimesh' | 'modelOnPrimitive' | 'primitiveOnly' | 'mixed' {
  const flags = entities.map((e) => {
    const tr = e.shape?.type === 'trimesh'
    const model = !!e.model
    return { tr, model }
  })
  if (flags.some((f) => f.tr) && flags.some((f) => !f.tr)) return 'mixed'
  if (flags.every((f) => f.tr)) return 'trimesh'
  if (flags.every((f) => f.model)) return 'modelOnPrimitive'
  if (flags.every((f) => !f.model && !f.tr)) return 'primitiveOnly'
  if (flags.some((f) => f.model) && flags.some((f) => !f.model)) return 'mixed'
  return 'primitiveOnly'
}
