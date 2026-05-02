import type { TransformerConfig } from '@/types/transformer'

/** Default display name for the n-th custom transformer on an entity (1-based ordinal among customs). */
export function defaultCustomNameForOrdinal(ordinal: number): string {
  if (ordinal <= 1) return 'Custom'
  return `Custom ${ordinal}`
}

const usedCustomNames = (stack: TransformerConfig[], exceptIndex: number): Set<string> =>
  new Set(
    stack
      .map((t, i) => (t.type === 'custom' && i !== exceptIndex ? (t.name ?? '').trim() : ''))
      .filter((s) => s.length > 0),
  )

/** Next unused default-style name when appending a custom transformer. */
export function nextUniqueCustomTransformerName(stack: TransformerConfig[]): string {
  const used = usedCustomNames(stack, -1)
  const customCount = stack.filter((t) => t.type === 'custom').length
  let ordinal = customCount + 1
  let candidate = defaultCustomNameForOrdinal(ordinal)
  while (used.has(candidate)) {
    ordinal += 1
    candidate = defaultCustomNameForOrdinal(ordinal)
  }
  return candidate
}

/**
 * Ensure `desired` is non-empty and not shared by another custom row on the same stack.
 * Collisions become `name (2)`, `name (3)`, …
 */
export function ensureUniqueCustomTransformerName(
  desired: string,
  stack: TransformerConfig[],
  myIndex: number,
): string {
  const base = desired.trim() || 'Custom'
  const used = usedCustomNames(stack, myIndex)
  if (!used.has(base)) return base
  let n = 2
  let candidate = `${base} (${n})`
  while (used.has(candidate)) {
    n += 1
    candidate = `${base} (${n})`
  }
  return candidate
}

export function labelCustomTransformer(config: TransformerConfig, stackIndex: number): string {
  const n = typeof config.name === 'string' ? config.name.trim() : ''
  return n || `Custom (${stackIndex})`
}
