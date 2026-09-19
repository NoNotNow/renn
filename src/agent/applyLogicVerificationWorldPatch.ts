import type { TransformerConfig } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import { validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import { worldChangesRequireSceneRebuild } from '@/utils/sceneDependencyKey'

export type LogicVerificationWorldPatch = {
  /** Partial updates keyed by transformer registry id (e.g. `car_tf1`). */
  transformers?: Record<string, Partial<TransformerConfig>>
  /** Required when the patch would trigger a full scene rebuild (entity add/remove, structural edits). */
  allowSceneRebuild?: boolean
}

export type ApplyLogicVerificationWorldPatchResult =
  | { ok: true; affectedEntityIds: string[] }
  | { ok: false; message: string; requiresSceneRebuild?: boolean }

function mergeTransformerDef(
  prev: TransformerConfig | undefined,
  patch: Partial<TransformerConfig>,
): TransformerConfig | undefined {
  if (!prev) return undefined
  const next = { ...prev, ...patch } as TransformerConfig
  if (patch.params !== undefined) {
    next.params =
      patch.params && prev.params ?
        { ...(prev.params as Record<string, unknown>), ...(patch.params as Record<string, unknown>) }
      : (patch.params as TransformerConfig['params'])
  }
  return next
}

export function applyLogicVerificationWorldPatch(
  prev: RennWorld,
  patch: LogicVerificationWorldPatch,
): ApplyLogicVerificationWorldPatchResult & { nextWorld?: RennWorld } {
  if (!patch.transformers || Object.keys(patch.transformers).length === 0) {
    return { ok: false, message: 'Patch must include at least one transformer update' }
  }

  const nextWorld = structuredClone(prev) as RennWorld
  const registry = nextWorld.transformers ?? {}
  nextWorld.transformers = registry

  const patchedIds: string[] = []
  for (const [tfId, tfPatch] of Object.entries(patch.transformers)) {
    const prevDef = registry[tfId]
    if (!prevDef) {
      return { ok: false, message: `Unknown transformer id: ${tfId}` }
    }
    if (typeof tfPatch.code === 'string') {
      const message = validateCustomTransformerSource(tfPatch.code, tfId)
      if (message) {
        return { ok: false, message }
      }
    }
    const merged = mergeTransformerDef(prevDef, tfPatch)
    if (!merged) {
      return { ok: false, message: `Failed to merge transformer: ${tfId}` }
    }
    registry[tfId] = merged
    patchedIds.push(tfId)
  }

  if (worldChangesRequireSceneRebuild(prev, nextWorld) && !patch.allowSceneRebuild) {
    return {
      ok: false,
      message: 'Patch requires scene rebuild; set allowSceneRebuild: true',
      requiresSceneRebuild: true,
    }
  }

  const affectedEntityIds = nextWorld.entities
    .filter((entity) => entity.transformers?.some((id) => patchedIds.includes(id)))
    .map((entity) => entity.id)

  if (affectedEntityIds.length === 0) {
    return { ok: false, message: 'No entities reference the patched transformers' }
  }

  return { ok: true, affectedEntityIds, nextWorld }
}
