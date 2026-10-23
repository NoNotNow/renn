import { describe, expect, it } from 'vitest'
import { createRng, gaussian } from '@/avEvolution/core/rng'
import { freshGenome } from './islands'
import { genomeLengthSchlau, hiddenOfSchlau, MOVE_SEG_M, MOVE_SEGS, N_IN_SCHLAU, POLICY_STAGE_CODE_SCHLAU, policyForwardSchlau, SCHLAU_GOAL_INPUT_COLOR, SCHLAU_GOAL_VECTOR_COLOR, SCHLAU_MOVE_COLORS, SCHLAU_RAY_ANGLES_DEG } from './schlauPolicy'
import { N_RAYS, NOSE_M } from './policy'

const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!

/** api.visualizeLine calls of the last runStage (the stage draws the lila goal vector every frame) */
const lineCalls: Array<{ from: number[]; to: number[]; color: string }> = []

/** minimal api for the stage: flat ground, identity heading (forward = +z, left = +x), every ray hits at 20 m */
const api = {
  getUpVector: () => [0, 1, 0],
  getForwardVector: () => [0, 0, 1],
  vec: {
    normalize: (v: number[]) => {
      const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
      return [v[0]! / l, v[1]! / l, v[2]! / l]
    },
    projectOntoPlane: (v: number[], n: number[]) => {
      const d = dot(v, n)
      return [v[0]! - d * n[0]!, v[1]! - d * n[1]!, v[2]! - d * n[2]!]
    },
    cross: (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!],
    dot,
  },
  raycast: () => ({ hit: true, distance: 20 }),
  visualizeLine: (from: number[], to: number[], color: string) => {
    lineCalls.push({ from, to, color })
  },
}

/** fwd = +z, left = +x (identity heading, flat ground) */
const FWD = [0, 0, 1]
const LEFT = [1, 0, 0]

interface StageInput {
  position?: number[]
  velocity?: number[]
}

function runStage(params: Record<string, unknown>, input: (frame: number) => StageInput = () => ({}), frames = 1) {
  const transform = new Function(`${POLICY_STAGE_CODE_SCHLAU}\nreturn transform`)() as (
    i: Record<string, unknown>,
    dt: number,
    p: unknown,
    s: unknown,
    a: unknown,
  ) => unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: any = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inp: any
  for (let f = 0; f < frames; f++) {
    inp = {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      actions: {},
      ...input(f),
    }
    transform(inp, 1 / 60, params, state, api)
  }
  return { inp, state }
}

/** goal vector inputs (car frame) of a goal point seen from a position, heading +z / left +x */
function goalInputs(gx: number, gz: number): [number, number, number] {
  const gd = Math.hypot(gx, gz) || 1
  return [(gx * FWD[0]! + gz * FWD[2]!) / gd, (gx * LEFT[0]! + gz * LEFT[2]!) / gd, Math.min(gd / 60, 1)]
}

