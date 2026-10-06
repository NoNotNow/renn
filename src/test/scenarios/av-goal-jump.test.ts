import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Intermediate goal (route carrot) after the goal source replaced its goal: the stored route / carrot belong to the OLD goal and, in eco, are kept 2-4 s.
 * `goalJumpReplan` (route planner, default 8 m) drops them on the jump itself. Relative assertion: the very next frame plans a NEW route and its carrot leads to the new goal.
 * Drives the real route planner stage code on a hand-made blackboard (empty costmap, car at the origin heading +x, 40 m/s so the 2 s eco interval would hold the old plan).
 */
const code = fs.readFileSync(path.resolve(__dirname, '../../../public/global/transformers/av-stack/av-route-planner.js'), 'utf8')
const transform = new Function(`${code}\nreturn transform`)() as (input: any, dt: number, params: any, state: any, api: any) => unknown

function run(extra: Record<string, unknown>) {
  const state: Record<string, unknown> = {}
  const api = { watch() {}, visualizeLine() {} }
  const params = { budget: 'eco', maxCurvature: 0.115, ...extra }
  const mk = (t: number, goal: [number, number], x: number) => ({
    position: [x, 0, 0],
    entityId: 'car',
    environment: {},
    target: { pose: { position: [goal[0], 0, goal[1]] } },
    av: {
      ego: { t, dt: 0.02, pos: [x, 0, 0], fwd: [1, 0, 0], left: [0, 0, -1], up: [0, 1, 0], speed: 40, speedF: 40, accel: 0, yawRate: 0, kappa: 0 },
      points: [],
      vehicle: { width: 2, length: 4, height: 1 },
      prevFix: true,
      work: { rays: 0, freeLen: 0, cands: 0, astarExp: 0, fieldCells: 0 },
    },
  })
  let t = 0
  let x = 0
  let a: any
  for (let i = 0; i < 10; i++) {
    a = mk(t, [200, 0], x)
    transform(a, 0.02, params, state, api)
    t += 0.02
    x += 0.8
  }
  const before = { routes: state.routes as number, carrot: a.av.carrot as number[] }
  // the goal source jumps to a point 90 degrees to the left
  const b = mk(t, [x, -150], x)
  transform(b, 0.02, params, state, api)
  return { before, routes: state.routes as number, carrot: b.av.carrot as number[] | undefined, pos: [x, 0] }
}

describe('route planner: goal jump', () => {
  it('plans a new route right away and the carrot leads to the new goal', () => {
    const r = run({})
    expect(r.routes).toBe(r.before.routes + 1)
    expect(r.carrot).toBeDefined()
    // new goal is at -z (left of the heading +x): its carrot must be on that side, the old carrot ran straight ahead along +x with z ~ 0
    expect(r.carrot![1]).toBeLessThan(-0.5)
  })
  it('red check: without goalJumpReplan the old route (and its carrot straight ahead) is kept', () => {
    const r = run({ goalJumpReplan: false })
    expect(r.routes).toBe(r.before.routes)
    expect(Math.abs(r.carrot![1])).toBeLessThan(0.5)
  })
})
