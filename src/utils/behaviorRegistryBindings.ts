import type { Entity, RennWorld } from '@/types/world'
import type { WorkspaceOrganizeKind } from '@/types/workspace'
import { getEntityPipeStack } from '@/utils/transformerPipeResolve'

/** Entity shown in "used by" lists. */
export interface BehaviorEntityRef {
  id: string
  name?: string
}

/** The entity fields any registry binding reads. */
export type BehaviorBoundEntity = Pick<
  Entity,
  'scripts' | 'transformers' | 'transformerPipeStack' | 'transformerPipe'
>

/** Entity ↔ behavior-registry queries for one registry kind (scripts, transformers or pipes). */
export interface BehaviorRegistryBindings {
  /** Entities referencing `itemId`, in world order, each listed once. */
  entitiesUsing(world: RennWorld, itemId: string): BehaviorEntityRef[]
  /** Ids referenced by every entity in `entities`; empty for an empty selection. */
  idsSharedBy(entities: BehaviorBoundEntity[]): string[]
}

const boundIds: Record<WorkspaceOrganizeKind, (entity: BehaviorBoundEntity) => string[]> = {
  scripts: (entity) => entity.scripts ?? [],
  transformers: (entity) => entity.transformers ?? [],
  pipes: (entity) => getEntityPipeStack(entity).map((binding) => binding.pipeId),
}

function createBindings(kind: WorkspaceOrganizeKind): BehaviorRegistryBindings {
  const idsFor = boundIds[kind]
  return {
    entitiesUsing(world, itemId) {
      return world.entities
        .filter((e) => idsFor(e).includes(itemId))
        .map((e) => ({ id: e.id, name: e.name }))
    },
    idsSharedBy(entities) {
      if (entities.length === 0) return []
      let common = new Set(idsFor(entities[0]!))
      for (let i = 1; i < entities.length; i++) {
        const next = new Set(idsFor(entities[i]!))
        common = new Set([...common].filter((id) => next.has(id)))
      }
      return [...common]
    },
  }
}

const bindingsByKind: Record<WorkspaceOrganizeKind, BehaviorRegistryBindings> = {
  scripts: createBindings('scripts'),
  transformers: createBindings('transformers'),
  pipes: createBindings('pipes'),
}

/** Bindings for one registry kind. Returns a stable instance per kind, so it is safe in memo deps. */
export function behaviorRegistryBindings(kind: WorkspaceOrganizeKind): BehaviorRegistryBindings {
  return bindingsByKind[kind]
}
