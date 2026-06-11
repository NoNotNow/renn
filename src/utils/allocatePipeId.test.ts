import { describe, it, expect } from 'vitest'
import { allocatePipeId, nextCopyPipeName, nextFreeDefaultPipeName, slugifyPipeName } from './allocatePipeId'

describe('allocatePipeId', () => {
  it('slugifies display names', () => {
    expect(slugifyPipeName('Follower Car')).toBe('follower_car')
  })

  it('dedupes taken ids', () => {
    const taken = new Set(['follower_car'])
    expect(allocatePipeId('Follower Car', taken)).toBe('follower_car_2')
  })
})

describe('nextCopyPipeName', () => {
  it('appends (copy) when unused', () => {
    expect(nextCopyPipeName('Car', {})).toBe('Car (copy)')
  })

  it('increments when copy label is taken', () => {
    expect(nextCopyPipeName('Car', { a: { name: 'Car (copy)' } })).toBe('Car 2')
  })
})

describe('nextFreeDefaultPipeName', () => {
  it('starts at Pipe1 when no default pipes exist', () => {
    expect(nextFreeDefaultPipeName({})).toBe('Pipe1')
    expect(nextFreeDefaultPipeName({ p: { name: 'Follower' } })).toBe('Pipe1')
  })

  it('increments past existing PipeN names', () => {
    expect(
      nextFreeDefaultPipeName({
        a: { name: 'Pipe1' },
        b: { name: 'pipe 2' },
      }),
    ).toBe('Pipe3')
  })
})
