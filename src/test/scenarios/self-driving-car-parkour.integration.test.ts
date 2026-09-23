import { describe, expect, it } from 'vitest'
import {
  buildSelfDrivingParkourBesideWorld,
  buildSelfDrivingParkourWorld,
  SELF_DRIVE_PARKOUR_BESIDE_OBSTACLES,
  SELF_DRIVE_PARKOUR_OBSTACLES,
  SELF_DRIVE_PARKOUR_SEGMENTS,
  SELF_DRIVE_PARKOUR_WAYPOINTS,
  selfDriveGrounded,
  selfDriveParkourBesideGatePass,
  selfDriveParkourPass,
} from '@/test/fixtures/selfDrivingCarWorld'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

describe('self-driving car parkour (integration)', () => {
  it('parkour world JSON: unique entity ids and pipe3 stack', () => {
    const world = buildSelfDrivingParkourWorld()
    const ids = world.entities?.map((e) => e.id) ?? []
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('car')
    expect(ids).toContain('ground')
    for (const obs of SELF_DRIVE_PARKOUR_OBSTACLES) {
      expect(ids).toContain(obs.id)
    }
    const pipe = world.transformerPipes?.pipe3
    expect(pipe?.stageIds?.[0]).toBe('tf_mission')
    expect(pipe?.stageIds).not.toContain('tf_wanderer')
    expect(world.transformers?.tf_mission?.type).toBe('targetPoseInput')
    expect(world.transformers?.tf_wanderer).toBeUndefined()
    const missionPoses = world.transformers?.tf_mission?.params?.poses as unknown[]
    expect(missionPoses?.length).toBeGreaterThanOrEqual(3)
  })

  it('beside-gate mini course: cone + capsule and lateral waypoint', async () => {
    const world = buildSelfDrivingParkourBesideWorld()
    const ids = world.entities?.map((e) => e.id) ?? []
    for (const obs of SELF_DRIVE_PARKOUR_BESIDE_OBSTACLES) {
      expect(ids).toContain(obs.id)
    }
    const poses = world.transformers?.tf_mission?.params?.poses as Array<{ position: number[] }>
    expect(Math.abs(poses[1]?.position[0] ?? 0)).toBeGreaterThan(6)

    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(world, 15)
    try {
      const startPos = sim.getPosition('car')
      let maxAbsX = 0
      const frames = 920
      for (let frame = 0; frame < frames; frame++) {
        sim.runFrames(1)
        maxAbsX = Math.max(maxAbsX, Math.abs(sim.getPosition('car')[0]))
      }
      const endPos = sim.getPosition('car')
      expect(selfDriveParkourBesideGatePass({ startPos, endPos, maxAbsX })).toBe(true)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  })

  it('completes parkour course within frame budget', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(buildSelfDrivingParkourWorld(), 15)
    try {
      const startPos = sim.getPosition('car')
      let minY = startPos[1]
      let maxAbsX = 0
      /** Full course ~1550f @ 60Hz after beside-cone leg; documented in improvement log. */
      const frames = SELF_DRIVE_PARKOUR_SEGMENTS.full.frames
      for (let frame = 0; frame < frames; frame++) {
        sim.runFrames(1)
        const pos = sim.getPosition('car')
        const absX = Math.abs(pos[0])
        if (absX > maxAbsX) maxAbsX = absX
        if (pos[1] < minY) minY = pos[1]
      }
      const endPos = sim.getPosition('car')
      expect(minY).toBeGreaterThan(-0.55)
      expect(selfDriveGrounded(endPos)).toBe(true)
      expect(
        selfDriveParkourPass({
          startPos,
          endPos,
          maxAbsX,
          finalWaypoint: SELF_DRIVE_PARKOUR_WAYPOINTS[SELF_DRIVE_PARKOUR_WAYPOINTS.length - 1]
            .position,
        }),
      ).toBe(true)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  })
})
