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
