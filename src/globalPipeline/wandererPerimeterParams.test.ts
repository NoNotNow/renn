import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WANDER_FLOOR_Y,
  horizontalArenaWandererParams,
  normalizeWandererParamsYUp,
  selfDrivePinnedGoalWandererParams,
} from '@/globalPipeline/wandererPerimeterParams'

describe('wandererPerimeterParams (Y-up [x,y,z])', () => {
  it('pins goal at ground Y and goal Z on −X forward axis', () => {
    const p = selfDrivePinnedGoalWandererParams(-32)
    expect(p.perimeter!.center).toEqual([0, DEFAULT_WANDER_FLOOR_Y, -32])
    expect(p.perimeter!.halfExtents).toEqual([0, 0, 0])
  })

  it('arena roam uses XZ halfExtents and zero Y extent', () => {
    const p = horizontalArenaWandererParams(370, 370)
    expect(p.perimeter!.center[1]).toBe(DEFAULT_WANDER_FLOOR_Y)
    expect(p.perimeter!.halfExtents).toEqual([370, 0, 370])
  })

  it('normalizes legacy center Y=0.5 to floor plane', () => {
    const p = normalizeWandererParamsYUp({
      perimeter: { center: [0, 0.5, 0], halfExtents: [370, 0, 370] },
    })
    expect(p.perimeter!.center).toEqual([0, DEFAULT_WANDER_FLOOR_Y, 0])
  })
})
