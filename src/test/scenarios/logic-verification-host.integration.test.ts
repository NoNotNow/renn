/**
 * Logic verification host: headless load + scripted RawInput + transformer/physics step loop.
 */

import { describe, it, expect } from 'vitest'
import { createLogicVerificationHost } from '@/agent/logicVerificationHost'
import {
  AGENT_VERIFICATION_CAR_WARMUP_STEPS,
  buildAgentCarDriveInputScript,
  loadAgentVerificationCarWorld,
} from '@/agent/fixtures/agentVerificationCarWorld'

describe('LogicVerificationHost (integration)', () => {
  it('loads a world, steps with scripted input, returns poses and sim time', async () => {
    const dt = 1 / 60
    const host = await createLogicVerificationHost({
      world: loadAgentVerificationCarWorld(),
      dt,
      warmupSteps: AGENT_VERIFICATION_CAR_WARMUP_STEPS,
    })

    const settle = host.runSteps(30)
    const startZ = settle.poses.car!.position[2]

    const driveSteps = 120
    const driven = host.runSteps(driveSteps, buildAgentCarDriveInputScript())

    const settleSteps = 30
    const warmupSteps = AGENT_VERIFICATION_CAR_WARMUP_STEPS
    expect(driven.simTime).toBeCloseTo((warmupSteps + settleSteps + driveSteps) * dt, 5)
    expect(driven.stepCount).toBe(warmupSteps + settleSteps + driveSteps)
    expect(driven.poses.car!.position[2]).toBeLessThan(startZ)

    host.dispose()
  })
})
