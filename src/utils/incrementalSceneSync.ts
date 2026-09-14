import type { Entity, RennWorld } from '@/types/world'
import { worldChangesRequireSceneRebuild } from './sceneDependencyKey'

export interface EntityWorldDiff {
  removedIds: string[]
  added: Entity[]
  updated: Array<{ prev: Entity; next: Entity }>
}

export function diffEntityWorld(prev: RennWorld, next: RennWorld): EntityWorldDiff {
  const prevById = new Map(prev.entities.map((e) => [e.id, e]))
  const nextById = new Map(next.entities.map((e) => [e.id, e]))

  const removedIds = [...prevById.keys()].filter((id) => !nextById.has(id))
  const added = next.entities.filter((e) => !prevById.has(e.id))
  const updated: Array<{ prev: Entity; next: Entity }> = []

  for (const [id, prevEntity] of prevById) {
    const nextEntity = nextById.get(id)
    if (!nextEntity || prevEntity === nextEntity) continue
    updated.push({ prev: prevEntity, next: nextEntity })
  }

  return { removedIds, added, updated }
}

/**
 * Runs on every incremental sync, so each registry is reference-checked before the
 * deep compare: edits that leave a registry untouched (pose, material, add/remove)
 * keep its object identity and skip a stringify that scales with total registry size.
 * Relies on the same immutable-update contract as `diffEntityWorld` — a registry
 * mutated in place is invisible to both.
 */
export function worldPipeRegistryChanged(prev: RennWorld, next: RennWorld): boolean {
  return (
    registryChanged(prev.transformers, next.transformers) ||
    registryChanged(prev.transformerPipes, next.transformerPipes)
  )
}

function registryChanged(prev: object | undefined, next: object | undefined): boolean {
  if (prev === next) return false
  return JSON.stringify(prev ?? {}) !== JSON.stringify(next ?? {})
}

/** True when undo/redo can apply without a full SceneView reload. */
export function canApplyWorldSnapshotIncrementally(prev: RennWorld, next: RennWorld): boolean {
  return !worldChangesRequireSceneRebuild(prev, next)
}
