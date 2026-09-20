/**
 * Parse agent-facing material color inputs (hex or 0–1 RGB) for MCP tools.
 */

export type Rgba01 = [number, number, number, number]

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function parseHexColor(hex: string): Rgba01 {
  const raw = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  return [r, g, b, 1]
}

export function parseAgentMaterialColorInput(
  color: string | [number, number, number] | [number, number, number, number],
): Rgba01 {
  if (typeof color === 'string') {
    return parseHexColor(color)
  }
  if (color.length === 3) {
    return [clampUnit(color[0]), clampUnit(color[1]), clampUnit(color[2]), 1]
  }
  if (color.length >= 4) {
    return [clampUnit(color[0]), clampUnit(color[1]), clampUnit(color[2]), clampUnit(color[3])]
  }
  throw new Error('color must be hex string or RGB(A) array')
}
