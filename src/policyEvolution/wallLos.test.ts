import { describe, expect, it } from 'vitest'
import { rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import { WallLos } from './wallLos'

/**
 * Wall line-of-sight (the "wall between the vector and the car" guard): the credit vector runs from the car to its
 * projected chain point; a wall rect crossing that segment occludes the credit. Pure geometry on the same
 * `rectPoly` corner polys the hull-vs-wall touch test uses.
 */

/** one wall along x at z = 4 (thickness 1, spanning x in [-5, 55]) */
const corridorWall = [[-5, 3.5], [55, 3.5], [55, 4.5], [-5, 4.5]] as V2[]

describe('wall line-of-sight', () => {
  it('a wall between the car and the chain point blocks (parallel corridor, wrong side of the wall)', () => {
    const los = new WallLos([corridorWall])
    // car at (20, 8), projected chain point (20, 0): the wall at z = 4 is between them
    expect(los.blocked(20, 8, 20, 0)).toBe(true)
    // same wall crossed diagonally
    expect(los.blocked(0, 8, 20, 0)).toBe(true)
  })

  it('a free sight line does not block: same side of the wall, or beyond the wall ends', () => {
    const los = new WallLos([corridorWall])
    // car south of the wall, chain point south too
    expect(los.blocked(20, 3, 20, 0)).toBe(false)
    // north of the wall, point north of the wall
    expect(los.blocked(20, 8, 20, 6)).toBe(false)
    // the segment passes BEHIND the wall's end (x > 55): no crossing even though the wall is between in x
    expect(los.blocked(60, 8, 60, 0)).toBe(false)
  })

  it('a zero-length credit vector (car sits on its projection point) never blocks', () => {
    const los = new WallLos([corridorWall])
    expect(los.blocked(20, 8, 20, 8)).toBe(false)
  })

  it('yawed walls work through rectPoly corner polys (not just axis-aligned rects)', () => {
    const los = new WallLos([rectPoly(0, 0, Math.PI / 4, 4, 4)])
    expect(los.blocked(-3, 0, 3, 0)).toBe(true)
    expect(los.blocked(-3, 3, 3, 3)).toBe(false)
  })

  it('many far-away walls are cheap and do not block (bounding-circle early rejection)', () => {
    const far = Array.from({ length: 200 }, (_, i) => rectPoly(500 + 10 * i, 500, 0, 4, 4))
    const los = new WallLos([corridorWall, ...far])
    expect(los.blocked(20, 8, 20, 0)).toBe(true)
    expect(los.blocked(20, 3, 20, 0)).toBe(false)
  })
})
