/** Pure (browser-safe) planar geometry + vehicle pose helpers shared by the node lab fixtures and the evolution evaluator. */

export type V2 = [number, number]

/** Direction vector of a heading (0 = -Z; positive yaw turns left). */
export function headingDir(yawRad: number): V2 {
  return [-Math.sin(yawRad), -Math.cos(yawRad)]
}

/** Corners of a rectangle: `w` along its side axis, `l` along its heading (0 = -Z). */
export function rectPoly(cx: number, cz: number, yawRad: number, w: number, l: number): V2[] {
  const f = headingDir(yawRad)
  const s: V2 = [Math.cos(yawRad), -Math.sin(yawRad)]
  const out: V2[] = []
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
    out.push([cx + (a * w * s[0]) / 2 + (b * l * f[0]) / 2, cz + (a * w * s[1]) / 2 + (b * l * f[1]) / 2])
  }
  return out
}

function overlapSat(a: V2[], b: V2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!
      const q = poly[(i + 1) % poly.length]!
      const nx = -(q[1] - p[1])
      const nz = q[0] - p[0]
      let aMin = Infinity
      let aMax = -Infinity
      let bMin = Infinity
      let bMax = -Infinity
      for (const v of a) {
        const d = v[0] * nx + v[1] * nz
        aMin = Math.min(aMin, d)
        aMax = Math.max(aMax, d)
      }
      for (const v of b) {
        const d = v[0] * nx + v[1] * nz
        bMin = Math.min(bMin, d)
        bMax = Math.max(bMax, d)
      }
      if (aMax < bMin || bMax < aMin) return false
    }
  }
  return true
}

function pointSegDist(px: number, pz: number, a: V2, b: V2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))
}

/** Distance between two convex polygons (0 when they overlap). */
export function polyGap(a: V2[], b: V2[]): number {
  if (overlapSat(a, b)) return 0
  let best = Infinity
  for (const [p, q] of [[a, b], [b, a]] as const) {
    for (const v of p) for (let i = 0; i < q.length; i++) best = Math.min(best, pointSegDist(v[0], v[1], q[i]!, q[(i + 1) % q.length]!))
  }
  return best
}

/** Distance from a point to a convex polygon (0 inside). */
export function pointPolyGap(px: number, pz: number, poly: V2[]): number {
  const tiny: V2[] = [[px - 1e-3, pz - 1e-3], [px + 1e-3, pz - 1e-3], [px + 1e-3, pz + 1e-3], [px - 1e-3, pz + 1e-3]]
  return polyGap(tiny, poly)
}

type Quat = { x: number; y: number; z: number; w: number }

/** Heading (rad) of a body: forward = -Z rotated by q, projected onto the floor. */
export function yawOf(q: Quat): number {
  const fx = -(2 * (q.x * q.z + q.w * q.y))
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
  return Math.atan2(fx, fz)
}

/** Signed forward speed (negative = reversing). */
export function forwardSpeed(q: Quat, v: [number, number, number]): number {
  const fx = -(2 * (q.x * q.z + q.w * q.y))
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
  const l = Math.hypot(fx, fz) || 1
  return (v[0] * fx + v[2] * fz) / l
}

/** y component of the body's up axis (1 = upright, <= 0 = on its side / roof). */
export function upY(q: Quat): number {
  return 1 - 2 * (q.x * q.x + q.z * q.z)
}
