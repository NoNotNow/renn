// B0: in-process constraint proxy. Runs a subset of the hard-constraint scenarios (MAZE_CASES + evasion SCENARIOS) with an
// extraParams override {mazeProfile, mazeProfileHold, budget} on the arena car (which otherwise copies the world's AV binding) and prints,
// per case: pass/fail, failed criteria text, and per-criterion margins (value, limit, slack = limit - value; negative = violated).
// Usage: npx tsx tools/hunt-profile-evo/probe/proxy.ts <set.json|none> [--cases a,b,c] [--budget eco|full] [--out file.json]
// Must run from the repo root with the BASE world.json (no mazeProfile in the binding) so the override is the only profile.
import fs from 'node:fs'
import { MAZE_CASES, type MazeCase } from '@/test/fixtures/avMazeCases'
import { SCENARIOS } from '@/test/fixtures/avEvasionSuite'
import { ARENA_CAR_ID, type ArenaBox } from '@/test/fixtures/avEvasionArena'
import { GOAL_REACH, runScenario, surviveCriteria, type ScenarioMetrics } from '@/test/fixtures/avEvasionRunner'

export type Margin = { key: string; value: number; limit: number; slack: number }
export type CaseResult = { name: string; kind: 'maze' | 'evasion'; pass: boolean; failed: string[]; margins: Margin[]; wallMs: number; goalT: number }

function segCrossesBox(ax: number, az: number, bx: number, bz: number, b: ArenaBox): boolean {
  const swap = Math.abs(Math.round((b.yawDeg ?? 0) / 90)) % 2 === 1
  const hw = (swap ? b.size[1] : b.size[0]) / 2
  const hd = (swap ? b.size[0] : b.size[1]) / 2
  let t0 = 0, t1 = 1
  for (const [p, d, h] of [[ax - b.at[0], bx - ax, hw], [az - b.at[1], bz - az, hd]] as const) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) return false }
    else { const ta = (-h - p) / d, tb = (h - p) / d; t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb)); if (t0 > t1) return false }
  }
  return true
}

/** Mirrors criteria() of src/test/fixtures/avMazeSuite.ts (not exported there) and adds numeric margins. */
function mazeMargins(c: MazeCase, m: ScenarioMetrics, pocketDepth: number, fleeCross: number): Margin[] {
  const out: Margin[] = []
  const mg = (key: string, value: number, limit: number) => out.push({ key, value, limit, slack: limit - value })
  mg('goalT', m.goalReachT === Infinity ? c.seconds * 2 : m.goalReachT, c.seconds)
  mg('reversals', m.reversals, c.maxReversals)
  mg('shuttle', m.shuttleEvents, c.maxShuttle ?? 0)
  mg('shuttleMaxSec', m.shuttleMaxSec, 6)
  mg('staticContact', m.staticContactFrames, 0)
  if (!c.ignoreChasers) mg('chaserContact', m.chaserContactFrames, 0)
  mg('stalledSec', m.stalledSec, c.maxStalledSec ?? 6)
  if (c.maxLatAcc != null) mg('latAcc', m.peakLatAcc, c.maxLatAcc)
  if (c.maxReverseDist != null) mg('reverseDist', m.reverseDist, c.maxReverseDist)
  if (c.maxLeaveSec != null) mg('leaveT', m.leaveT === Infinity ? 999 : m.leaveT, c.maxLeaveSec)
  if (c.minStaticGap != null) mg('staticGap', -m.minStaticGap, -c.minStaticGap)
  if (c.maxPocketDepth != null) mg('pocketDepth', pocketDepth, c.maxPocketDepth)
  if (c.maxFleeCross != null) mg('fleeCross', fleeCross, c.maxFleeCross)
  return out
}

