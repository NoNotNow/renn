import { afterAll, describe, expect, it } from 'vitest'
import { REUSE_CASES, REUSE_VEHICLES } from '@/test/fixtures/avReuseCases'
import { SCENARIO_TIMEOUT, SEED, f1, runScenario } from '@/test/fixtures/avEvasionRunner'

/** One describe per vehicle (own test file each so the vehicles run in parallel). Cases: `fixtures/avReuseCases.ts`. */
export function defineReuseSuite(vehicleId: string): void {
  const v = REUSE_VEHICLES.find((x) => x.id === vehicleId)
  if (!v) throw new Error(`unknown reuse vehicle ${vehicleId}`)
  const rows: string[] = []
  describe(`AV reuse: ${v.id} (${v.about}) with preset + goal only`, () => {
    afterAll(() => {
      console.log(`\nAV REUSE ${v.id} (seed ${SEED}):\n${rows.join('\n')}\n`)
    })
    for (const c of REUSE_CASES) {
      it(
        `${c.name}: ${c.about}`,
        async () => {
          const m = await runScenario(c.spec(v), c.seconds)
          const failed = c.criteria(m, v)
          rows.push(
            `${failed.length ? 'FAIL' : 'PASS'} ${c.name.padEnd(16)} t8 ${f1(m.t8)} s | launch dv ${f1(m.launchMaxDv)} | peak ${f1(m.peakSpeed)} m/s | goal ${m.goalReachT === Infinity ? 'never (min ' + f1(m.minGoalDist) + ' m)' : f1(m.goalReachT) + ' s'} | rev ${m.reversals} shuttle ${m.shuttleEvents} | static ${m.staticContactFrames}f chaser ${m.chaserContactFrames}f | min gap ${f1(m.minChaserGap)} | stalled ${f1(m.stalledSec)} s` + (m.firstContact ? ` | first contact ${m.firstContact}` : '') +
              (failed.length ? `\n      -> ${failed.join('; ')}` : ''),
          )
          expect(failed).toEqual([])
        },
        SCENARIO_TIMEOUT * 2,
      )
    }
  })
}
