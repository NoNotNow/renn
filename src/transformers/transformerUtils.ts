import type { TransformerConfig } from '@/types/transformer'

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
