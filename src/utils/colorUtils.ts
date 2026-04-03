import type { Vec3 } from '@/types/world'
import { clampUnit } from './numberUtils'

/**
 * Convert a Vec3 color (RGB values 0-1) to a hex color string
 */
export function colorToHex(color: Vec3): string {
  const [r, g, b] = color.map((c) => Math.round(clampUnit(c) * 255)) as Vec3
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

/** Normalize hex strings for pickers (react-colorful expects 6-digit #rrggbb). */
export function normalizeHexForPicker(hex: string): string {
  const t = hex.trim()
  if (!t) return '#808080'
  const withHash = t.startsWith('#') ? t : `#${t}`
  if (withHash.length === 4) {
    const r = withHash[1]
    const g = withHash[2]
    const b = withHash[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  if (withHash.length >= 7) return withHash.slice(0, 7).toLowerCase()
  return '#808080'
}

/**
 * Convert a hex color string to a Vec3 color (RGB values 0-1)
 */
export function hexToColor(hex: string): Vec3 {
  const sanitized = hex.replace('#', '')
  if (sanitized.length !== 6) {
    return [0.7, 0.7, 0.7]
  }
  const r = parseInt(sanitized.slice(0, 2), 16) / 255
  const g = parseInt(sanitized.slice(2, 4), 16) / 255
  const b = parseInt(sanitized.slice(4, 6), 16) / 255
  return [r, g, b]
}
