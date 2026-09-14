import type { TransformerPipeBinding } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'

/** Stable scope key for per-entity nested pipe overrides on a binding. */
export function pipeScopeKeyFromPath(path: PipeNavPathSegment[]): string {
  if (path.length === 0) return ''
  return path
    .map((seg) =>
      seg.kind === 'stack' ? `stack:${seg.index}` : `member:${seg.pipeId}:${seg.memberIndex}`,
    )
    .join('/')
}

/** True when overrides belong on `binding.params` (stack root), not `scopeParams` alone. */
export function isStackRootScopePath(path: PipeNavPathSegment[]): boolean {
  return path.length === 1 && path[0]?.kind === 'stack'
}

/** Merge param layers; later layers override earlier keys, earlier fill gaps. */
export function mergeParamScopeLayers(layers: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) out[key] = value
    }
  }
  return out
}

/** Local projection: params stored at one nav scope for editing UI (not merged with stage params). */
export function resolveLocalScopeParams(
  binding: TransformerPipeBinding | undefined,
  scopePath?: PipeNavPathSegment[],
): Record<string, unknown> {
  if (!binding) return {}
  const path = scopePath ?? []
  if (path.length === 0) return { ...(binding.params ?? {}) }
  const scopeKey = pipeScopeKeyFromPath(path)
  if (isStackRootScopePath(path)) {
    return {
      ...(binding.params ?? {}),
      ...(binding.scopeParams?.[scopeKey] ?? {}),
    }
  }
  return binding.scopeParams?.[scopeKey] ?? {}
}

/** One binding scope layer for runtime merge (contributed at this scope in the tree walk). */
export function resolveBindingScopeLayerParams(
  binding: TransformerPipeBinding,
  scopeKey: string,
): Record<string, unknown> {
  // Runtime predicate is broader than editing (`isStackRootScopePath`): any key starting
  // with `stack:` re-inserts binding.params, including nested keys like `stack:0/member:…`.
  // Harmless only while stack-root edits live on binding.params, not scopeParams['stack:N'].
  if (scopeKey.startsWith('stack:')) {
    return {
      ...(binding.params ?? {}),
      ...(binding.scopeParams?.[scopeKey] ?? {}),
    }
  }
  return binding.scopeParams?.[scopeKey] ?? {}
}
