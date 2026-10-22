/**
 * Shared top-down thumbnail renderer of the playable training worlds (maze + crux exporters): one course frame per
 * chain / route copy side by side (like the world layout), the chain polyline in its color pair. Also produces the
 * dialog tile geometry: `frames[i].pts` = frame i's chain mapped into svg pixel space, rounded like the svg itself.
 * Extracted from export-maze-training-worlds.ts so the two training-set exporters share one renderer.
 */
import type { CourseBox } from '../../src/policyEvolution/courses'
import type { V2 } from '../../src/avEvolution/eval/geometry'

export const THUMB_H = 220
export const THUMB_MARGIN = 10

/** One rendered course copy: the chain polyline shifted by `ox`, in its direction's color pair. */
export interface ThumbFrame {
  ox: number
  chain: V2[]
  color: string
  startColor: string
}

/** thumbSvg output: the svg markup plus the overlay geometry the dialog tiles need (`w`/`h` = pixel size, `frames[i].pts` = frame i's chain mapped into svg pixel space, rounded like the svg). */
export interface ThumbSvg {
  svg: string
  w: number
  h: number
  frames: Array<{ pts: Array<[number, number]> }>
}

export function thumbSvg(boxes: readonly CourseBox[], frames: ThumbFrame[]): ThumbSvg {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const grow = (x: number, z: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  for (const b of boxes) {
    grow(b.at[0] - b.size[0] / 2, b.at[1] - b.size[1] / 2)
    grow(b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] / 2)
  }
  for (const f of frames) for (const p of f.chain) grow(p[0] + f.ox, p[1])
  const spanX = Math.max(maxX - minX, 1)
  const spanZ = Math.max(maxZ - minZ, 1)
  const scale = (THUMB_H - 2 * THUMB_MARGIN) / spanZ
  const width = Math.ceil(spanX * scale + 2 * THUMB_MARGIN)
  const ox = THUMB_MARGIN + (width - 2 * THUMB_MARGIN - spanX * scale) / 2
  const oz = THUMB_MARGIN + (THUMB_H - 2 * THUMB_MARGIN - spanZ * scale) / 2
  const mx = (x: number) => Math.round((ox + (x - minX) * scale) * 10) / 10
  const mz = (z: number) => Math.round((oz + (z - minZ) * scale) * 10) / 10
  const mapped = frames.map((f) => f.chain.map((p) => [mx(p[0] + f.ox), mz(p[1])] as [number, number]))
  const poly = (pts: V2[], o: number) => pts.map((p) => `${mx(p[0] + o)},${mz(p[1])}`).join(' ')
  const lines: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${THUMB_H}" viewBox="0 0 ${width} ${THUMB_H}">`]
  lines.push(`<rect x="0" y="0" width="${width}" height="${THUMB_H}" fill="#10131a"/>`)
  for (const f of frames) {
    for (const b of boxes) {
      const x = mx(b.at[0] - b.size[0] / 2 + f.ox)
      const y = mz(b.at[1] - b.size[1] / 2)
      lines.push(`<rect x="${x}" y="${y}" width="${Math.round(b.size[0] * scale * 10) / 10}" height="${Math.round(b.size[1] * scale * 10) / 10}" fill="#444a55"/>`)
    }
    lines.push(`<polyline points="${poly(f.chain, f.ox)}" fill="none" stroke="${f.color}" stroke-width="1.5" stroke-opacity="0.9"/>`)
    lines.push(`<circle cx="${mx(f.chain[0]![0] + f.ox)}" cy="${mz(f.chain[0]![1])}" r="5" fill="${f.startColor}"/>`)
    lines.push(`<circle cx="${mx(f.chain[f.chain.length - 1]![0] + f.ox)}" cy="${mz(f.chain[f.chain.length - 1]![1])}" r="5" fill="#ff4444"/>`)
  }
  lines.push('</svg>')
  return { svg: lines.join('\n') + '\n', w: width, h: THUMB_H, frames: mapped.map((pts) => ({ pts })) }
}
