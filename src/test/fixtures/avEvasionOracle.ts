import { CAR_SIZE, headingDir, initialPuppetState, polyGap, rectPoly, stepPuppet, type ArenaBox, type ArenaSpec, type PuppetSpec, type PuppetState } from '@/test/fixtures/avEvasionArena'

/**
 * Winnability oracle for the sweep: is there ANY open-loop manoeuvre (omniscient: it knows the exact puppet motion) for an idealised
 * car that avoids every chaser / box for the whole run? Idealised car = unicycle from rest, 0.1 s control latency, launch accel 40 m/s^2
 * (measured on the reference car: 0 -> 15 m/s in 0.5 s), top speed 36 m/s, curvature <= 0.115 / m and lateral accel <= 14 m/s^2
 * (so a hard turn is slow), plan = curvature k1 for T1, k2 for T2, then straight, target speed vt.
 * No (k1,T1,k2,T2,vt) clears the chasers by `margin` => no controller can win (a feedback policy has no more information than the
 * oracle), so the case is excluded as physically unwinnable. A case the oracle can win but the AV loses is an AV defect.
 */

export interface OracleResult {
  winnable: boolean
  /** Best plan found (largest minimum gap), or the least-bad one. */
  best: { k1: number; t1: number; k2: number; t2: number; vt: number; minGap: number }
}

const K = [-0.115, -0.08, -0.04, 0, 0.04, 0.08, 0.115]
const T1 = [0.2, 0.5, 0.8, 1.2, 1.8, 2.5, 3.5]
const T2 = [0.5, 1, 2, 3, 5]
const VT = [8, 15, 25, 35]
const DT = 1 / 30
const LATENCY = 0.1

function boxPoly(b: ArenaBox) {
  return rectPoly(b.at[0], b.at[1], ((b.yawDeg ?? 0) * Math.PI) / 180, b.size[0], b.size[1])
}

export function oracle(spec: ArenaSpec, seconds: number, margin = 0.1): OracleResult {
  const r = openLoopOracle(spec, seconds, margin, false)
  if (r.winnable) return r
  const m = mpcOracle(spec, seconds, margin)
  return m.winnable ? m : r
}

/** Largest minimum hull gap (m, capped at 8) any searched manoeuvre achieves: how much room the best possible play has. */
export function oracleMargin(spec: ArenaSpec, seconds: number): number {
  const r = openLoopOracle(spec, seconds, 0.1, true)
  if (r.best.minGap >= 8) return 8
  const m = mpcOracle(spec, seconds, 0.1)
  return Math.min(8, Math.max(r.best.minGap, m.winnable ? m.best.minGap : 0))
}

function openLoopOracle(spec: ArenaSpec, seconds: number, margin: number, maximise: boolean): OracleResult {
  const boxes = spec.boxes.map((b) => ({ poly: boxPoly(b), cx: b.at[0], cz: b.at[1], r: Math.hypot(b.size[0], b.size[1]) / 2 }))
  const startV = spec.car.speed ?? 0
  const steps = Math.round(seconds / DT)
  let best = { k1: 0, t1: 0, k2: 0, t2: 0, vt: 0, minGap: -1 }
  const sim = (k1: number, t1: number, k2: number, t2: number, vt: number, k3 = 0, t3 = 0): number => {
    const floor = maximise ? Math.max(margin, best.minGap) : margin
    let x = spec.car.at[0]
    let z = spec.car.at[1]
    let yaw = (spec.car.yawDeg * Math.PI) / 180
    let v = startV
    const ps = spec.puppets.map((p: PuppetSpec) => ({ p, s: initialPuppetState(p) as PuppetState }))
    let minGap = Infinity
    for (let i = 0; i < steps; i++) {
      const t = i * DT
      const tc = t - LATENCY
      const kCmd = tc < 0 ? 0 : tc < t1 ? k1 : tc < t1 + t2 ? k2 : tc < t1 + t2 + t3 ? k3 : 0
      const tgt = tc < 0 ? startV : vt
      v += Math.max(-40 * DT, Math.min(40 * DT, tgt - v))
      v = Math.min(v, 36)
      const kLim = Math.min(0.115, 14 / (v * v + 1e-6))
      const k = Math.max(-kLim, Math.min(kLim, kCmd))
      yaw += k * v * DT
      const d = headingDir(yaw)
      x += d[0] * v * DT
      z += d[1] * v * DT
      const hull = rectPoly(x, z, yaw, CAR_SIZE[0], CAR_SIZE[1])
      for (const q of ps) {
        stepPuppet(q.p, q.s, t, DT, { pos: [x, z], vel: [d[0] * v, d[1] * v] })
        const dist = Math.hypot(q.s.x - x, q.s.z - z)
        if (dist > 12) {
          minGap = Math.min(minGap, dist - 12)
          continue
        }
        const g = polyGap(hull, rectPoly(q.s.x, q.s.z, q.s.yaw, q.p.size[0], q.p.size[1]))
        if (g < floor) return g
        minGap = Math.min(minGap, g)
      }
      for (const b of boxes) {
        if (Math.hypot(b.cx - x, b.cz - z) > b.r + 6) continue
        const g = polyGap(hull, b.poly)
        if (g < floor) return g
        minGap = Math.min(minGap, g)
      }
    }
    return minGap
  }
  for (const vt of VT) {
    for (const k1 of K) {
      for (const t1 of k1 === 0 ? [0.2] : T1) {
        for (const k2 of K) {
          for (const t2 of k2 === 0 ? [0.5] : T2) {
            const g = sim(k1, t1, k2, t2, vt)
            if (g > best.minGap) best = { k1, t1, k2, t2, vt, minGap: g }
            if (g >= (maximise ? 8 : margin)) return { winnable: true, best }
          }
        }
      }
    }
  }
  // second pass: seeded random 3-segment plans with continuous parameters (the grid above is coarse)
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  for (let i = 0; i < (maximise ? 8000 : 20000); i++) {
    const kr = () => (rnd() < 0.15 ? 0 : (rnd() * 2 - 1) * 0.115)
    const k1 = kr()
    const k2 = kr()
    const k3 = kr()
    const t1 = 0.1 + rnd() * 2.5
    const t2 = 0.1 + rnd() * 3
    const t3 = 0.1 + rnd() * 3
    const vt = 5 + rnd() * 30
    const g = sim(k1, t1, k2, t2, vt, k3, t3)
    if (g > best.minGap) best = { k1, t1, k2, t2, vt, minGap: g }
    if (g >= (maximise ? 8 : margin)) return { winnable: true, best }
  }
  return { winnable: false, best }
}


