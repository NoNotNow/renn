import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** AEB reverse awareness: probes from the rear along -fwd only while the neural stage drives backwards; every other case is the unchanged forward path. */
const code = readFileSync(join(process.cwd(), 'public/global/transformers/av-stack/av-aeb.js'), 'utf8')
const transform = new Function(`${code}\nreturn transform`)() as (i: any, dt: number, p: any, s: any, api: any) => any

type V3 = [number, number, number]

/** car at the origin, fwd = +x; the obstacle sits at x = obstacleX (hit distance measured along the ray) */
function run(speed: number, neural: any, obstacleX: number | null, mode = 'drive') {
  const rays: { origin: V3; dir: V3 }[] = []
  const api = {
    vec: { offsetAlong: (p: V3, d: V3, s: number): V3 => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s] },
    raycastSpread: (o: V3, d: V3, range: number) => {
      rays.push({ origin: o, dir: d })
      if (obstacleX === null) return { hit: false }
      const dist = (obstacleX - o[0]) * d[0]
      return dist > 0 && dist < range ? { hit: true, distance: dist } : { hit: false }
    },
    visualizeLine: () => {},
    watch: () => {},
  }
  const av: any = {
    ego: { speed, fwd: [1, 0, 0], left: [0, 0, 1], pos: [0, 0, 0] },
    vehicle: { length: 4, width: 2 },
    actuator: { G: 100, D: 2, u: 0 },
    mode,
  }
  if (neural !== undefined) av.neural = neural
  const input: any = { av, position: [0, 0, 0], actions: { throttle: 0, brake: 0 } }
  transform(input, 1 / 60, {}, {}, api)
  return { av, input, rays }
}

describe('av-aeb reverse awareness', () => {
  const rev = { on: true, dir: 'rev', revM: 1 }
  it('neural rev: probes from the rear along -fwd, stops an obstacle behind with a positive command (throttle, not brake)', () => {
    const r = run(-8, rev, -6)
    expect(r.rays[0]!.dir.map((x) => x + 0)).toEqual([-1, 0, 0])
    expect(r.rays[0]!.origin[0]).toBeCloseTo(-2.3)
    expect(r.av.aeb).toBe(true)
    expect(r.input.actions.brake).toBe(0)
    expect(r.input.actions.throttle).toBeGreaterThan(0)
    expect(r.av.actuator.u).toBeGreaterThan(0)
  })
  it('neural rev: an obstacle in front is ignored', () => {
    const r = run(-8, rev, 6)
    expect(r.av.aeb).toBe(false)
    expect(r.input.actions).toEqual({ throttle: 0, brake: 0 })
  })
  it('neural rev but standing still: not armed', () => {
    const r = run(0.1, rev, -3)
    expect(r.av.aeb).toBe(false)
  })
  it('every other case keeps the forward path (front probe, brake pedal)', () => {
    const cases: [string, any][] = [
      ['classic forward', undefined],
      ['neural off, dir rev', { on: false, dir: 'rev' }],
      ['neural forward', { on: true, dir: 'fwd' }],
      ['neural on, no dir', { on: true }],
    ]
    for (const [name, n] of cases) {
      const front = run(8, n, 6)
      expect(front.rays[0]!.dir, name).toEqual([1, 0, 0])
      expect(front.av.aeb, name).toBe(true)
      expect(front.input.actions.throttle, name).toBe(0)
      expect(front.input.actions.brake, name).toBeGreaterThan(0)
      expect(run(8, n, -6).av.aeb, name).toBe(false)
    }
  })
  it('classic manoeuvre reversing (no neural): below the arming speed, no probe at all', () => {
    const r = run(-8, undefined, -9, 'maneuver')
    expect(r.rays.length).toBe(0)
    expect(r.av.aeb).toBe(false)
  })
})
