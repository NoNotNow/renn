import { describe, expect, it } from 'vitest'
import { MAZE_CASES } from '@/test/fixtures/avMazeCases'
import { SCENARIO_TIMEOUT, runScenario } from '@/test/fixtures/avEvasionRunner'

/**
 * The maze-relevant constants that used to be hard-coded in the av-stack stages are binding / stage params now (same defaults, so every
 * default run is unchanged). Each param is set to an extreme value and must change the run of at least one maze case: proof it is read.
 */

const PREFERRED = ['gap-entry-wall10', 'maze-u-trap-inside', 'pocket-escape', 'maze-dead-end', 'turnaround-corridor', 'maze-goal-behind-wall', 'maze-b-rev-door', 'maze-u-trap']

const CASES = [...PREFERRED, ...MAZE_CASES.map((c) => c.name).filter((n) => !PREFERRED.includes(n))]

const fingerprint = (m: object) => JSON.stringify(m, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v))

const baseline = new Map<string, string>()

async function run(name: string, extra: Record<string, unknown>): Promise<string> {
  const c = MAZE_CASES.find((x) => x.name === name)!
  const spec = c.spec()
  const m = await runScenario({ ...spec, extraParams: { ...spec.extraParams, budget: 'full', ...extra } }, c.seconds)
  return fingerprint(m)
}

/** Extreme values (default in the comment). */
/** `base`: params the comparison run also carries (a constant only matters in a regime the defaults never enter, e.g. a low cruise speed). */
const BASES: Record<string, Record<string, number | boolean>> = {
  nearTouchDist: { obstacleSlowRadius: 30, obstacleSlowFactor: 0.2, cruiseSpeed: 12 },
  stuckSpeed: { cruiseSpeed: 2, stuckTime: 0.2 },
  nearHitExtra: { revSweepCusp: true },
  maneuverEntryStopSpeed: { revVotes: 6 },
}

const EXTREMES: Record<string, Record<string, number>> = {
  turnAngle1: { turnAngle1: 0.1 }, // 0.5
  turnAngle2: { turnAngle2: 0.4 }, // 1.15
  sweepStep: { sweepStep: 2 }, // 0.75
  requiredExtra: { requiredExtra: 40 }, // 5
  maneuverRunDecel: { maneuverRunDecel: 0.3 }, // 3
  maneuverRunOffset: { maneuverRunOffset: 0 }, // 0.9
  revVotes: { revVotes: 6 }, // 2
  maneuverEntrySpeed: { maneuverEntrySpeed: 0.1 }, // 1.5
  replanCooldown: { replanCooldown: 30 }, // 0.6
  routeLimitHorizon: { routeLimitHorizon: 20 }, // 160
  nearHitExtra: { nearHitExtra: 25 }, // 1.5
  nearTouchDist: { nearTouchDist: 25 }, // 0.3
  aebMinSpeed: { aebMinSpeed: 1000 }, // 0.8
  aebManeuverMargin: { aebManeuverMargin: 5 }, // 0.2
  stuckSpeed: { stuckSpeed: 3 }, // 0.25
  maneuverEntryStopSpeed: { maneuverEntryStopSpeed: 5 }, // 0.3
  revCruiseBehind: { revCruiseBehind: 2 }, // 0.3
  ppMinClearance: { ppMinClearance: 100 }, // 1
  iClamp: { iClamp: 0 }, // 3
  overspeedCut: { overspeedCut: 0.01 }, // 8
  ppMinSpeed: { ppMinSpeed: 1000 }, // 3
  kappaTauSpeed: { kappaTauSpeed: 0.3 }, // 0.008
  kappaTauFast: { kappaTauFast: 0.5 }, // 0.04
}

describe('av-stack maze params are read', () => {
  for (const [key, extra] of Object.entries(EXTREMES)) {
    it(
      `${key} changes a maze run`,
      async () => {
        let changed = ''
        const base = BASES[key] ?? {}
        for (const name of CASES) {
          const bk = name + JSON.stringify(base)
          if (!baseline.has(bk)) baseline.set(bk, await run(name, base))
          if ((await run(name, { ...base, ...extra })) !== baseline.get(bk)) {
            changed = name
            break
          }
        }
        expect(changed, `${key} did not change any of ${CASES.join(', ')}`).not.toBe('')
      },
      SCENARIO_TIMEOUT * 8,
    )
  }
})
