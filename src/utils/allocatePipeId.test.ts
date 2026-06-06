import { describe, it, expect } from 'vitest'
import { allocatePipeId, slugifyPipeName } from './allocatePipeId'

describe('allocatePipeId', () => {
  it('slugifies display names', () => {
    expect(slugifyPipeName('Follower Car')).toBe('follower_car')
  })

  it('dedupes taken ids', () => {
    const taken = new Set(['follower_car'])
    expect(allocatePipeId('Follower Car', taken)).toBe('follower_car_2')
  })
})
