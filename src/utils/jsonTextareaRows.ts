/** Max visible lines for JSON editor textareas before internal scroll. */
export const JSON_TEXTAREA_ROWS_CAP = 30

/** Row count to fit `text`, capped at {@link JSON_TEXTAREA_ROWS_CAP}. */
export function jsonTextareaRows(text: string): number {
  const lines = text.length === 0 ? 1 : text.split('\n').length
  return Math.min(Math.max(lines, 1), JSON_TEXTAREA_ROWS_CAP)
}
