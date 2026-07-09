export type VectorEditMode = 'absolute' | 'relative'

export interface VectorChangeInput {
  /** Current stored vector; `null` when multi-select mixed. */
  current: number[] | null
  /** Baseline captured when relative mode started; falls back to `current`. */
  relativeBaseline: number[] | null
  index: number
  newComponentValue: number
  mode: VectorEditMode
  linked: boolean
  /** Component indices that participate in linking (e.g. skip empty UV rows). */
  linkIndices: number[]
  length: number
}

function fallbackVector(length: number): number[] {
  return Array.from({ length }, () => 0)
}

function baselineFor(input: VectorChangeInput): number[] {
  return input.relativeBaseline ?? input.current ?? fallbackVector(input.length)
}

/**
 * Apply a single-axis edit with optional linked axes and absolute/relative semantics.
 */
export function applyVectorComponentChange(input: VectorChangeInput): number[] {
  const {
    current,
    index,
    newComponentValue,
    mode,
    linked,
    linkIndices,
    length,
  } = input
  const base = baselineFor(input)
  const result = [...(current ?? base)] as number[]

  while (result.length < length) result.push(0)

  const oldComponent = mode === 'relative' ? 0 : (current?.[index] ?? base[index] ?? 0)

  if (!linked || linkIndices.length <= 1) {
    if (mode === 'relative') {
      result[index] = (base[index] ?? 0) + newComponentValue
    } else {
      result[index] = newComponentValue
    }
    return result
  }

  const delta = newComponentValue - oldComponent
  const allEqual =
    mode === 'absolute' &&
    linkIndices.every((i) => (current?.[i] ?? base[i] ?? 0) === (current?.[linkIndices[0]!] ?? base[linkIndices[0]!] ?? 0))

  if (mode === 'absolute' && allEqual) {
    for (const i of linkIndices) result[i] = newComponentValue
    return result
  }

  for (const i of linkIndices) {
    const source = mode === 'relative' ? (base[i] ?? 0) : (current?.[i] ?? base[i] ?? 0)
    result[i] = source + delta
  }
  return result
}

/** Values shown in inputs: absolute props, or zero deltas in relative idle state. */
export function displayComponentsForMode(
  value: number[] | null,
  mode: VectorEditMode,
  length: number,
): (number | null)[] {
  if (value === null) return Array.from({ length }, () => null)
  if (mode === 'absolute') return value.map((n) => n)
  return Array.from({ length }, () => 0)
}

export function activeLinkIndices(componentLabels: string[]): number[] {
  return componentLabels
    .map((label, index) => (label.trim() ? index : null))
    .filter((index): index is number => index !== null)
}

export function canLink(componentLabels: string[]): boolean {
  return activeLinkIndices(componentLabels).length > 1
}
