/**
 * Builder UI: last runtime error from a custom transformer for the Code tab.
 * Published only when {@link CustomCodeTransformer} has `runtimeEntityId` + `configStackIndex` (set by the registry).
 */

export type CustomTransformerRuntimeErrorSnapshot = {
  entityId: string
  configStackIndex: number
  message: string
}

let snapshot: CustomTransformerRuntimeErrorSnapshot | null = null
const listeners = new Set<() => void>()

export function publishCustomTransformerRuntimeError(payload: CustomTransformerRuntimeErrorSnapshot): void {
  if (
    snapshot &&
    snapshot.entityId === payload.entityId &&
    snapshot.configStackIndex === payload.configStackIndex &&
    snapshot.message === payload.message
  ) {
    return
  }
  snapshot = payload
  for (const l of listeners) l()
}

export function clearCustomTransformerRuntimeErrorForTarget(entityId: string, configStackIndex: number): void {
  if (snapshot?.entityId === entityId && snapshot.configStackIndex === configStackIndex) {
    snapshot = null
    for (const l of listeners) l()
  }
}

/** Clear all listeners’ snapshot (tests, teardown). */
export function clearCustomTransformerRuntimeError(): void {
  if (snapshot === null) return
  snapshot = null
  for (const l of listeners) l()
}

export function subscribeCustomTransformerRuntimeError(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCustomTransformerRuntimeError(): CustomTransformerRuntimeErrorSnapshot | null {
  return snapshot
}
