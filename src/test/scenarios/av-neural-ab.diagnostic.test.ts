/* A/B of the neural drive mode on the static crowd cases: off vs always vs auto (classic stack = off).
 * AV_NEURAL_AB=1 npx vitest run src/test/scenarios/av-neural-ab.diagnostic.test.ts
 * Optional: AV_NEURAL_CASES=narrow-gap,clutter-field limits the cases, AV_NEURAL_MODES=off,auto the modes.
 * Mode `v3` = auto + neuralPolicy v3 + neuralReverse (e.g. AV_NEURAL_MODES=off,auto,v3); AV_NEURAL_V3_WEIGHTS=training-data/policy-evolution/v3cap.json evaluates candidate weights (best.genome). */
import { it } from 'vitest'
import { watchValues } from '@/test/avLab/lab'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { ARENA_CAR_ID } from '@/test/fixtures/avEvasionArena'
import { AV_CROWD_CASES, NEURAL_CROWD_TRIGGER, withNeuralMode } from '@/test/fixtures/avCrowdCases'
import { v3ArmParams } from '@/test/fixtures/avNeuralV3Arm'
import { GOAL_REACH, runScenario, SCENARIO_TIMEOUT } from '@/test/fixtures/avEvasionRunner'

const only = process.env.AV_NEURAL_CASES?.split(',')
const modes = (process.env.AV_NEURAL_MODES ?? 'off,always,auto').split(',') as ('off' | 'always' | 'auto' | 'v3')[]

it.runIf(process.env.AV_NEURAL_AB === '1')('neural A/B on the crowd cases', async () => {
  setAgentObservationWatchActive(true)
  const rows: string[] = []
  for (const c of AV_CROWD_CASES.filter((x) => !only || only.includes(x.name))) {
    for (const mode of modes) {
      let onFrames = 0
      let frames = 0
      let counters = ''
      const t0 = Date.now()
      const m = await runScenario(withNeuralMode(c.spec(), mode === 'v3' ? 'auto' : mode, mode === 'auto' ? NEURAL_CROWD_TRIGGER : mode === 'v3' ? { ...NEURAL_CROWD_TRIGGER, ...v3ArmParams() } : {}), c.seconds, {
        onFrame: () => {
          frames++
          const w = watchValues(ARENA_CAR_ID)
          if (String(w['av.neural'] ?? '').startsWith('on')) onFrames++
          counters = mode === 'off' ? '' : String(w['av.neural.n'] ?? '')
        },
      })
      const reached = m.goalReachT < Infinity
      rows.push(
        `${c.name.padEnd(16)} ${mode.padEnd(6)} reached ${reached ? m.goalReachT.toFixed(1) + 's' : 'NO   '} minGoal ${m.minGoalDist.toFixed(0).padStart(4)} contactFrames ${m.staticContactFrames} minGap ${m.minStaticGap.toFixed(2)} stalled ${m.stalledSec.toFixed(1)} mean ${m.meanSpeed.toFixed(1)} neuralOn ${((onFrames / Math.max(1, frames)) * 100).toFixed(0)}% [${counters}] first ${m.firstContact} wall ${((Date.now() - t0) / 1000).toFixed(0)}s`,
      )
      void GOAL_REACH
    }
  }
  console.log('NEURAL_AB\n' + rows.join('\n'))
}, SCENARIO_TIMEOUT * 20)
