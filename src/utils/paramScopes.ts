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

/** Shared projection for editing UI and runtime layer resolution at one nav scope. */
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

/**
 * Params an edit at `scopePath` inherits from the enclosing scopes (stack root and outer nested scopes);
 * the same layering the runtime applies, minus the scope itself.
 */
export function resolveInheritedScopeParams(
  binding: TransformerPipeBinding | undefined,
  scopePath?: PipeNavPathSegment[],
): Record<string, unknown> {
  const path = scopePath ?? []
  const layers: Record<string, unknown>[] = []
  for (let len = 1; len < path.length; len++) {
    layers.push(resolveLocalScopeParams(binding, path.slice(0, len)))
  }
  return mergeParamScopeLayers(layers)
}
