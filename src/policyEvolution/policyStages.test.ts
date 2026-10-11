import { describe, expect, it } from 'vitest'
import { createRng, gaussian } from '@/avEvolution/core/rng'
import { GENOME_LENGTH_V2, POLICY_STAGE_CODE_V3, STAGE_SENSE } from './policy'
import { POLICY_DRIVE_STAGE_CODE, POLICY_INPUT_STAGE_CODE } from './policyStages'

/**
 * A/B oracle of the v3 split (refactor gate): the OLD single stage (`POLICY_STAGE_CODE_V3`, one state) and the NEW chain
 * (input stage `POLICY_INPUT_STAGE_CODE` -> drive stage `POLICY_DRIVE_STAGE_CODE`, two states, the input stage writing
 * `input.av.cmd`) must produce BIT-IDENTICAL actions every frame on identical inputs — same genome, same chain with legs
 * (forward AND reversal leg transitions), same dt, ray noise and command noise both ON (both rng streams exercised).
 */

const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!

/** api mock: same shape the stage tests use; rays hit at a fixed distance so the ray-noise rng stream is exercised. */
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
  raycast: () => ({ hit: true, distance: 20, entityId: 'wall' }),
}

type Transform = (i: unknown, dt: number, p: unknown, s: unknown, a: unknown) => unknown
const evalStage = (code: string): Transform => new Function(`${code}\nreturn transform`)() as Transform

/** one scripted frame input: a car driving a path that crosses leg boundaries, including a reversal leg */
function frameInput(x: number, z: number, vz: number) {
  return { position: [x, 0, z], rotation: [0, 0, 0, 1], velocity: [0.1, 0, vz], angularVelocity: [0, 0.05, 0], actions: {} }
}

describe('v3 split A/B oracle: old single stage vs input+drive chain', () => {
  it('produces bit-identical actions and aims on every frame (leg transitions, reversal leg, noise on)', () => {
    const rng = createRng(42)
    const w = Array.from({ length: GENOME_LENGTH_V2 }, () => gaussian(rng) * 0.6)
    // leg 0 forward 0..40, leg 1 REVERSAL 40..25 (aim behind the car), leg 2 forward 25..70: both leg-change paths run
    const chain = [[0, 0], [0, 40], [0, 25], [0, 70]]
    const legEnds = [1, 2, 3]
    const cmd = { lmin: 12, tau: 1.5, period: 0.5, noiseDeg: 3, seed: 7 }
    const oldParams = { w, gain: 1200, chain, legEnds, offM: 8, cmd, noise: 0.02, noiseSeed: 5 }
    const inputParams = { chain, legEnds, offM: 8, cmd }
    const driveParams = { w, gain: 1200, noise: 0.02, noiseSeed: 5 }

    const oldT = evalStage(POLICY_STAGE_CODE_V3)
    const inputT = evalStage(POLICY_INPUT_STAGE_CODE)
    const driveT = evalStage(POLICY_DRIVE_STAGE_CODE)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldState: any = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputState: any = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const driveState: any = {}
    const dt = 1 / 60
    const path: Array<[number, number, number]> = [
      [0, 0, 8], [1, 10, 9], [0, 20, 10], [0, 30, 11], [0, 38, 10],
      [0, 37, -2], [0, 33, -3], [0, 28, -2], [0, 27, 3], [0, 32, 8],
      [0, 40, 12], [0, 52, 13], [0, 60, 12], [0, 66, 10], [0, 69, 9],
    ]
    let frames = 0
    for (const [x, z, vz] of path) {
      // 40 frames per waypoint: crossing the 0.5 s cmd refresh many times per leg and at every leg boundary
      for (let f = 0; f < 40; f++) {
        const driftX = 0.3 * Math.sin((frames % 37) / 3)
        const o = frameInput(x + driftX, z, vz)
        oldT(o, dt, oldParams, oldState, api)
        const n = frameInput(x + driftX, z, vz)
        inputT(n, dt, inputParams, inputState, api)
        driveT(n, dt, driveParams, driveState, api)
        // exact (bit-identical) equality: both compute the same float ops on the same operands
        expect(n.actions).toEqual(o.actions)
        expect((n as { av?: { cmd?: { aim: number[]; next: number[] } } }).av?.cmd?.aim).toEqual(oldState.aim)
        expect((n as { av?: { cmd?: { aim: number[]; next: number[] } } }).av?.cmd?.next).toEqual(oldState.nxt)
        frames++
      }
    }
    expect(frames).toBe(600)
    // the path really exercised the reversal leg (aim behind the car at some point) and the leg tracker advanced
    expect(oldState.lt.li).toBe(2)
    expect(oldState.aim[1]).toBeGreaterThan(66)
  })

  it('the split stages are the store the builders use (input writes cmd, drive is the unchanged v3 code)', () => {
    expect(POLICY_DRIVE_STAGE_CODE).toBe(POLICY_STAGE_CODE_V3)
    expect(POLICY_INPUT_STAGE_CODE).toContain('deriveCmd')
    expect(POLICY_INPUT_STAGE_CODE).not.toContain(STAGE_SENSE)
  })
})
