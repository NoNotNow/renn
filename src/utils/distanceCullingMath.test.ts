import { describe, it, expect } from 'vitest'
import { distanceCullingShouldCull } from './distanceCullingMath'

describe('distanceCullingShouldCull', () => {
  const maxDistance = 100
  const minRatio = 0.02

  it('culls when beyond max distance and size is not larger than distance', () => {
    const distSq = 150 * 150
    const worldSize = 1
    expect(distanceCullingShouldCull(distSq, worldSize, maxDistance, minRatio)).toBe(true)
  })

  it('does not hard-cull when beyond max distance but worldSize exceeds distance', () => {
    const dist = 50
    const distSq = dist * dist
    const worldSize = 60
    expect(worldSize * worldSize > distSq).toBe(true)
    expect(distanceCullingShouldCull(distSq, worldSize, maxDistance, minRatio)).toBe(false)
  })

  it('still culls on min ratio when not saved by size exemption', () => {
    const dist = 200
    const distSq = dist * dist
    const worldSize = 1
    expect(distanceCullingShouldCull(distSq, worldSize, maxDistance, minRatio)).toBe(true)
  })

  it('does not cull small object inside max distance with sufficient ratio', () => {
    const dist = 10
    const distSq = dist * dist
    const worldSize = 1
    expect(distanceCullingShouldCull(distSq, worldSize, maxDistance, minRatio)).toBe(false)
  })
})
