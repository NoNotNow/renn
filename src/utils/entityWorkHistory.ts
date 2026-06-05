/** Max entity ids stored per project (MRU). */
export const ENTITY_WORK_HISTORY_CAP = 20

/** Push `entityId` to front; dedupe; cap length. */
export function pushEntityWorkHistory(history: readonly string[], entityId: string): string[] {
  const trimmed = entityId.trim()
  if (!trimmed) return [...history]
  const without = history.filter((id) => id !== trimmed)
  return [trimmed, ...without].slice(0, ENTITY_WORK_HISTORY_CAP)
}

/** Keep only ids that still exist in `validIds`. */
export function pruneEntityWorkHistory(history: readonly string[], validIds: ReadonlySet<string>): string[] {
  return history.filter((id) => validIds.has(id))
}

/** Map history order to rank (lower = more recent). Unknown ids get `history.length`. */
export function entityHistoryRank(history: readonly string[], entityId: string): number {
  const idx = history.indexOf(entityId)
  return idx >= 0 ? idx : history.length
}