/**
 * Closed-loop variant: omniscient receding-horizon policy on the same idealised car. Every 0.2 s it picks, from two-segment
 * constant-curvature plans x target speeds simulated 2.5 s ahead against the exact puppet motion, the plan with the largest minimum gap
 * (ties: more speed), applies 0.2 s of it and repeats. Wins when the real (not predicted) gap never drops below `margin` in `seconds`.
 */
function mpcOracle(spec: ArenaSpec, seconds: number, margin: number): OracleResult {
  const boxes = spec.boxes.map((b) => ({ poly: boxPoly(b), cx: b.at[0], cz: b.at[1], r: Math.hypot(b.size[0], b.size[1]) / 2 }))
  interface St { x: number; z: number; yaw: number; v: number; ps: { p: PuppetSpec; s: PuppetState }[] }
  const clone = (a: St): St => ({ x: a.x, z: a.z, yaw: a.yaw, v: a.v, ps: a.ps.map((q) => ({ p: q.p, s: { ...q.s } })) })
  /** Advances `a` by one step with curvature command k / target speed vt; returns the gap to the nearest thing. */
  const step = (a: St, t: number, k: number, vt: number): number => {
    a.v += Math.max(-40 * DT, Math.min(40 * DT, vt - a.v))
    a.v = Math.min(a.v, 36)
    const kLim = Math.min(0.115, 14 / (a.v * a.v + 1e-6))
    a.yaw += Math.max(-kLim, Math.min(kLim, k)) * a.v * DT
    const d = headingDir(a.yaw)
    a.x += d[0] * a.v * DT
    a.z += d[1] * a.v * DT
    const hull = rectPoly(a.x, a.z, a.yaw, CAR_SIZE[0], CAR_SIZE[1])
    let gap = Infinity
    for (const q of a.ps) {
      stepPuppet(q.p, q.s, t, DT, { pos: [a.x, a.z], vel: [d[0] * a.v, d[1] * a.v] })
      const dist = Math.hypot(q.s.x - a.x, q.s.z - a.z)
      gap = Math.min(gap, dist > 12 ? dist - 12 : polyGap(hull, rectPoly(q.s.x, q.s.z, q.s.yaw, q.p.size[0], q.p.size[1])))
    }
    for (const b of boxes) {
      if (Math.hypot(b.cx - a.x, b.cz - a.z) > b.r + 6) continue
      gap = Math.min(gap, polyGap(hull, b.poly))
    }
    return gap
  }
  const KS = [-0.115, -0.07, 0, 0.07, 0.115]
  const VS = [12, 24, 36]
  const H = 2.5
  const real: St = { x: spec.car.at[0], z: spec.car.at[1], yaw: (spec.car.yawDeg * Math.PI) / 180, v: spec.car.speed ?? 0, ps: spec.puppets.map((p) => ({ p, s: initialPuppetState(p) })) }
  let minGap = Infinity
  let t = 0
  const decisions = Math.round(seconds / 0.2)
  let first = true
  for (let di = 0; di < decisions; di++) {
    let bestScore = -Infinity
    let bk = 0
    let bv = 0
    let bk2 = 0
    for (const ka of KS) {
      for (const kb of KS) {
        for (const vt of VS) {
          const a = clone(real)
          let g = Infinity
          for (let i = 0; i < Math.round(H / DT); i++) {
            const tt = t + i * DT
            // the first command only takes effect after the latency (0.1 s), the plan switches after 0.9 s
            const k = i * DT < LATENCY ? 0 : i * DT < 0.9 ? ka : kb
            g = Math.min(g, step(a, tt, k, vt))
            if (g < margin) break
          }
          const score = Math.min(g, 15) * 10 + a.v * 0.1
          if (score > bestScore) {
            bestScore = score
            bk = ka
            bk2 = kb
            bv = vt
          }
        }
      }
    }
    void bk2
    for (let i = 0; i < Math.round(0.2 / DT); i++) {
      const g = step(real, t, first && i * DT < LATENCY ? 0 : bk, bv)
      minGap = Math.min(minGap, g)
      t += DT
      if (g < margin) return { winnable: false, best: { k1: bk, t1: 0, k2: 0, t2: 0, vt: bv, minGap } }
    }
    first = false
  }
  return { winnable: true, best: { k1: 0, t1: 0, k2: 0, t2: 0, vt: 0, minGap } }
}
