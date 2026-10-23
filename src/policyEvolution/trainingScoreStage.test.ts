import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { POLICY_STAGE_CODE_SCHLAU, SCHLAU_GOAL_INPUT_COLOR, SCHLAU_MOVE_COLORS } from './schlauPolicy'
import { trainingScoreStageCode } from './trainingScoreStage'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * BYTE-IDENTITY of the SHARED score stage (TASK B hard constraint, user note 2026-10-23 ~02:10): the schlau
 * path-vector visualization lives in the schlau DRIVE stage (schlauPolicy.ts, schlau-only) —
 * trainingScoreStage.ts is NOT touched, so the maze / crux stage code is byte-identical by construction.
 * These pins make any future edit of the shared stage (or of wallLos.ts / policy.ts NOSE_M, which it embeds)
 * fail LOUDLY instead of silently changing what the maze / crux worlds ship — the same pattern as the carrot
 * removal (an empty carrot color emits nothing; maze / crux keep theirs).
 */
describe('trainingScoreStage byte-identity (maze / crux untouched by the schlau vector work)', () => {
  it('the maze / crux stage code hashes are pinned (any shared-stage edit must update these consciously)', () => {
    expect(sha(trainingScoreStageCode('maze', 8, '#6688ff'))).toBe('271dd44df406822feb2ccd0224138a1f7219bc893683d41f5d9747edcb3324f5')
    expect(sha(trainingScoreStageCode('crux', 8, '#88ff66'))).toBe('cbea16b63b1d75eb02928d3f6e7d1f4259d721b16f19d97bb17cf8ed81ec8117')
  })

  it('the carrot is emitted ONLY for a non-empty color (maze / crux keep it, the schlau worlds do not)', () => {
    const maze = trainingScoreStageCode('maze', 8, '#6688ff')
    const crux = trainingScoreStageCode('crux', 8, '#88ff66')
    const schlau = trainingScoreStageCode('schlau', 8, '')
    for (const code of [maze, crux]) {
      expect(code).toContain('function chainPoint(ch2, cum2, s2)')
      expect(code).toContain("api.visualizeLine([fx, 0.35, fz], [tp[0], 0.35, tp[1]], '")
    }
    expect(schlau).not.toContain('function chainPoint')
    expect(schlau).not.toContain("arc + 8")
  })

  it('NONE of the schlau steering-input vector drawing leaks into the shared stage code', () => {
    for (const code of [trainingScoreStageCode('maze', 8, '#6688ff'), trainingScoreStageCode('crux', 8, '#88ff66'), trainingScoreStageCode('schlau', 8, '')]) {
      expect(code).not.toContain('drawVec')
      expect(code).not.toContain(SCHLAU_GOAL_INPUT_COLOR)
      for (const c of SCHLAU_MOVE_COLORS) expect(code).not.toContain(c)
    }
  })

  it('the schlau DRIVE stage draws the steering-input vectors (the goal arrow + the 4 movement-memory arrows)', () => {
    expect(POLICY_STAGE_CODE_SCHLAU).toContain('drawVec')
    expect(POLICY_STAGE_CODE_SCHLAU).toContain(SCHLAU_GOAL_INPUT_COLOR)
    for (const c of SCHLAU_MOVE_COLORS) expect(POLICY_STAGE_CODE_SCHLAU).toContain(c)
  })
})

