const MAX_WATCH_VALUE_CHARS = 240

function truncateWatchValue(text: string): string {
  if (text.length <= MAX_WATCH_VALUE_CHARS) return text
  return `${text.slice(0, MAX_WATCH_VALUE_CHARS)}…`
}

/** Format an arbitrary watch value for display in the Watch panel. */
export function formatWatchValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return truncateWatchValue(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value)
    return truncateWatchValue(String(value))
  }
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'bigint') return truncateWatchValue(value.toString())
  if (typeof value === 'symbol') return truncateWatchValue(value.toString())
  if (typeof value === 'function') return '[Function]'

  try {
    return truncateWatchValue(JSON.stringify(value))
  } catch {
    return truncateWatchValue(Object.prototype.toString.call(value))
  }
}
