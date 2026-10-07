/* eslint-disable @typescript-eslint/no-explicit-any -- the stage is plain JS evaluated from source */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Maze module (av-ego `mazeStep`, param `mazeModule`): deterministic decisions on a fully known static map (no simulation):
 * confinement with hysteresis, nearest reachable exit by field cost, a car in the way costs (the other exit is taken), dead-end branches
 * are not entered, hysteresis of the kept route. The driven end-to-end cases are `mazemod-*` in `av-maze-scenarios.test.ts`.
 */
const src = fs.readFileSync(path.resolve(__dirname, '../../../public/global/transformers/av-stack/av-ego.js'), 'utf8')
const mazeStep = new Function(`${src}; return mazeStep`)() as (av: any, input: any, params: any, state: any, api: any, thrs: any[]) => { on: boolean; goal: [number, number] | null }

type P = [number, number]

/** Wall points of an axis-aligned wall every 1 m. */
function wall(a: P, b: P): P[] {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])))
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as P)
}

/** Ring corridor (outer +-50, inner block +-36, 14 m wide) with gaps in the south / east outer wall and optional cross walls (dead ends). */
function ring(gaps: ('S' | 'E')[], plugs: P[] = []): P[] {
  const pts: P[] = [...wall([-50, -50], [50, -50]), ...wall([-50, -50], [-50, 50])]
  if (gaps.includes('S')) pts.push(...wall([-50, 50], [-7, 50]), ...wall([7, 50], [50, 50]))
  else pts.push(...wall([-50, 50], [50, 50]))
  if (gaps.includes('E')) pts.push(...wall([50, -50], [50, -7]), ...wall([50, 7], [50, 50]))
  else pts.push(...wall([50, -50], [50, 50]))
  pts.push(...wall([-36, -36], [36, -36]), ...wall([-36, 36], [36, 36]), ...wall([-36, -36], [-36, 36]), ...wall([36, -36], [36, 36]))
  for (const [x, z] of plugs) pts.push(...(Math.abs(x) > Math.abs(z) ? wall([x - 7, z], [x + 7, z]) : wall([x, z - 7], [x, z + 7])))
  return pts
}

/** Stateful driver: one call per 0.5 s of simulated time with last frame's static map (and remembered dynamic marks). */
function driver(list: P[], params: Record<string, unknown> = {}) {
  const state: any = { t: 0 }
  const api = { watch: () => undefined }
  const p = { mazeModule: true, mazeSeenRange: 0, ...params }
  return {
    state,
    step(pos: P, thrs: { x: number; z: number; vx: number; vz: number }[] = [], dyn: P[] = []) {
      state.t += 0.5
      const av: any = { prevSmap: { list }, prevDyn: dyn, vehicle: { width: 4, length: 8 } }
      const res = mazeStep(av, { position: [pos[0], 0, pos[1]] }, p, state, api, thrs)
      return { ...res, mz: state.mz as any, route: state.mz.route as P[] | null }
    },
  }
}

const exitOf = (route: P[] | null): P => route![route!.length - 1]!

