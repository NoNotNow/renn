/**
 * Slice 4: pinned car fixture, scripted throttle/steer, timeline + motion after N sim seconds.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  buildScriptedRawInput,
  createLogicVerificationHost,
  DEFAULT_LOGIC_VERIFICATION_DT,
} from '@/agent/logicVerificationHost'
import {
  AGENT_VERIFICATION_CAR_DRIVE_SIM_SECONDS,
  AGENT_VERIFICATION_CAR_ENTITY_ID,
  AGENT_VERIFICATION_CAR_WARMUP_STEPS,
  agentCarDriveStepCount,
  buildAgentCarDriveInputScript,
  loadAgentVerificationCarWorld,
} from '@/agent/fixtures/agentVerificationCarWorld'
import { resetTransformerWatchBridgeForTests } from '@/runtime/transformerWatchBridge'
import { resetTransformerTraceBridgeForTests } from '@/runtime/transformerTraceBridge'

describe('Agent car verification (integration)', () => {
  afterEach(() => {
    resetTransformerWatchBridgeForTests()
    resetTransformerTraceBridgeForTests()
  })

  it('drives pinned car fixture for N sim seconds and records pose timeline', async () => {
    const dt = DEFAULT_LOGIC_VERIFICATION_DT
    const host = await createLogicVerificationHost({
      world: loadAgentVerificationCarWorld(),
      dt,
      warmupSteps: AGENT_VERIFICATION_CAR_WARMUP_STEPS,
    })

    const settled = host.snapshot()
    const startZ = settled.poses[AGENT_VERIFICATION_CAR_ENTITY_ID]!.position[2]

    host.registerObservationProbes([
      {
        id: 'carPose',
        kind: 'entityPose',
        entityId: AGENT_VERIFICATION_CAR_ENTITY_ID,
        intervalMs: 50,
      },
      {
        id: 'carBody',
        kind: 'entityBody',
        entityId: AGENT_VERIFICATION_CAR_ENTITY_ID,
        intervalMs: 50,
      },
    ])
    host.startObservationRun()

    const driveSteps = agentCarDriveStepCount(AGENT_VERIFICATION_CAR_DRIVE_SIM_SECONDS, dt)
    const driven = host.runSteps(driveSteps, buildAgentCarDriveInputScript())

    expect(driven.simTime).toBeCloseTo(
      (AGENT_VERIFICATION_CAR_WARMUP_STEPS + driveSteps) * dt,
      5,
    )
    expect(driven.poses[AGENT_VERIFICATION_CAR_ENTITY_ID]!.position[2]).toBeLessThan(startZ)

    const timeline = host.getObservationTimeline()
    expect(timeline.length).toBeGreaterThan(0)

    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i]!.simTime).toBeGreaterThanOrEqual(timeline[i - 1]!.simTime)
    }

    const withPose = timeline.filter((row) => row.rows.carPose !== undefined)
    expect(withPose.length).toBeGreaterThan(0)
    const lastPose = withPose[withPose.length - 1]!.rows.carPose as {
      position: [number, number, number]
    }
    expect(lastPose.position[2]).toBeLessThan(startZ)

    const withBody = timeline.filter((row) => row.rows.carBody !== undefined)
    expect(withBody.length).toBeGreaterThan(0)
    const maxForwardSpeed = withBody.reduce((max, row) => {
      const body = row.rows.carBody as { linvel: [number, number, number] }
      return Math.max(max, Math.abs(body.linvel[2]))
    }, 0)
    expect(maxForwardSpeed).toBeGreaterThan(0.5)

    expect(timeline.some((row) => row.rows.speedZ !== undefined)).toBe(true)

    host.dispose()
  })

  it('surfaces compile errors on observation session for invalid custom stage', async () => {
    const world = loadAgentVerificationCarWorld()
    world.transformers = {
      ...world.transformers,
      bad_stage: {
        type: 'custom',
        priority: 99,
        code: 'this is not valid javascript {',
      },
    }

    const host = await createLogicVerificationHost({
      world,
      dt: DEFAULT_LOGIC_VERIFICATION_DT,
      warmupSteps: 5,
    })

    host.startObservationRun()
    const errors = host.getObservationSession().getCompileErrors()
    expect(errors.some((e) => e.configKey === 'bad_stage')).toBe(true)

    host.dispose()
  })

  it('does not advance car without throttle when observation run is inactive', async () => {
    const host = await createLogicVerificationHost({
      world: loadAgentVerificationCarWorld(),
      dt: DEFAULT_LOGIC_VERIFICATION_DT,
      warmupSteps: AGENT_VERIFICATION_CAR_WARMUP_STEPS,
    })

    const before = host.snapshot().poses[AGENT_VERIFICATION_CAR_ENTITY_ID]!.position[2]
    host.runSteps(60, () => buildScriptedRawInput({}))
    const after = host.snapshot().poses[AGENT_VERIFICATION_CAR_ENTITY_ID]!.position[2]
    expect(after).toBeCloseTo(before, 2)

    host.dispose()
  })
})
