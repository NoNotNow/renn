import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  readSelfDrivingStageCode,
  selfDrivingStageChecksums,
  selfDrivingStagePath,
} from '@/globalPipeline/selfDrivingCarStagePaths'

describe('selfDrivingCarStagePaths', () => {
  it('loads all global self-driving stage files from public/global', () => {
    for (const logical of ['umlenker', 'direction', 'autoBrake', 'targetLine'] as const) {
      expect(existsSync(selfDrivingStagePath(logical))).toBe(true)
      expect(readSelfDrivingStageCode(logical).length).toBeGreaterThan(40)
    }
    const sums = selfDrivingStageChecksums()
    expect(sums.umlenker).toMatch(/^[a-f0-9]{12}$/)
  })
})