describe('the LIVE ROUTE emission (schlau only, user note 2026-10-23 ~02:55)', () => {
  it('the flag is OFF for the default calls: no live-route markers in maze / crux / the 3-arg schlau code', () => {
    for (const code of [trainingScoreStageCode('maze', 8, '#6688ff'), trainingScoreStageCode('crux', 8, '#88ff66'), trainingScoreStageCode('schlau', 8, '')]) {
      expect(code).not.toContain('lrInit')
      expect(code).not.toContain('lrWalk')
      expect(code).not.toContain('state.lr')
    }
  })

  it('the live-route call emits the helpers, the throttle and the nose-anchored redraw; the baked chain loop is GONE', () => {
    const code = trainingScoreStageCode('schlau', 8, '', true)
    expect(code).toContain('function lrInit(params)')
    expect(code).toContain('function lrWalk(lr, x, z, los)')
    expect(code).toContain('state.t - state.lrT >= 0.5')
    expect(code).toContain('Math.hypot(px - state.lrNose[0], pz - state.lrNose[1]) > 2')
    // a blocked / null walk keeps the last drawn route (no flicker)
    expect(code).toContain('if (lrPts)')
    // the baked multi-chain drawing loop is replaced
    expect(code).not.toContain('for (var k2 = 0; k2 < params.chains.length')
  })

  it('lrInit / lrWalk (extracted from the emitted code): the route walks around a wall to the goal, null on a blocked nose', () => {
    const code = trainingScoreStageCode('schlau', 8, '', true)
    const fns = new Function(`${code}\nreturn { lrInit, lrWalk, losWallsInit, losBlocked }`)() as {
      lrInit: (p: unknown) => { minX: number; minZ: number; nx: number; nz: number; blocked: Uint8Array; dist: Int32Array; goal: [number, number] }
      lrWalk: (lr: unknown, x: number, z: number, los: unknown) => Array<[number, number]> | null
      losWallsInit: (w: unknown) => unknown
    }
    // a 30 m wall between the start (0, 0) and the goal (40, 0): x = 20, z in [-15, 15] (rect corners),
    // plus a bounding "arena" rect (the real worlds' 4 arena walls play this role — the grid bounds come
    // from the goal +/- 24 m EXPANDED by the wall bbox, so the arena walls must cover the start)
    const wall = [
      [19, -15], [21, -15], [21, 15], [19, 15],
    ]
    // the bounding "arena": FOUR THIN rect walls (a single filled rect would block everything — the real
    // worlds pass four 2 m arena walls whose bbox also defines the live-route grid)
    const arena = [
      [[-17, -32], [47, -32], [47, -30], [-17, -30]],
      [[-17, 30], [47, 30], [47, 32], [-17, 32]],
      [[-17, -30], [-15, -30], [-15, 30], [-17, 30]],
      [[45, -30], [47, -30], [47, 30], [45, 30]],
    ]
    const params = { chain: [[0, 0], [40, 0]], walls: [wall, ...arena] }
    const lr = fns.lrInit(params)
    const los = fns.losWallsInit([wall, ...arena])
    expect(lr.goal).toEqual([40, 0])
    // from the start: the route reaches the goal and detours AROUND the wall (never crosses x in (19, 21) below |z| <= 15)
    const route = fns.lrWalk(lr, 0, 0, los)
    expect(route).not.toBeNull()
    expect(route![0]).toEqual([0, 0])
    const last = route![route!.length - 1]!
    expect(Math.hypot(last[0] - 40, last[1])).toBeLessThan(1.5)
    for (const [x, z] of route!) {
      if (x > 19.6 && x < 20.4) expect(Math.abs(z)).toBeGreaterThan(15 - 2.5)
    }
    // a nose ON the wall (blocked cell) keeps null -> the stage keeps the last drawn route
    expect(fns.lrWalk(lr, 20, 0, los)).toBeNull()
    // from BEYOND the wall the route is shorter (the field is live from any nose)
    const near = fns.lrWalk(lr, 25, 0, los)
    expect(near).not.toBeNull()
    expect(near!.length).toBeLessThan(route!.length)
    // the WINDOWED string-pull: no straight segment longer than ~8 cells of the walk (an unbounded pull
    // collapses the route into corridor-cutters that read as wrong — user bug report 2026-10-23)
    for (const r of [route!, near!])
      for (let i = 0; i + 1 < r.length; i++) expect(Math.hypot(r[i + 1]![0] - r[i]![0], r[i + 1]![1] - r[i]![1]), `seg ${i}`).toBeLessThanOrEqual(8 + 4.5)
  })
})
