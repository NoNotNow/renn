/**
 * Ship gate for v3 policies (pure, unit-tested; used by tools/policy-evolution/ship.ts). Decides on HOLDOUT FINISH COUNT, not fitness:
 *  (1) total finished episodes of the candidate must be STRICTLY higher than the shipped policy's, and
 *  (2) no kind may be clearly worse: cand finished >= shipped finished - kindTolerance(n), with
 *      kindTolerance(n) = max(1, ceil(5 % of n)) episodes (a kind may lose at most 1 episode or 5 pp, whichever is larger).
 * Fitness is reported next to it but never part of the decision.
 */
export interface KindFinish {
  kind: string
  /** finished episodes (chains) of the kind */
  finished: number
  /** episodes (chains) of the kind */
  chains: number
}

export const KIND_TOLERANCE_FRACTION = 0.05
export const KIND_TOLERANCE_MIN = 1

/** Episodes a kind with n episodes may lose against the shipped policy. */
export const kindTolerance = (n: number): number => Math.max(KIND_TOLERANCE_MIN, Math.ceil(KIND_TOLERANCE_FRACTION * n - 1e-9))

export interface KindGateRow {
  kind: string
  cand: number
  shipped: number
  n: number
  delta: number
  tolerance: number
  ok: boolean
}

export interface ShipDecision {
  ship: boolean
  candTotal: number
  shippedTotal: number
  totalOk: boolean
  rows: KindGateRow[]
  /** kinds that lose more than the tolerance */
  worseKinds: string[]
  /** one line naming the failed condition(s), or the passing summary */
  verdict: string
}

export function shipDecision(candPerKind: readonly KindFinish[], shippedPerKind: readonly KindFinish[]): ShipDecision {
  const sh = new Map(shippedPerKind.map((k) => [k.kind, k]))
  const rows: KindGateRow[] = candPerKind.map((c) => {
    const s = sh.get(c.kind)
    const shipped = s?.finished ?? 0
    const n = Math.max(c.chains, s?.chains ?? 0)
    const tolerance = kindTolerance(n)
    return { kind: c.kind, cand: c.finished, shipped, n, delta: c.finished - shipped, tolerance, ok: c.finished >= shipped - tolerance }
  })
  const candTotal = candPerKind.reduce((a, k) => a + k.finished, 0)
  const shippedTotal = shippedPerKind.reduce((a, k) => a + k.finished, 0)
  const totalOk = candTotal > shippedTotal
  const worseKinds = rows.filter((r) => !r.ok).map((r) => r.kind)
  const fails: string[] = []
  if (!totalOk) fails.push(`(1) total finished ${candTotal} is not strictly higher than shipped ${shippedTotal}`)
  if (worseKinds.length) fails.push(`(2) kind(s) clearly worse than tolerance allows: ${worseKinds.join(', ')}`)
  const ship = fails.length === 0
  const verdict = ship ? `SHIP: total finished ${candTotal} > ${shippedTotal} and no kind worse than tolerance` : `KEEP: ${fails.join('; ')}`
  return { ship, candTotal, shippedTotal, totalOk, rows, worseKinds, verdict }
}

export function formatShipDecision(d: ShipDecision, candFitness: number, shippedFitness: number): string {
  const lines = [`SHIP GATE (HOLDOUT finish count; tolerance per kind = max(${KIND_TOLERANCE_MIN} episode, ceil(${KIND_TOLERANCE_FRACTION * 100} % of n)))`]
  for (const r of d.rows) lines.push(`  ${r.kind.padEnd(9)} cand ${r.cand}/${r.n}  shipped ${r.shipped}/${r.n}  delta ${r.delta >= 0 ? '+' : ''}${r.delta}  (tol ${r.tolerance})  ${r.ok ? 'OK' : 'WORSE'}`)
  lines.push(`  total     cand ${d.candTotal}  shipped ${d.shippedTotal}  ${d.totalOk ? 'OK' : 'NOT HIGHER'}`)
  lines.push(`  fitness (report only, not decisive): cand ${candFitness.toFixed(3)}  shipped ${shippedFitness.toFixed(3)}`)
  lines.push(`  ${d.verdict}`)
  return lines.join('\n')
}
