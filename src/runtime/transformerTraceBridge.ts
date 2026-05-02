import type { TransformerTraceStep } from '@/transformers/transformerTrace'

let traceTargetEntityId: string | null = null

/** Builder only: entity whose transformer chain should emit live trace steps each physics frame. */
export function setTransformerTraceTargetEntityId(id: string | null): void {
  traceTargetEntityId = id
}

export function getTransformerTraceTargetEntityId(): string | null {
  return traceTargetEntityId
}

export type TransformerLiveTraceSnapshot = {
  entityId: string
  steps: TransformerTraceStep[]
}

let snapshot: TransformerLiveTraceSnapshot | null = null
const listeners = new Set<() => void>()

export function publishTransformerLiveTrace(entityId: string, steps: TransformerTraceStep[]): void {
  snapshot = { entityId, steps }
  for (const l of listeners) l()
}

export function clearTransformerLiveTraceSnapshot(): void {
  snapshot = null
  for (const l of listeners) l()
}

export function subscribeTransformerLiveTrace(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTransformerLiveTraceSnapshot(): TransformerLiveTraceSnapshot | null {
  return snapshot
}