describe('schlau policy layout', () => {
  it('26 inputs: 14 rays over 360 deg + speed + 4x2 movement vectors + goal (3)', () => {
    expect(N_IN_SCHLAU).toBe(26)
    expect(SCHLAU_RAY_ANGLES_DEG.length).toBe(N_RAYS)
    expect(SCHLAU_RAY_ANGLES_DEG[0]).toBe(0)
    // evenly spread over the full circle: consecutive bearings differ by 360/14, ray 7 points straight back
    expect(SCHLAU_RAY_ANGLES_DEG[1]).toBeCloseTo(360 / 14, 9)
    expect(SCHLAU_RAY_ANGLES_DEG[7]).toBeCloseTo(180, 9)
    expect(genomeLengthSchlau(10)).toBe(29 * 10 + 2)
    expect(hiddenOfSchlau(genomeLengthSchlau(10))).toBe(10)
    expect(hiddenOfSchlau(genomeLengthSchlau(10) + 1)).toBe(0)
    expect(POLICY_STAGE_CODE_SCHLAU).toContain(`N_IN = ${N_IN_SCHLAU},`)
  })

  it('a zero genome outputs zero steer / zero gas', () => {
    const g = new Array<number>(genomeLengthSchlau(6)).fill(0)
    const x = new Array<number>(N_IN_SCHLAU).fill(0.3)
    expect(policyForwardSchlau(g, x)).toEqual([0, 0])
    expect(() => policyForwardSchlau([1, 2, 3], x)).toThrow()
  })

  it('the stage forward pass equals policyForwardSchlau on the inputs it builds (rays, speed, goal)', () => {
    const g = freshGenome(createRng(21), 0.5, N_IN_SCHLAU, 8)
    // car at the origin heading +z (left = +x), driving 6 m/s, goal 30 m straight ahead
    const { inp, state } = runStage({ w: g, gain: 1200, goal: [0, 30] }, () => ({ velocity: [0, 0, 6] }), 1)
    const x = [...new Array(N_RAYS).fill(1 - 20 / 50), 6 / 30, ...new Array(2 * MOVE_SEGS).fill(0), ...goalInputs(0, 30)]
    expect(x.length).toBe(N_IN_SCHLAU)
    const [steer, gas] = policyForwardSchlau(g, x)
    expect(state.steer).toBeCloseTo(steer, 9)
    expect(state.gas).toBeCloseTo(gas, 9)
    expect(inp.actions.steering_angle).toBeCloseTo(Math.abs(steer) < 1e-4 ? 1e-4 : steer, 9)
  })

  it('the movement memory holds the displacement of the traveled distance in 4 segments (newest first)', () => {
    const g = new Array<number>(genomeLengthSchlau(4)).fill(0)
    // driven path: arc length s -> position (s <= 50: [0, s] along +z; s > 50: [s-50, 50] along +x) — a 90 deg turn at s = 50.
    // frame f sits at arc length f+1 (lag-free: the sample pushed after the frame carries exactly its arc length).
    const path = (s: number): [number, number] => (s <= 50 ? [0, s] : [s - 50, 50])
    const drive = (f: number): StageInput => {
      const s = f + 1
      const [px, pz] = path(s)
      const ahead = s <= 50
      return { position: [px, 0, pz], velocity: ahead ? [0, 0, 60] : [60, 0, 0] }
    }
    const { state } = runStage({ w: g, gain: 1200, goal: [0, 50] }, drive, 100)
    expect(state.s).toBeCloseTo(100, 6)
    // expected movement vectors: segment k = displacement between arc lengths 100-(k+1)*20 and 100-k*20, car frame [fwd, left], / 20
    const segFL = (from: number, to: number): [number, number] => {
      const [ax, az] = path(from)
      const [bx, bz] = path(to)
      const dx = bx - ax
      const dz = bz - az
      return [(dx * FWD[0]! + dz * FWD[2]!) / MOVE_SEG_M, (dx * LEFT[0]! + dz * LEFT[2]!) / MOVE_SEG_M]
    }
    const moves: number[] = []
    for (let k = 0; k < MOVE_SEGS; k++) moves.push(...segFL(100 - (k + 1) * MOVE_SEG_M, 100 - k * MOVE_SEG_M))
    // newest two segments are pure +x (left 1, fwd 0); the segment across the turn is +10 m z and +10 m x; the oldest is pure +z
    expect(moves).toEqual([0, 1, 0, 1, 0.5, 0.5, 1, 0])
    // the sample buffer is trimmed to the last 4 * 20 m of travel
    expect(state.mh.length).toBeLessThanOrEqual(4 * MOVE_SEG_M + 2)
    expect(state.mh[0][0]).toBeGreaterThanOrEqual(100 - 4 * MOVE_SEG_M - 1)
    // cross-check the full input vector through the reference forward pass (final position [50, 50], goal [0, 50])
    const x = [...new Array(N_RAYS).fill(1 - 20 / 50), 60 / 30, ...moves, ...goalInputs(0 - 50, 50 - 50)]
    const [steer, gas] = policyForwardSchlau(g, x)
    expect(state.steer).toBeCloseTo(steer, 9)
    expect(state.gas).toBeCloseTo(gas, 9)
  })

  it('reversing accumulates traveled distance (the odometer is unsigned)', () => {
    const g = new Array<number>(genomeLengthSchlau(4)).fill(0)
    // 60 frames driving backwards (-z), 1 m per frame
    const { state } = runStage({ w: g, gain: 1200, goal: [0, 50] }, () => ({ position: [0, 0, 0], velocity: [0, 0, -60] }), 60)
    expect(state.s).toBeCloseTo(60, 6)
  })

  it('the stage tolerates a missing goal param (goal = own position -> zero goal vector)', () => {
    const rng = createRng(22)
    const g = Array.from({ length: genomeLengthSchlau(5) }, () => gaussian(rng) * 0.4)
    const { state } = runStage({ w: g, gain: 1200 }, () => ({ velocity: [0, 0, 3] }), 1)
    const x = [...new Array(N_RAYS).fill(1 - 20 / 50), 3 / 30, ...new Array(2 * MOVE_SEGS).fill(0), ...goalInputs(0, 0)]
    const [steer, gas] = policyForwardSchlau(g, x)
    expect(state.steer).toBeCloseTo(steer, 9)
    expect(state.gas).toBeCloseTo(gas, 9)
  })

  it('draws the lila target line every frame: the straight car NOSE -> goal line at y 0.35, through obstacles (user decision 2026-10-23 — it replaces the carrot)', () => {
    const g = freshGenome(createRng(23), 0.5, N_IN_SCHLAU, 6)
    lineCalls.length = 0
    // identity heading: forward = +z, so the nose sits NOSE_M ahead of the center
    runStage({ w: g, gain: 1200, goal: [12, -30] }, () => ({ position: [3, 0, -NOSE_M], velocity: [0, 0, 5] }), 3)
    const lila = lineCalls.filter((c) => c.color === SCHLAU_GOAL_VECTOR_COLOR)
    expect(lila).toHaveLength(3)
    for (const c of lila) {
      expect(c.from).toEqual([3, 0.35, 0])
      expect(c.to).toEqual([12, 0.35, -30])
      expect(c.color).toBe(SCHLAU_GOAL_VECTOR_COLOR)
      expect(SCHLAU_GOAL_VECTOR_COLOR).toBe('#aa44ff')
    }
  })

  it('draws the steering-input vectors (TASK B, user note 2026-10-23): the center-anchored goal arrow + the movement-memory arrows', () => {
    const g = freshGenome(createRng(23), 0.5, N_IN_SCHLAU, 6)
    lineCalls.length = 0
    // stationary car: the movement memory is all-zero -> no move arrows; the goal-input arrow IS drawn
    runStage({ w: g, gain: 1200, goal: [12, -30] }, () => ({ position: [3, 0, -NOSE_M], velocity: [0, 0, 5] }), 3)
    const blue = lineCalls.filter((c) => c.color === SCHLAU_GOAL_INPUT_COLOR)
    // one arrow per frame: shaft + 2 head whiskers, from the car CENTER to the goal (the net's own goal vector)
    expect(SCHLAU_GOAL_INPUT_COLOR).toBe('#44aaff')
    expect(blue.length % 3).toBe(0)
    for (let i = 0; i < blue.length; i += 3) {
      expect(blue[i]!.from).toEqual([3, 0.35, -NOSE_M])
      expect(blue[i]!.to).toEqual([12, 0.35, -30])
    }
    // a MOVING car draws the DRIVEN TRAIL: the odometer history as thin polylines in the 4 segment colors,
    // the newest segment brightest, every line on the actually driven path (world frame, y 0.35)
    lineCalls.length = 0
    let z = 0
    runStage({ w: g, gain: 1200, goal: [12, -30] }, () => ({ position: [0, 0, z++], velocity: [0, 0, 60] }), 80)
    const moveCalls = lineCalls.filter((c) => (SCHLAU_MOVE_COLORS as readonly string[]).includes(c.color))
    expect(moveCalls.length).toBeGreaterThan(0)
    for (const c of moveCalls) {
      expect(c.from[1]).toBe(0.35)
      expect(c.to[1]).toBe(0.35)
      // every trail segment lies ON the driven path: pure +z motion -> x constant 0
      expect(c.from[0]).toBe(0)
      expect(c.to[0]).toBe(0)
      // consecutive history samples: <= 2.5 m of arc + one frame of quantization (the odometer records per frame)
      expect(Math.abs(c.to[2] - c.from[2])).toBeLessThanOrEqual(2.5 + 2 + 1e-9)
      expect(Math.abs(c.to[2] - c.from[2])).toBeGreaterThan(0.05)
    }
    // the newest trail line ends at the car's current position
    const newest = moveCalls.filter((c) => c.color === SCHLAU_MOVE_COLORS[0]).map((c) => Math.max(c.from[2], c.to[2]))
    expect(Math.max(...newest)).toBeCloseTo(z - 1, 6)
  })
})
