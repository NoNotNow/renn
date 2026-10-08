/**
 * Fitness (minimise) + hard-constraint scoring. Pure functions.
 *
 *   fitness = sum_s w_s * ( meanT_s + (unreached*wU + hits*wH + reversals*wR + reverseS*wRS + contactFrames*wC) / n_s ) + keyCost * activeKeys
 *   s in {solo, flee, flee-real}; meanT = mean exit time with timeout (unreached episodes count the timeout).
 * Defaults: solo 0.5, flee 1, flee-real 1; wU 30 s per unreached start, wH 3 s per hit, wR 0.5 s per reversal, wRS 0.2 s per reverse-second,
 * wC 0.05 s per contact frame, keyCost 0.05 s per active key (parsimony tie-break toward sparse profiles).
 * Infeasible score = infeasOffset + violW * violation + fitness (or base fitness when the harness was skipped), so every feasible
 * candidate ranks above every infeasible one and the violation gives a gradient back to feasibility.
 */
import type { EpResult } from '../hunt-maze/episode'
import type { CaseResult } from './probe/proxy'

export interface FitWeights {
  scen: Record<string, number>
  unreached: number; hit: number; reversal: number; reverseS: number; contactFrame: number
  keyCost: number; infeasOffset: number; violW: number
}
export const DEFAULT_WEIGHTS: FitWeights = {
  scen: { solo: 0.5, flee: 1, 'flee-real': 1 },
  unreached: 30, hit: 3, reversal: 0.5, reverseS: 0.2, contactFrame: 0.05,
  keyCost: 0.05, infeasOffset: 500, violW: 200,
}

export interface ScenSummary {
  n: number; reached: number; meanExit: number; meanTimeout: number
  hits: number; reversals: number; reverseS: number; contactEps: number; contactFrames: number
}
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
export function summarise(rs: EpResult[]): ScenSummary {
  const ok = rs.filter((r) => r.reached)
  const sum = (f: (r: EpResult) => number) => rs.reduce((s, r) => s + f(r), 0)
  return {
    n: rs.length, reached: ok.length, meanExit: mean(ok.map((r) => r.exitT)), meanTimeout: mean(rs.map((r) => r.exitT)),
    hits: sum((r) => r.hits), reversals: mean(rs.map((r) => r.reversals)), reverseS: mean(rs.map((r) => r.reverseS)),
    contactEps: sum((r) => r.contactEvents), contactFrames: sum((r) => r.contactFrames),
  }
}
export function byScenario(eps: EpResult[]): Record<string, ScenSummary> {
  const out: Record<string, ScenSummary> = {}
  for (const k of [...new Set(eps.map((e) => e.kind))]) out[k] = summarise(eps.filter((e) => e.kind === k))
  return out
}

export function harnessFitness(eps: EpResult[], w: FitWeights = DEFAULT_WEIGHTS, nKeys = 0): { fitness: number; per: Record<string, ScenSummary> } {
  let fit = w.keyCost * nKeys
  for (const k of [...new Set(eps.map((e) => e.kind))]) {
    const rs = eps.filter((e) => e.kind === k)
    const n = rs.length
    const sum = (f: (r: EpResult) => number) => rs.reduce((s, r) => s + f(r), 0)
    const pen = w.unreached * rs.filter((r) => !r.reached).length + w.hit * sum((r) => r.hits) + w.reversal * sum((r) => r.reversals) + w.reverseS * sum((r) => r.reverseS) + w.contactFrame * sum((r) => r.contactFrames)
    fit += (w.scen[k] ?? 1) * (mean(rs.map((r) => r.exitT)) + pen / n)
  }
  return { fitness: fit, per: byScenario(eps) }
}

/** Violation of one case relative to the base's own margins: only failing cases count; only margins worse than min(base slack, 0). */
export function caseViolation(r: CaseResult, base?: CaseResult): number {
  if (r.pass) return 0
  let v = 0
  for (const m of r.margins) {
    if (m.slack >= 0) continue
    const ref = Math.min(base?.margins.find((b) => b.key === m.key)?.slack ?? 0, 0)
    v += Math.max(0, ref - m.slack) / Math.max(Math.abs(m.limit), 1)
  }
  return Math.max(v, 0.1) // a failing case without a worse-than-base margin (e.g. text-only criterion) still counts
}
export interface ConstraintScore { violation: number; failing: string[]; feasible: boolean }
export interface IdCase { id: string; r: CaseResult }
export function constraintScore(results: IdCase[], base: Record<string, CaseResult>): ConstraintScore {
  const failing: string[] = []
  let violation = 0
  for (const { id, r } of results) {
    if (r.pass) continue
    failing.push(id)
    violation += caseViolation(r, base[id])
  }
  return { violation, failing, feasible: failing.length === 0 }
}

export function infeasibleScore(violation: number, fitness: number, w: FitWeights = DEFAULT_WEIGHTS): number {
  return w.infeasOffset + w.violW * violation + fitness
}
