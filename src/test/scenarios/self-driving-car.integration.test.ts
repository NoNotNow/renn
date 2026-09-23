import { describe, expect, it } from 'vitest'
import {
  buildSelfDrivingCarWorld,
  SELF_DRIVE_SPAWN,
  selfDriveGoAroundPass,
} from '@/test/fixtures/selfDrivingCarWorld'
import {
  getTransformerWatchEntries,
  setAgentObservationWatchActive,
} from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

function watchLabelValue(label: string): string | undefined {
  for (const entry of getTransformerWatchEntries().values()) {
    if (entry.label === label) return entry.value
  }
  return undefined
}

function distToGoalZ(sim: WorldSimulator, goalZ: number): number {
  const z = sim.getPosition('car')[2]
  return Math.abs(z - goalZ)
}

describe('self-driving car Pipe3 stack (integration)', () => {
  it('wall ahead: umlenker maneuver or direction backoff with limited retreat', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(
      buildSelfDrivingCarWorld({ variant: 'wallAhead' }),
      15,
    )
    try {
      const startZ = sim.getPosition('car')[2]
      let sawAvoidance = false
      let sawBackoff = false
      let maxZDuringBackoff = startZ
      for (let frame = 0; frame < 60; frame++) {
        sim.runFrames(1)
        const maneuver = watchLabelValue('uml.maneuver') === '1'
        const frontHit = watchLabelValue('uml.frontHit') === '1'
        const backoff = watchLabelValue('dir.backoff') === '1'
        if (maneuver && frontHit) sawAvoidance = true
        if (backoff) {
          sawBackoff = true
          const z = sim.getPosition('car')[2]
          if (z > maxZDuringBackoff) maxZDuringBackoff = z
        }
      }
      expect(sawAvoidance || sawBackoff).toBe(true)
      if (sawBackoff) {
        expect(maxZDuringBackoff).toBeGreaterThan(startZ + 0.04)
        expect(maxZDuringBackoff - startZ).toBeLessThan(1.2)
      }
      if (sawAvoidance) {
        expect(watchLabelValue('uml.frontHit')).toBe('1')
      }
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  })

  it('cube with goal behind: lateral maneuver or backoff, aim not through cube centerline', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(
      buildSelfDrivingCarWorld({ variant: 'cubeGoalBehind' }),
      15,
    )
    try {
      let sawManeuver = false
      let sawBackoff = false
      let aimThroughCenter = false
      const startPos = sim.getPosition('car')
      for (let frame = 0; frame < 175; frame++) {
        sim.runFrames(1)
        if (watchLabelValue('uml.maneuver') === '1') sawManeuver = true
        if (watchLabelValue('dir.backoff') === '1') sawBackoff = true
        const aimX = Number(watchLabelValue('uml.aimX'))
        const aimZ = Number(watchLabelValue('uml.aimZ'))
        if (
          watchLabelValue('uml.maneuver') === '1' &&
          Number.isFinite(aimX) &&
          Number.isFinite(aimZ) &&
          Math.abs(aimX) < 0.6 &&
          aimZ < SELF_DRIVE_SPAWN.cubeCenter[2] + 2
        ) {
          aimThroughCenter = true
        }
      }
      expect(sawManeuver || sawBackoff).toBe(true)
      expect(aimThroughCenter).toBe(false)
      const end = sim.getPosition('car')
      expect(
        selfDriveGoAroundPass({
          startPos,
          endPos: end,
          obstacleCenterZ: SELF_DRIVE_SPAWN.cubeCenter[2],
        }),
      ).toBe(true)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  })

  it('clear path: progresses toward wanderer goal without staying in backoff', async () => {
    setAgentObservationWatchActive(true)
    const goalZ = -32
    const sim = await WorldSimulator.create(
      buildSelfDrivingCarWorld({ variant: 'clearPath' }),
      15,
    )
    try {
      const startDist = distToGoalZ(sim, goalZ)
      let backoffFrames = 0
      let minDist = startDist
      for (let frame = 0; frame < 120; frame++) {
        sim.runFrames(1)
        if (watchLabelValue('dir.backoff') === '1') backoffFrames++
        const d = distToGoalZ(sim, goalZ)
        if (d < minDist) minDist = d
      }
      expect(minDist).toBeLessThan(startDist - 0.35)
      expect(backoffFrames).toBeLessThan(15)
      expect(watchLabelValue('uml.frontHit')).toBe('0')
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  })

})