function mazeFailed(c: MazeCase, m: ScenarioMetrics, pocketDepth: number, crossX: number | null, fleeCross: number): string[] {
  const out = surviveCriteria({ maxStalledSec: c.maxStalledSec ?? 6, minEndSpeed: 0, minChaserGap: c.minGap })(m).filter(
    (x) => !(c.ignoreChasers && (x.startsWith('touched a chaser') || x.startsWith('min chaser gap'))),
  )
  if (m.goalReachT === Infinity && !c.noGoal) out.push(`goal not reached (closest ${m.minGoalDist.toFixed(1)} m > ${GOAL_REACH})`)
  if (m.reversals > c.maxReversals) out.push(`${m.reversals} reversals > ${c.maxReversals}`)
  if (c.maxLatAcc != null && m.peakLatAcc > c.maxLatAcc) out.push(`lat acc ${m.peakLatAcc.toFixed(1)} > ${c.maxLatAcc}`)
  if (m.shuttleEvents > (c.maxShuttle ?? 0)) out.push(`${m.shuttleEvents} shuttle > ${c.maxShuttle ?? 0}`)
  if (c.maxReverseDist != null && m.reverseDist > c.maxReverseDist) out.push(`reversed ${m.reverseDist.toFixed(1)} m > ${c.maxReverseDist}`)
  if (c.minReverseMeanSpeed != null && m.reverseDist > 3 && m.reverseMeanSpeed < c.minReverseMeanSpeed) out.push(`mean reverse speed ${m.reverseMeanSpeed.toFixed(1)} < ${c.minReverseMeanSpeed}`)
  if (c.maxLeaveSec != null && m.leaveT > c.maxLeaveSec) out.push(`left start area after ${m.leaveT.toFixed(1)} s > ${c.maxLeaveSec}`)
  if (c.minStaticGap != null && m.minStaticGap < c.minStaticGap) out.push(`min static gap ${m.minStaticGap.toFixed(1)} < ${c.minStaticGap}`)
  if (c.maxPocketDepth != null && pocketDepth > c.maxPocketDepth) out.push(`pocket depth ${pocketDepth.toFixed(1)} > ${c.maxPocketDepth}`)
  if (c.crossing && (crossX === null || crossX < c.crossing.lo || crossX > c.crossing.hi)) out.push(`crossing at ${crossX === null ? 'never' : crossX.toFixed(1)} outside ${c.crossing.lo}..${c.crossing.hi}`)
  if (c.maxFleeCross != null && fleeCross > c.maxFleeCross) out.push(`${fleeCross} flee-through-wall frames > ${c.maxFleeCross}`)
  if (m.shuttleMaxSec > 6) out.push(`shuttle episode ${m.shuttleMaxSec.toFixed(1)} s > 6`)
  return out
}

export async function runMazeCase(c: MazeCase, extra: Record<string, unknown>, budget: 'eco' | 'full'): Promise<CaseResult> {
  const t0 = performance.now()
  const spec = c.spec()
  let pocketDepth = 0, crossX: number | null = null, fleeCross = 0
  const pk = c.pocket
  const m = await runScenario({ ...spec, extraParams: { ...spec.extraParams, budget, ...extra } }, c.seconds, {
    onFrame: ({ sim }) => {
      const p = sim.getPosition(ARENA_CAR_ID)
      const stages = (sim.getRegistry().get(ARENA_CAR_ID)?.transformerChain?.getAll() ?? []) as unknown as { state?: { prevSpeed?: number; flee?: { x: number; z: number } | null } }[]
      const fl = stages.find((q) => q.state && 'prevSpeed' in q.state)?.state?.flee
      const fr = c.fleeRegion
      if (fl && (!fr || (p[0] > fr[0] && p[0] < fr[1] && p[2] > fr[2] && p[2] < fr[3]))) {
        if (spec.boxes?.some((b) => segCrossesBox(p[0], p[2], fl.x, fl.z, b))) fleeCross++
      }
      if (c.crossing && crossX === null && p[c.crossing.axis === 'x' ? 0 : 2] >= c.crossing.at) crossX = p[c.crossing.axis === 'x' ? 2 : 0]
      if (!pk || p[0] < pk.x0 || p[0] > pk.x1 || p[2] < pk.z0 || p[2] > pk.z1) return
      const d = pk.mouth === 'west' ? p[0] - pk.x0 : pk.mouth === 'east' ? pk.x1 - p[0] : pk.mouth === 'north' ? pk.z1 - p[2] : p[2] - pk.z0
      pocketDepth = Math.max(pocketDepth, d)
    },
  })
  const failed = mazeFailed(c, m, pocketDepth, crossX, fleeCross)
  return { name: c.name, kind: 'maze', pass: failed.length === 0, failed, margins: mazeMargins(c, m, pocketDepth, fleeCross), wallMs: performance.now() - t0, goalT: m.goalReachT }
}

