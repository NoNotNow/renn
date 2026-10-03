import type { TransformerConfig } from '@/types/transformer'
import { getDefaultTransformerConfig } from '@/transformers/transformerPresets'
import { syncPriorities } from '@/transformers/transformerUtils'
import { nextUniqueCustomTransformerName } from '@/transformers/customTransformerNaming'
import { allocateTransformerRegistryId } from '@/utils/commitTransformerConfigsToWorld'

export type AddExistingTransformerMode = 'link' | 'copy'

function suggestCopyRegistryId(
  sourceId: string,
  registry: Record<string, TransformerConfig>,
  used: Set<string>,
): string {
  const base = sourceId.replace(/_copy\d*$/, '')
  let n = 1
  for (;;) {
    const candidate = `${base}_copy${n}`
    if (!registry[candidate] && !used.has(candidate)) return candidate
    n++
  }
}

export function appendPresetTransformerStage(
  configs: TransformerConfig[],
  ids: string[],
  type: string,
  registryEntityId: string | undefined,
  existingRegistry: Record<string, TransformerConfig>,
): { configs: TransformerConfig[]; ids: string[]; selectId: string } {
  const used = new Set(ids)
  let config = getDefaultTransformerConfig(type)
  if (type === 'custom') {
    config = { ...config, name: nextUniqueCustomTransformerName(configs) }
  }
  const newId =
    registryEntityId ?
      allocateTransformerRegistryId(registryEntityId, existingRegistry, used)
    : `tf_${Date.now()}`

  return {
    configs: syncPriorities([...configs, config]),
    ids: [...ids, newId],
    selectId: newId,
  }
}

export function appendExistingTransformerStage(
  configs: TransformerConfig[],
  ids: string[],
  registryId: string,
  mode: AddExistingTransformerMode,
  registryEntityId: string | undefined,
  existingRegistry: Record<string, TransformerConfig>,
): { configs: TransformerConfig[]; ids: string[]; selectId: string } | null {
  const existing = existingRegistry[registryId]
  if (!existing) return null

  const used = new Set(ids)
  let config: TransformerConfig
  let newId: string

  if (mode === 'link') {
    config = existing
    newId = registryId
  } else {
    config = JSON.parse(JSON.stringify(existing)) as TransformerConfig
    newId =
      registryEntityId ?
        allocateTransformerRegistryId(registryEntityId, existingRegistry, used)
      : suggestCopyRegistryId(registryId, existingRegistry, used)
  }

  return {
    configs: syncPriorities([...configs, config]),
    ids: [...ids, newId],
    selectId: newId,
  }
}

/**
 * Copy a global-library stage into a pipe, keeping its own `priority` (execution order is priority-sorted across the
 * whole composite stack, so the library's value is meaningful) and listing it where that priority fits among the
 * pipe's existing stages. Existing stages are not re-indexed.
 */
export function insertGlobalTransformerStage(
  configs: TransformerConfig[],
  ids: string[],
  globalId: string,
  globalDef: TransformerConfig,
  registryEntityId: string | undefined,
  registry: Record<string, TransformerConfig>,
): { configs: TransformerConfig[]; ids: string[]; selectId: string } {
  const used = new Set(ids)
  const newId =
    registryEntityId ?
      allocateTransformerRegistryId(registryEntityId, registry, used)
    : suggestCopyRegistryId(globalId, registry, used)
  const config = JSON.parse(JSON.stringify(globalDef)) as TransformerConfig
  // an equal priority would make the run order depend on list order only: nudge it just past the tie
  while (config.priority !== undefined && configs.some((c) => c.priority === config.priority)) {
    config.priority = Math.round((config.priority + 0.01) * 1000) / 1000
  }
  const p = config.priority ?? Number.POSITIVE_INFINITY
  let at = configs.findIndex((c) => (c.priority ?? Number.POSITIVE_INFINITY) > p)
  if (at < 0) at = configs.length
  return {
    configs: [...configs.slice(0, at), config, ...configs.slice(at)],
    ids: [...ids.slice(0, at), newId, ...ids.slice(at)],
    selectId: newId,
  }
}
