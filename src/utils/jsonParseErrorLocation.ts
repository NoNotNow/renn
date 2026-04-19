/**
 * Extract the character position from a JSON.parse error message
 * and convert it to line/column for user-facing diagnostics.
 */

export function extractJsonErrorPosition(message: string): number | null {
  const m = /position (\d+)/i.exec(message)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export function lineColFromPosition(text: string, pos: number): { line: number; col: number; lineText: string } {
  const before = text.slice(0, pos)
  const parts = before.split('\n')
  const line = parts.length
  const col = parts[parts.length - 1]!.length + 1
  const lineStart = before.lastIndexOf('\n') + 1
  const lineEnd = text.indexOf('\n', pos)
  const end = lineEnd >= 0 ? lineEnd : text.length
  const lineText = text.slice(lineStart, end)
  return { line, col, lineText }
}
