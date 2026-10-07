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

/**
 * One named layer of a stage's param stack, lowest first: `preset` < `stage` < `binding` (stack root) <
 * `scope` (nested pipe) < `member` (one stage inside its pipe). Later layers win key by key.
 */
export type ParamLayerKind = 'preset' | 'stage' | 'binding' | 'scope' | 'member'

export interface ParamLayer {
  kind: ParamLayerKind
  /** Human name: pipe name for binding / scope, stage name for member. */
  label: string
  /** `binding.scopeParams` key for `scope` / `member` layers, '' for the stack root binding. */
  scopeKey: string
  /** Nav path of the layer's scope (stack root for the binding); empty for stage / preset. */
  path: PipeNavPathSegment[]
  params: Record<string, unknown>
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
 * `resolveLocalScopeParams` as a named layer (what the runtime merges at one scope). The stack root is the
 * `binding` layer, nested scopes and stage members are `scope` / `member` layers.
 */
export function localScopeLayer(
  binding: TransformerPipeBinding | undefined,
  scopePath: PipeNavPathSegment[],
  label: string,
  kind?: 'member',
): ParamLayer {
  const root = scopePath.length === 0 || isStackRootScopePath(scopePath)
  return {
    kind: kind ?? (root ? 'binding' : 'scope'),
    label,
    scopeKey: root ? '' : pipeScopeKeyFromPath(scopePath),
    path: scopePath,
    params: resolveLocalScopeParams(binding, scopePath),
  }
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
