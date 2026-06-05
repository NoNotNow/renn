import type { TransformerConfig } from '@/types/transformer'

/** Human-readable label from transformer config (`name` when set, otherwise `type`). */
export function transformerConfigDisplayName(config: TransformerConfig): string {
  const name = typeof config.name === 'string' ? config.name.trim() : ''
  return name || config.type
}

/** Grouping key used in Organize and add-transformer existing list (`name` or `type`). */
export function transformerOrganizeTitle(config: TransformerConfig): string {
  return config.name || config.type
}

export type GroupedRegistryTransformer = {
  title: string
  ids: string[]
  representativeId: string
}

/** One stack per organize title; ids sorted, first id is the link/copy representative. */
export function groupRegistryTransformersByTitle(
  registry: Record<string, TransformerConfig>,
  excludedIds: Iterable<string> = [],
): GroupedRegistryTransformer[] {
  const excluded = new Set(excludedIds)
  const groups: Record<string, string[]> = {}

  for (const [id, config] of Object.entries(registry)) {
    if (excluded.has(id)) continue
    const title = transformerOrganizeTitle(config)
    if (!groups[title]) groups[title] = []
    groups[title].push(id)
  }

  return Object.entries(groups)
    .map(([title, ids]) => {
      const sorted = [...ids].sort()
      return { title, ids: sorted, representativeId: sorted[0]! }
    })
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
}

/**
 * Re-indexes transformer priorities to match their order in the array (0, 1, 2...).
 */
export function syncPriorities(configs: TransformerConfig[]): TransformerConfig[] {
  return configs.map((t, i) => ({ ...t, priority: i }))
}

/**
 * Sorts transformers by their current priority and then re-indexes them (0, 1, 2...).
 */
export function sortAndSyncPriorities(configs: TransformerConfig[]): TransformerConfig[] {
  return [...configs]
    .sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10))
    .map((t, i) => ({ ...t, priority: i }))
}
