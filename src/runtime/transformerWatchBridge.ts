/**
 * Builder UI: labeled watch values from custom transformer `api.watch` calls.
 * Published only when the bridge is enabled and the transformer has entity + stack index.
 */

export type TransformerWatchEntry = {
  entityId: string
  configStackIndex: number
  label: string
  value: string
  runId: number
  updatedAt: number
}

const EMPTY_ENTRIES: ReadonlyMap<string, TransformerWatchEntry> = new Map()
const EMPTY_TARGET_LIST: readonly TransformerWatchEntry[] = []

let entriesByKey: ReadonlyMap<string, TransformerWatchEntry> = EMPTY_ENTRIES
let entriesByTargetCache: ReadonlyMap<string, readonly TransformerWatchEntry[]> = new Map()
let watchEnabled = false
let currentRunId = 0
const listeners = new Set<() => void>()

function rebuildEntriesByTargetCache(): void {
  const next = new Map<string, TransformerWatchEntry[]>()
  for (const entry of entriesByKey.values()) {
    const targetKey = `${entry.entityId}:${entry.configStackIndex}`
    const list = next.get(targetKey) ?? []
    list.push(entry)
    next.set(targetKey, list)
  }
  const frozen = new Map<string, readonly TransformerWatchEntry[]>()
  for (const [targetKey, list] of next) {
    list.sort((a, b) => a.label.localeCompare(b.label))
    frozen.set(targetKey, list)
  }
  entriesByTargetCache = frozen
}

export function watchEntryKey(entityId: string, configStackIndex: number, label: string): string {
  return `${entityId}:${configStackIndex}:${label}`
}

function notifyListeners(): void {
  rebuildEntriesByTargetCache()
  for (const l of listeners) l()
}

export function setTransformerWatchEnabled(enabled: boolean): void {
  if (watchEnabled === enabled) return
  watchEnabled = enabled
}

export function isTransformerWatchEnabled(): boolean {
  return watchEnabled
}

export function getTransformerWatchRunId(): number {
  return currentRunId
}

export function setTransformerWatchRunId(runId: number): void {
  if (!Number.isFinite(runId) || runId < 0) return
  currentRunId = Math.floor(runId)
}

export function incrementTransformerWatchRunId(): number {
  currentRunId += 1
  return currentRunId
}

export function publishTransformerWatchEntry(payload: {
  entityId: string
  configStackIndex: number
  label: string
  value: string
  runId?: number
}): void {
  if (!watchEnabled) return
  const key = watchEntryKey(payload.entityId, payload.configStackIndex, payload.label)
  const nextEntry: TransformerWatchEntry = {
    entityId: payload.entityId,
    configStackIndex: payload.configStackIndex,
    label: payload.label,
    value: payload.value,
    runId: payload.runId ?? currentRunId,
    updatedAt: performance.now(),
  }
  const existing = entriesByKey.get(key)
  if (
    existing &&
    existing.value === nextEntry.value &&
    existing.runId === nextEntry.runId
  ) {
    return
  }
  const next = new Map(entriesByKey)
  next.set(key, nextEntry)
  entriesByKey = next
  notifyListeners()
}

export function clearTransformerWatchEntries(): void {
  if (entriesByKey === EMPTY_ENTRIES || entriesByKey.size === 0) return
  entriesByKey = EMPTY_ENTRIES
  notifyListeners()
}

export function clearTransformerWatchEntriesForTarget(entityId: string, configStackIndex: number): void {
  let changed = false
  const next = new Map(entriesByKey)
  for (const [key, entry] of next) {
    if (entry.entityId === entityId && entry.configStackIndex === configStackIndex) {
      next.delete(key)
      changed = true
    }
  }
  if (!changed) return
  entriesByKey = next.size === 0 ? EMPTY_ENTRIES : next
  notifyListeners()
}

/** Clear all stored entries (tests, teardown). */
export function resetTransformerWatchBridgeForTests(): void {
  entriesByKey = EMPTY_ENTRIES
  entriesByTargetCache = new Map()
  watchEnabled = false
  currentRunId = 0
  notifyListeners()
}

export function subscribeTransformerWatch(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTransformerWatchEntries(): ReadonlyMap<string, TransformerWatchEntry> {
  return entriesByKey
}

export function getTransformerWatchEntriesForTarget(
  entityId: string,
  configStackIndex: number,
): readonly TransformerWatchEntry[] {
  return entriesByTargetCache.get(`${entityId}:${configStackIndex}`) ?? EMPTY_TARGET_LIST
}
