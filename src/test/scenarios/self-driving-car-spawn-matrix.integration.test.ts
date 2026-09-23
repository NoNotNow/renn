import { describe, expect, it } from 'vitest'
import {
  buildSelfDrivingCarWorld,
  SELF_DRIVE_SPAWN,
  SELF_DRIVE_SPAWN_MATRIX,
  type SelfDriveSpawnId,
  selfDriveGoAroundPass,
} from '@/test/fixtures/selfDrivingCarWorld'
import { WorldSimulator } from '@/test/helpers/worldSimulator'

const GO_AROUND_SPAWN_IDS = Object.keys(SELF_DRIVE_SPAWN_MATRIX) as SelfDriveSpawnId[]

describe('self-driving car spawn matrix (integration)', () => {
  it.each(GO_AROUND_SPAWN_IDS)('go-around: spawn=%s', async (spawnId) => {
    const sim = await WorldSimulator.create(
      buildSelfDrivingCarWorld({ variant: 'cubeGoalBehind', spawnId }),
      15,
    )
    try {
      const startPos = sim.getPosition('car')
      sim.runFrames(175)
      const endPos = sim.getPosition('car')
      expect(
        selfDriveGoAroundPass({
          startPos,
          endPos,
          obstacleCenterZ: SELF_DRIVE_SPAWN.cubeCenter[2],
        }),
      ).toBe(true)
    } finally {
      sim.dispose()
    }
  })
})
