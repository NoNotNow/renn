/**
 * Builder UI: runtime errors from custom transformers for the Transformer code tab.
 * Published only when {@link CustomCodeTransformer} has `runtimeEntityId` + `configStackIndex` (set by the registry).
 * Multiple transformers in a chain can error simultaneously — one entry per entity + stack index.
 */

export type CustomTransformerRuntimeErrorSnapshot = {
  entityId: string
  configStackIndex: number
  message: string
  stack?: string
  /** Authoring source bound on the failing transformer instance. */
  code: string
  /** Line number in user code where the error occurred (1-indexed), if available. */
  lineNumber?: number
}

const EMPTY_ERRORS: ReadonlyMap<string, CustomTransformerRuntimeErrorSnapshot> = new Map()

let errorsByTarget: ReadonlyMap<string, CustomTransformerRuntimeErrorSnapshot> = EMPTY_ERRORS
const listeners = new Set<() => void>()

export function runtimeErrorTargetKey(entityId: string, configStackIndex: number): string {
  return `${entityId}:${configStackIndex}`
}

function normStack(stack: string | undefined): string {
  return typeof stack === 'string' ? stack.trim() : ''
}

function sameSnapshot(
  a: CustomTransformerRuntimeErrorSnapshot,
  b: CustomTransformerRuntimeErrorSnapshot,
): boolean {
  return (
    a.entityId === b.entityId &&
    a.configStackIndex === b.configStackIndex &&
    a.message === b.message &&
    normStack(a.stack) === normStack(b.stack) &&
    a.code === b.code &&
    a.lineNumber === b.lineNumber
  )
}

function notifyListeners(): void {
  for (const l of listeners) l()
}

export function publishCustomTransformerRuntimeError(payload: CustomTransformerRuntimeErrorSnapshot): void {
  const key = runtimeErrorTargetKey(payload.entityId, payload.configStackIndex)
  const existing = errorsByTarget.get(key)
  if (existing && sameSnapshot(existing, payload)) {
    return
  }
  const next = new Map(errorsByTarget)
  next.set(key, payload)
  errorsByTarget = next
  notifyListeners()
}

export function clearCustomTransformerRuntimeErrorForTarget(entityId: string, configStackIndex: number): void {
  const key = runtimeErrorTargetKey(entityId, configStackIndex)
  if (!errorsByTarget.has(key)) return
  const next = new Map(errorsByTarget)
  next.delete(key)
  errorsByTarget = next.size === 0 ? EMPTY_ERRORS : next
  notifyListeners()
}

/** Clear all stored errors (tests, teardown). */
export function clearCustomTransformerRuntimeError(): void {
  if (errorsByTarget === EMPTY_ERRORS || errorsByTarget.size === 0) return
  errorsByTarget = EMPTY_ERRORS
  notifyListeners()
}

export function subscribeCustomTransformerRuntimeError(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** All active runtime errors keyed by {@link runtimeErrorTargetKey}. */
export function getCustomTransformerRuntimeErrors(): ReadonlyMap<string, CustomTransformerRuntimeErrorSnapshot> {
  return errorsByTarget
}

export function getCustomTransformerRuntimeErrorForTarget(
  entityId: string,
  configStackIndex: number,
): CustomTransformerRuntimeErrorSnapshot | null {
  return errorsByTarget.get(runtimeErrorTargetKey(entityId, configStackIndex)) ?? null
}

/**
 * Back-compat helper for single-error callers/tests.
 * Returns the only stored error, or the first when several exist.
 */
export function getCustomTransformerRuntimeError(): CustomTransformerRuntimeErrorSnapshot | null {
  if (errorsByTarget.size === 0) return null
  return errorsByTarget.values().next().value ?? null
}