describe('maze module', () => {
  it('confined in a corridor (blocked directions), free on open ground, with hysteresis', () => {
    const d = driver(ring(['S']))
    expect(d.step([0, -43]).mz.on).toBe(true)
    expect(d.step([0, -43]).mz.share).toBeGreaterThan(0.6)
    const open = driver([...wall([-60, -4], [60, -4])])
    expect(open.step([0, 30]).mz.on).toBe(false)
    // hysteresis: once on, a share between mazeLeave and mazeEnter keeps it on (a crossing of the ring reads ~0.5); an empty map is off
    const d2 = driver(ring(['S', 'E']))
    d2.step([0, -43])
    expect(d2.step([-43, -43]).mz.on).toBe(true)
    expect(driver([]).step([0, 0]).on).toBe(false)
  })

  it('one exit: the route leads round the dead-end west corridor and out through the south exit', () => {
    const d = driver(ring(['S'], [[-43, 0]]))
    const r = d.step([-10, -43])
    expect(r.on).toBe(true)
    expect(r.route).not.toBeNull()
    const [ex, ez] = exitOf(r.route)
    expect(ez).toBeGreaterThan(50)
    expect(Math.abs(ex)).toBeLessThan(10)
    // never enters the west dead end (x < -36, z > -36 would be the west corridor)
    expect(r.route!.some(([x, z]) => x < -36 && z > -30)).toBe(false)
    // the first waypoint heads east along the north corridor
    expect(r.goal![0]).toBeGreaterThan(-10)
  })

  it('two exits: takes the nearer one by route cost (east, not south)', () => {
    const d = driver(ring(['S', 'E']))
    const r = d.step([-10, -43])
    const [ex, ez] = exitOf(r.route)
    expect(ex).toBeGreaterThan(50)
    expect(Math.abs(ez)).toBeLessThan(10)
  })

  it('a stopped car plugging the north corridor: the other exit (south, round the west side) is taken', () => {
    const plug: P[] = wall([19, -50], [19, -36]).concat(wall([31, -50], [31, -36]))
    const d = driver(ring(['S', 'E']))
    const free = d.step([-10, -43])
    expect(exitOf(free.route)[0]).toBeGreaterThan(50)
    const d2 = driver(ring(['S', 'E']))
    const r = d2.step([-10, -43], [], plug)
    const [ex, ez] = exitOf(r.route)
    expect(ez).toBeGreaterThan(50)
    expect(Math.abs(ex)).toBeLessThan(10)
    expect(r.route!.some(([x, z]) => x < -36 && z > -30)).toBe(true)
  })

  it('a stopped tracked car in the east exit: the south exit is taken; a moving chaser far from the way changes nothing', () => {
    const d = driver(ring(['S', 'E']))
    const r = d.step([-10, -43], [{ x: 45, z: 0, vx: 0, vz: 0 }])
    expect(exitOf(r.route)[1]).toBeGreaterThan(50)
    const d2 = driver(ring(['S', 'E']))
    const r2 = d2.step([-10, -43], [{ x: -43, z: 30, vx: 0, vz: 8 }])
    expect(exitOf(r2.route)[0]).toBeGreaterThan(50)
  })

  it('a chaser on the near way (coming along the north corridor): the way round the other side is cheaper', () => {
    const d = driver(ring(['S', 'E']))
    const r = d.step([-10, -43], [{ x: 30, z: -43, vx: -9, vz: 0 }])
    expect(exitOf(r.route)[1]).toBeGreaterThan(50)
  })

  it('dead-end branch: the route stays in the corridor to its open end and never enters the branch', () => {
    const pts: P[] = [
      ...wall([-60, -7], [-60, 7]),
      ...wall([-60, 7], [110, 7]),
      ...wall([-60, -7], [60, -7]),
      ...wall([74, -7], [110, -7]),
      ...wall([60, -7], [60, -47]),
      ...wall([74, -7], [74, -47]),
      ...wall([60, -47], [74, -47]),
    ]
    const d = driver(pts)
    const r = d.step([-10, 0])
    expect(r.route).not.toBeNull()
    // the open ground is outside the corridor's open east end (x 110): the route runs along the corridor and never up the branch (z < -8)
    expect(exitOf(r.route)[0]).toBeGreaterThan(90)
    expect(r.route!.every(([, z]) => z > -8)).toBe(true)
    expect(r.route!.filter(([x]) => x < 100).every(([, z]) => z < 8)).toBe(true)
  })

  it('hysteresis: a small cost change keeps the route, a large one replaces it', () => {
    const d = driver(ring(['S', 'E']))
    const r0 = d.step([-10, -43])
    const first = r0.route
    // a stopped car well away from the route does not change the kept route object
    const r1 = d.step([-9, -43], [{ x: -43, z: 20, vx: 0, vz: 0 }])
    expect(r1.route).toBe(first)
    // ... a plug right on it does
    const plug: P[] = wall([19, -50], [19, -36]).concat(wall([31, -50], [31, -36]))
    const r2 = d.step([-8, -43], [], plug)
    expect(r2.route).not.toBe(first)
    expect(exitOf(r2.route)[1]).toBeGreaterThan(50)
  })

  it('fully walled in (no way out known): no escape route, no goal', () => {
    const d = driver(ring([]))
    const r = d.step([-10, -43])
    expect(r.on).toBe(true)
    expect(r.route).toBeNull()
    expect(r.goal).toBeNull()
  })

  it('the waypoint is held until reached, then the next one follows along the route', () => {
    const d = driver(ring(['S', 'E']))
    const a = d.step([-10, -43]).goal!
    const b = d.step([-9, -43]).goal!
    expect(b).toEqual(a)
    const c = d.step([a[0] - 2, a[1]]).goal!
    expect(c).not.toEqual(a)
  })
})