export async function runEvasionCase(name: string, extra: Record<string, unknown>, budget: 'eco' | 'full'): Promise<CaseResult> {
  const sc = SCENARIOS.find((s) => s.name === name)!
  const t0 = performance.now()
  const spec = await sc.spec()
  const m = await runScenario({ ...spec, extraParams: { ...spec.extraParams, budget, ...extra } }, sc.seconds)
  const failed = sc.criteria(m)
  const p = m.path
  const straight = /road|straight/.test(name)
  const margins: Margin[] = [
    { key: "staticContact", value: m.staticContactFrames, limit: 0, slack: -m.staticContactFrames },
    { key: "chaserContact", value: m.chaserContactFrames, limit: 0, slack: -m.chaserContactFrames },
    ...(!straight ? [] : [
    { key: 'rmsCross', value: p.rmsCross, limit: 0.3, slack: 0.3 - p.rmsCross },
    { key: 'peakCross', value: p.peakCross, limit: 0.6, slack: 0.6 - p.peakCross },
    { key: 'headAmpDeg', value: p.headAmpDeg, limit: 0.5, slack: 0.5 - p.headAmpDeg },
    { key: 'steerRevPerSec', value: m.steerReversalsPerSec, limit: 0.3, slack: 0.3 - m.steerReversalsPerSec },
    ]),
  ]
  return { name, kind: 'evasion', pass: failed.length === 0, failed, margins, wallMs: performance.now() - t0, goalT: m.goalReachT }
}

/** Penalty >= 0, 0 when every criterion is satisfied; sum of normalised violations (smooth in the violation size). */
export function penalty(r: CaseResult): number {
  return r.margins.reduce((s, g) => s + (g.slack < 0 ? -g.slack / Math.max(Math.abs(g.limit), 1) : 0), 0)
}

async function main() {
  const [setArg, ...rest] = process.argv.slice(2)
  const opt = (k: string) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined }
  const extra: Record<string, unknown> = setArg && setArg !== 'none' ? JSON.parse(fs.readFileSync(setArg, 'utf8')) : { mazeProfile: undefined }
  const budget = (opt('--budget') ?? 'eco') as 'eco' | 'full'
  const wanted = opt('--cases')?.split(',')
  const res: CaseResult[] = []
  for (const c of MAZE_CASES) if (!wanted || wanted.includes(c.name)) if (!(c.fullBudgetOnly && budget !== 'full')) res.push(await runMazeCase(c, extra, budget))
  for (const s of SCENARIOS) if (wanted && wanted.includes(s.name)) res.push(await runEvasionCase(s.name, extra, budget))
  for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name.padEnd(24)} ${(r.wallMs / 1000).toFixed(1)}s pen ${penalty(r).toFixed(2)} ${r.failed.join('; ')}`)
  console.log(`TOTAL wall ${(res.reduce((s, r) => s + r.wallMs, 0) / 1000).toFixed(1)} s, fails ${res.filter((r) => !r.pass).length}/${res.length}`)
  const out = opt('--out')
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1))
}
if (process.argv[1]?.endsWith('proxy.ts')) main().catch((e) => { console.error(e); process.exit(1) })
