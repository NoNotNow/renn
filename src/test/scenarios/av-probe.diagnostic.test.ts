import { it } from 'vitest'
import { forwardSpeed, watchValues } from '@/test/avLab/lab'
import { ARENA_CAR_ID, type ArenaSpec } from '@/test/fixtures/avEvasionArena'
import { SCENARIOS } from '@/test/fixtures/avEvasionSuite'
import { MAZE_CASES } from '@/test/fixtures/avMazeCases'
import { buildSweepCases } from '@/test/fixtures/avEvasionSweepCases'
import { runScenario } from '@/test/fixtures/avEvasionRunner'

/**
 * Fixed env-driven probe (instead of ad-hoc probe tests). One compact line per tick: t x z v then the requested keys.
 *   AV_PROBE_CASE=corner-trap AV_PROBE_KEYS=av.vLimit,av.mode [AV_PROBE_EVERY=10] [AV_PROBE_FROM=2 AV_PROBE_TO=6] [AV_PARAMS='{"cruiseSpeed":12}']
 *   npx vitest run src/test/scenarios/av-probe.diagnostic.test.ts
 * CASE = evasion scenario name, maze case name or sweep case id. Skipped without AV_PROBE_CASE.
 */
const caseName = process.env.AV_PROBE_CASE

async function resolveCase(name: string): Promise<{ spec: ArenaSpec; seconds: number }> {
  const ev = SCENARIOS.find((s) => s.name === name)
  if (ev) return { spec: await ev.spec(), seconds: ev.seconds }
  const mz = MAZE_CASES.find((c) => c.name === name)
  if (mz) return { spec: mz.spec(), seconds: mz.seconds }
  const sw = buildSweepCases().find((c) => c.id === name)
  if (sw) return { spec: sw.spec, seconds: sw.seconds }
  throw new Error(`no evasion / maze / sweep case "${name}"`)
}

it.runIf(!!caseName)(`probe ${caseName}`, async () => {
  const keys = (process.env.AV_PROBE_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean)
  const every = Math.max(1, Number(process.env.AV_PROBE_EVERY ?? 10))
  const from = Number(process.env.AV_PROBE_FROM ?? 0)
  const to = Number(process.env.AV_PROBE_TO ?? Infinity)
  const { spec, seconds } = await resolveCase(caseName!)
  const lines: string[] = [`t x z v ${keys.join(' ')}`]
  const fmt = (v: unknown) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v == null ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  await runScenario(spec, Math.min(seconds, to), {
    onFrame: ({ t, frame, sim }) => {
      if (t < from || frame % every !== every - 1) return
      const p = sim.getPosition(ARENA_CAR_ID)
      const v = forwardSpeed(sim.getRotation(ARENA_CAR_ID), sim.getVelocity(ARENA_CAR_ID))
      const w = watchValues(ARENA_CAR_ID)
      lines.push([t.toFixed(2), p[0].toFixed(1), p[2].toFixed(1), v.toFixed(1), ...keys.map((k) => fmt(w[k]))].join(' '))
    },
  })
  console.log(`PROBE ${caseName} (${seconds}s)\n${lines.join('\n')}`)
}, 120_000)
