import { describe, expect, it } from 'vitest'
import { readSelfDrivingStageCode } from '@/globalPipeline/selfDrivingCarStagePaths'
import { stripDirectionUmlDeferral } from '@/test/fixtures/selfDrivingCarWorld'

const canonicalDirectionCode = readSelfDrivingStageCode('direction')

describe('self-driving car red-check (isolated file)', () => {
  it('stripDirectionUmlDeferral removes deferral guard from direction patch', () => {
    const broken = stripDirectionUmlDeferral(canonicalDirectionCode)
    expect(broken).not.toEqual(canonicalDirectionCode)
    expect(canonicalDirectionCode).toContain('Umlenker owns lateral detours')
    expect(broken).not.toContain('Umlenker owns lateral detours')
  })
})
