import type { Entity, MaterialRef, Vec3 } from '@/types/world'
import { DEFAULT_POSITION } from '@/types/world'
import { deepEqual } from '@/utils/entityInspectorMerge'
import { VEC_EPS } from '@/utils/editorConstants'

/**
 * Per-field "mixed value" helpers for multi-selection editing.
 *
 * The inspector used to merge a whole vector / material into one value (or `null`), so editing any
 * part of a differing field wrote ONE full value to every selected entity. These helpers keep the
 * merge at component / sub-field granularity so an edit only touches the component the user changed.
 */

export interface VecComponentMerge {
  /** First entity's vector; its components are the shared values wherever `mixed[i]` is false. */
  value: Vec3
  /** `mixed[i]` is true when entities disagree on component `i` (show empty / placeholder). */
  mixed: [boolean, boolean, boolean]
}

export function mergeVec3Components(
  entities: Entity[],
  pick: (e: Entity) => Vec3 | undefined,
  fallback: Vec3 = DEFAULT_POSITION,
): VecComponentMerge | null {
  if (entities.length === 0) return null
  const first = pick(entities[0]!) ?? fallback
  const mixed: [boolean, boolean, boolean] = [false, false, false]
  for (let i = 1; i < entities.length; i++) {
    const v = pick(entities[i]!) ?? fallback
    for (let c = 0; c < 3; c++) {
      if (Math.abs(v[c]! - first[c]!) > VEC_EPS) mixed[c] = true
    }
  }
  return { value: [first[0], first[1], first[2]], mixed }
}

/** A single-component edit from a vector field that has mixed components. */
export interface VecComponentChange {
  index: number
  value: number
  /** `true`: add `value` to each entity's own component; `false`: set it. */
  relative: boolean
}

/** Apply one component edit to one entity's own vector; the other components are preserved. */
export function applyVecComponentChange<T extends number[]>(current: T, change: VecComponentChange, min?: number): T {
  const next = [...current] as T
  const raw = change.relative ? (current[change.index] ?? 0) + change.value : change.value
  next[change.index] = (min !== undefined && raw < min ? min : raw) as T[number]
  return next
}

export type MaterialFieldKey =
  | 'color'
  | 'map'
  | 'roughness'
  | 'metalness'
  | 'opacity'
  | 'mapRepeat'
  | 'mapWrapS'
  | 'mapWrapT'
  | 'mapRotation'
  | 'mapOffset'

const MATERIAL_DEFAULTS = {
  color: [0.7, 0.7, 0.7],
  roughness: 0.5,
  metalness: 0,
  opacity: 1,
  mapRepeat: [1, 1, 0],
  mapWrapS: 'repeat',
  mapWrapT: 'repeat',
  mapOffset: [0, 0, 0],
  mapRotation: 0,
} as const

export interface MaterialMixInfo {
  /** First entity's material (shared values wherever the key is not in `mixed`). */
  material: MaterialRef | undefined
  /** Sub-fields on which the selected entities disagree (effective values, defaults applied). */
  mixed: Set<MaterialFieldKey>
  /** Per-component flags for the vector sub-fields. */
  mixedVec: { mapRepeat: boolean[]; mapOffset: boolean[] }
  /** At least one selected entity has a texture map. */
  anyMap: boolean
}

function effective(m: MaterialRef | undefined, key: MaterialFieldKey): unknown {
  switch (key) {
    case 'color':
      return (m?.color ?? MATERIAL_DEFAULTS.color).slice(0, 3)
    case 'map':
      return m?.map
    default:
      return m?.[key] ?? MATERIAL_DEFAULTS[key]
  }
}

const SCALAR_KEYS: MaterialFieldKey[] = ['map', 'roughness', 'metalness', 'opacity', 'mapWrapS', 'mapWrapT', 'mapRotation']

/** Merge the selected entities' materials per sub-field. */
export function mergeMaterialFields(entities: Entity[]): MaterialMixInfo {
  const mixed = new Set<MaterialFieldKey>()
  const mixedVec = { mapRepeat: [false, false, false], mapOffset: [false, false, false] }
  const first = entities[0]?.material
  for (let i = 1; i < entities.length; i++) {
    const m = entities[i]!.material
    const c0 = effective(first, 'color') as number[]
    const c1 = effective(m, 'color') as number[]
    if (c0.some((x, k) => Math.abs(x - (c1[k] ?? 0)) > VEC_EPS)) mixed.add('color')
    for (const key of SCALAR_KEYS) {
      const a = effective(first, key)
      const b = effective(m, key)
      const differs = typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > VEC_EPS : !deepEqual(a, b)
      if (differs) mixed.add(key)
    }
    for (const key of ['mapRepeat', 'mapOffset'] as const) {
      const a = effective(first, key) as number[]
      const b = effective(m, key) as number[]
      for (let c = 0; c < 3; c++) {
        if (Math.abs((a[c] ?? 0) - (b[c] ?? 0)) > VEC_EPS) {
          mixedVec[key][c] = true
          mixed.add(key)
        }
      }
    }
  }
  return { material: first, mixed, mixedVec, anyMap: entities.some((e) => !!e.material?.map) }
}

/** Computes one entity's next material from its own current one (per-entity, so other sub-fields survive). */
export type MaterialUpdater = (current: MaterialRef | undefined) => MaterialRef
