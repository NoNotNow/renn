import { describe, expect, it } from 'vitest'
import {
  buildSelfDrivingCarWorld,
  SELF_DRIVE_SPAWN,
  selfDriveGoAroundPass,
  selfDriveLongRunPass,
  selfDriveGrounded,
} from '@/test/fixtures/selfDrivingCarWorld'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

describe('self-driving car long-run (integration)', () => {
  it.each([
    { frames: 400, minGoalProgress: 18 },
    { frames: 600, minGoalProgress: 18 },
  ])(
    'cube goal-behind stays grounded and closes on goal over $frames frames',
    async ({ frames, minGoalProgress }) => {
      setAgentObservationWatchActive(true)
      const sim = await WorldSimulator.create(
        buildSelfDrivingCarWorld({ variant: 'cubeGoalBehind' }),
        15,
      )
      try {
        const startPos = sim.getPosition('car')
        let minY = startPos[1]
        let maxAbsX = 0
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
          selfDriveLongRunPass({
            startPos,
            endPos,
            obstacleCenterZ: SELF_DRIVE_SPAWN.cubeCenter[2],
            goalZ: SELF_DRIVE_SPAWN.goalZ,
            minGoalProgress,
            maxAbsX,
          }),
        ).toBe(true)
        if (frames <= 400) {
          expect(
            selfDriveGoAroundPass({
              startPos,
              endPos,
              obstacleCenterZ: SELF_DRIVE_SPAWN.cubeCenter[2],
            }),
          ).toBe(true)
        }
      } finally {
        sim.dispose()
        setAgentObservationWatchActive(false)
      }
    },
  )
})
