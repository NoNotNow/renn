import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pointPolyGap, rectPoly } from '@/avEvolution/eval/geometry'
import { shippedGenomeV3 } from '@/policyEvolution/exampleWorld'
import { buildCourse } from '@/policyEvolution/courses'
import {
  MAZE_CHAIN_MAX_POINTS,
  MAZE_CHAIN_WALL_CLEAR_M,
  MAZE_GOAL_PREFIX,
  MAZE_GOAL_REACH_M,
  MAZE_GOAL_Y,
  MAZE_SCORE_STAGE_BASE,
  MAZE_SCORE_STAGE_CODE,
  MAZE_TRAINING_WORLDS,
  MAZE_TRAIN_CHAIN_COLORS,
  MAZE_TRAIN_CHAIN_COLORS_REVERSED,
  MAZE_TRAIN_ROUTES,
  buildMazeTrainingWorld,
  focusMazeRoute,
  mazeCarId,
  mazeGoalId,
  mazeScoreStageId,
  mazeTrainingMeta,
  mazeTrainingRoutes,
  trialMazeTrainingCandidate,
  SHIPPED_MAZE_TRAINING_CANDIDATE,
  type MazeRoute,
  type MazeTrainingMeta,
} from '@/policyEvolution/mazeTraining'
import { existsSync } from 'node:fs'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'

/**
 * The ten maze training worlds: one maze copy per training route (several routes through the maze, some driven in
 * reverse direction — bias removal), the shipped v3 policy driving every copy on its own tapered guidance chain.
 * Regenerate after any change to src/policyEvolution/mazeTraining.ts or a policy ship:
 *   npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score
 * The headless policy runs are env-gated (MAZE_TRAIN_SIM=1): they take minutes, not milliseconds.
 */

const genome = () => shippedGenomeV3()

/** The candidate meta.json must name: the shipped policy, or the RENN_V3_GENOME_FILE trial when one is exported. */
const expectedCandidate = () => {
  const override = process.env.RENN_V3_GENOME_FILE
  if (!override) return SHIPPED_MAZE_TRAINING_CANDIDATE
  return trialMazeTrainingCandidate(
    JSON.parse(readFileSync(override, 'utf8')) as { best?: { gen?: number }; source?: string },
    override,
  )
}

describe('maze training worlds', () => {
  it('shipped v3 genome is available (the worlds are built from it)', () => {
    expect(genome()).toBeTruthy()
  })

  it('mazeRoutes: primary = BFS shortest == course.waypoints, ordering, caps, reversed start = forward end', () => {
    for (const spec of MAZE_TRAINING_WORLDS) {
      const course = buildCourse('maze', spec.seed)
      const routes = mazeTrainingRoutes(spec).routes
      expect(routes.length).toBeGreaterThanOrEqual(2)
      expect(routes.length).toBeLessThanOrEqual(MAZE_TRAIN_ROUTES.forward + MAZE_TRAIN_ROUTES.reversed)
      const nForward = routes.filter((r) => !r.reversed).length
      const nReversed = routes.filter((r) => r.reversed).length
      expect(nForward).toBeLessThanOrEqual(MAZE_TRAIN_ROUTES.forward)
      expect(nReversed).toBeLessThanOrEqual(MAZE_TRAIN_ROUTES.reversed)
      // ordering: forward routes first (primary first), then reversed (of the first kept forward routes)
      expect(routes.slice(0, nForward).every((r) => !r.reversed)).toBe(true)
      expect(routes.slice(nForward).every((r) => r.reversed)).toBe(true)
      // the primary route polyline equals the course's own route: [start, ...course.waypoints]
      expect(routes[0]!.reversed).toBe(false)
      expect(routes[0]!.route).toEqual([[0, 0], ...course.waypoints])
      expect(routes[0]!.startAt).toEqual([0, 0])
      expect(routes[0]!.startYawDeg).toBe(course.startYawDeg)
      // every route: starts at its first point, ends at the fixed beyond-gate endpoint (reversed: starts there)
      const gate = routes[0]!.route[routes[0]!.route.length - 1]!
      for (const r of routes) {
        expect(r.route[0]).toEqual(r.startAt)
        expect(r.route.length).toBeGreaterThanOrEqual(3)
        // longest genuine route across seeds 2001-2010 (maze_train_8 primary: 31 points)
        expect(r.route.length).toBeLessThanOrEqual(31)
        if (!r.reversed) {
          expect(r.route[r.route.length - 1]).toEqual(gate)
          expect(r.startAt).toEqual([0, 0])
        }
      }
      // reversed routes: reversed[i - nForward] drives forward route (i - nForward) backwards: start == its end point
      for (let i = nForward; i < routes.length; i++) {
        const fwd = routes[i - nForward]!
        const rev = routes[i]!
        expect(rev.route).toEqual([...fwd.route].reverse())
        expect(rev.startAt).toEqual(fwd.route[fwd.route.length - 1])
      }
    }
  })

  for (const spec of MAZE_TRAINING_WORLDS) {
    it(`${spec.id}: on disk equals the exporter output`, () => {
      const disk = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'world.json'), 'utf8'))
      expect(disk).toEqual(JSON.parse(JSON.stringify(buildMazeTrainingWorld(spec, genome()!))))
    })

    it(`${spec.id}: meta.json matches mazeTrainingMeta (chain = primary route stats, routes counts)`, () => {
      const meta = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'meta.json'), 'utf8'))
      const { routes, chains } = mazeTrainingRoutes(spec)
      expect(meta.id).toBe(spec.id)
      expect(meta.seed).toBe(spec.seed)
      expect(meta.name).toBe(spec.name)
      expect(meta.candidate).toEqual(expectedCandidate())
      expect(meta.bestScore === null || typeof meta.bestScore === 'number').toBe(true)
      expect(meta.chain.points).toBe(chains[0]!.length)
      expect(meta.chain.lengthM).toBeCloseTo(mazeTrainingMeta(spec, routes, null).chain.lengthM, 5)
      expect(meta.routes).toEqual({
        forward: routes.filter((r) => !r.reversed).length,
        reversed: routes.filter((r) => r.reversed).length,
      })
      // tileSvg: the dialog tile data, aligned with the tile order (w/h = the shared route_<i>.svg pixel size)
      const tile = meta.tileSvg as MazeTrainingMeta['tileSvg']
      expect(tile).toBeTruthy()
      expect(tile!.w).toBeGreaterThan(0)
      expect(tile!.h).toBeGreaterThan(0)
      expect(tile!.routes).toHaveLength(routes.length)
      tile!.routes.forEach((r, i) => {
        // pts[j] is chain point j in svg pixel space, so segment j is pts[j] -> pts[j+1]
        expect(r.pts).toHaveLength(chains[i]!.length)
        for (const [x, y] of r.pts) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(tile!.w)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(tile!.h)
        }
        expect(r.score === null || typeof r.score === 'number').toBe(true)
      })
      // a --score export measures every route: bestScore is the max of the per-route scores
      if (meta.bestScore !== null) {
        expect(Math.max(...tile!.routes.map((r) => r.score as number))).toBe(meta.bestScore)
      }
    })

    it(`${spec.id}: one car + goal slab + score stage per route copy, car 0 draws everything`, () => {
      const { routes } = mazeTrainingRoutes(spec)
      const world = buildMazeTrainingWorld(spec, genome()!) as unknown as {
        world: { debugTargetLineEntityId?: string; camera?: { target?: string } }
        entities: { id: string; transformers?: string[]; position: number[] }[]
        transformers: Record<string, { params?: Record<string, unknown> }>
      }
      const K = routes.length
      const cars = world.entities.filter((e) => e.transformers?.some((t) => t.startsWith(MAZE_SCORE_STAGE_BASE)))
      expect(K).toBeGreaterThanOrEqual(2)
      expect(cars).toHaveLength(K)
      expect(world.world.debugTargetLineEntityId).toBe(mazeCarId(0))
      expect(world.world.camera?.target).toBe(mazeCarId(0))
      for (let i = 0; i < K; i++) {
        const car = world.entities.find((e) => e.id === mazeCarId(i))
        expect(car?.transformers).toContain(mazeScoreStageId(i))
        // the score stage of car i scores the SAME (shifted) chain its car is commanded on (the v3 split: the chain lives on
        // the input stage `policy_input_i`, the drive stage only runs the net on `input.av.cmd`)
        const scoreParams = world.transformers[mazeScoreStageId(i)]?.params
        expect(scoreParams?.chain).toEqual(world.transformers[`policy_input_${i}`]?.params?.chain)
        expect(scoreParams?.hud).toBe(i === 0)
        // every score stage sees ALL shifted chains, all car ids and the per-chain color pairs
        expect(scoreParams?.chains).toHaveLength(K)
        expect(scoreParams?.cars).toEqual(routes.map((_, j) => mazeCarId(j)))
        const colors = scoreParams?.chainColors as unknown[]
        expect(colors).toHaveLength(K)
        routes.forEach((r, j) => {
          expect(colors[j]).toEqual(r.reversed ? [MAZE_TRAIN_CHAIN_COLORS_REVERSED.start, MAZE_TRAIN_CHAIN_COLORS_REVERSED.end] : [MAZE_TRAIN_CHAIN_COLORS.start, MAZE_TRAIN_CHAIN_COLORS.end])
        })
        // goal slab of copy i floats at this route's end
        const goal = world.entities.find((e) => e.id === mazeGoalId(i))
        const routeEnd = routes[i]!.route[routes[i]!.route.length - 1]!
        expect(goal?.position[0]).toBeCloseTo(routeEnd[0] + i * MAZE_TRAIN_ROUTES.spacingM, 5)
        expect(goal?.position[1]).toBe(MAZE_GOAL_Y)
        expect(goal?.position[2]).toBeCloseTo(routeEnd[1], 5)
      }
      expect(world.entities.filter((e) => e.id.startsWith(MAZE_GOAL_PREFIX))).toHaveLength(K)
      expect(world.entities.some((e) => e.id.startsWith('chain_marker'))).toBe(false)
    })
  }

  it('taperChain per route: spacing grows along the route, ends stay exact, wall clearance kept, point cap holds', () => {
    for (const spec of MAZE_TRAINING_WORLDS) {
      const { course, routes, chains } = mazeTrainingRoutes(spec)
      const polys = course.boxes.map((b) => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]))
      routes.forEach((route: MazeRoute, i: number) => {
        const chain = chains[i]!
        expect(chain[0]).toEqual(route.route[0])
        expect(chain[chain.length - 1]).toEqual(route.route[route.route.length - 1])
        expect(chain.length).toBeLessThanOrEqual(MAZE_CHAIN_MAX_POINTS)
        expect(chain.length).toBeGreaterThanOrEqual(2)
        const gaps = chain.slice(1).map((p, j) => Math.hypot(p[0]! - chain[j]![0], p[1]! - chain[j]![1]))
        const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
        expect(mean(gaps.slice(0, 3))).toBeLessThan(mean(gaps.slice(-3)))
        for (const p of chain) {
          for (const poly of polys) {
            expect(pointPolyGap(p[0], p[1], poly)).toBeGreaterThanOrEqual(MAZE_CHAIN_WALL_CLEAR_M - 1e-9)
          }
        }
      })
    }
  })
})

// --- the in-world score stage: the high-water mark + the finish freeze (commit 46ce61af follow-up) ------------------------------------

describe('maze training score stage: finish freeze', () => {
  const transform = new Function(`${MAZE_SCORE_STAGE_CODE}\nreturn transform`)() as (
    input: any,
    dt: number,
    params: any,
    state: any,
    api: any,
  ) => unknown
  const chain = [[0, 0], [50, 0]] as unknown as number[][]
  const params = {
    chain,
    chains: [chain],
    chainColors: [],
    cars: [mazeCarId(0)],
    idx: 0,
    hud: false,
    vRef: 20,
    bonusRate: 5,
    wallPenaltyPerS: 12,
    objectPenaltyPerS: 4,
  }
  const mkApi = () => {
    const watch: Record<string, string> = {}
    return {
      watch: (k: string, v: string) => {
        watch[k] = v
      },
      getWatch: () => watch,
      // identity heading +x (the car drives along the chain): the stage anchors the projection at the NOSE (x + 4.1)
      getUpVector: () => [0, 1, 0],
      getForwardVector: () => [1, 0, 0],
      vec: {
        normalize: (v: number[]) => {
          const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
          return [v[0]! / l, v[1]! / l, v[2]! / l]
        },
        projectOntoPlane: (v: number[], n: number[]) => {
          const d = v[0]! * n[0]! + v[1]! * n[1]! + v[2]! * n[2]!
          return [v[0]! - d * n[0]!, v[1]! - d * n[1]!, v[2]! - d * n[2]!]
        },
      },
      raycast: () => ({ hit: true }),
      setScore: () => {},
      getWorldPosition: () => null,
      visualizeLine: () => {},
    }
  }
  const stepAt = (state: Record<string, unknown>, api: ReturnType<typeof mkApi>, x: number, wall: boolean) =>
    transform(
      { position: [x, 1, 0], velocity: [20, 0, 0], environment: wall ? { isTouchingSide: true } : {} },
      DEFAULT_DT,
      params,
      state,
      api,
    )
  const scoreOf = (api: ReturnType<typeof mkApi>) => Number(/([\d.]+)/.exec(api.getWatch()['maze.score']!)![1])

  it('freezes the score at the goal: touch penalties after the finish change nothing', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    stepAt(state, api, 20, false)
    // the nose (x + 4.1) at 47.1 is within MAZE_GOAL_REACH_M (8 m) of the end -> the route counts as cleared
    stepAt(state, api, 43, false)
    expect(state.done).toBe(true)
    const frozen = scoreOf(api)
    expect(frozen).toBeGreaterThan(0)
    // 5 s of scraping a wall past the goal: -60 pts of penalty would show without the freeze
    for (let k = 0; k < 5 / DEFAULT_DT; k++) stepAt(state, api, 60, true)
    expect(scoreOf(api)).toBe(frozen)
    // progress parked at the full chain length (the leg-off margin is credited, the carrot arc sits on the end)
    expect(api.getWatch()['maze.prog']).toBe('50.0 / 50 m')
  })

  it('does not finish early: outside the reach radius the penalties still drain the run score', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    stepAt(state, api, 20, false)
    expect(state.done).toBeUndefined()
    expect(scoreOf(api)).toBe(24.2)
    // 2 s of wall contact at 12 pt/s: 29.1 m nose progress + along-chain bonus - 24 pts penalty = ~15 pts of RUN score
    for (let k = 0; k < 2 / DEFAULT_DT; k++) stepAt(state, api, 25, true)
    expect(state.done).toBeUndefined()
    // the run score still pays (the penalty accumulates), but the SHOWN score is the high-water mark: 29.1 pts (the
    // nose progress; the along-chain bonus up to that point rounds away) from the moment the progress jumped there —
    // it never dropped to the drained run value of ~15
    expect(state.penalty as number).toBeCloseTo(24, 6)
    expect(scoreOf(api)).toBe(29.1)
    expect(api.getWatch()['maze.prog']).toBe('29.1 / 50 m')
  })

  it('the shown score never decreases: a stall against a wall drains the run score, not the high-water mark', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    // drive to 25 m (nose projection 29.1): ~29 pts banked
    stepAt(state, api, 25, false)
    const high = scoreOf(api)
    expect(high).toBeGreaterThanOrEqual(25)
    // 8 s of standing against the wall: -96 pts of run-score drain would clamp the raw score to 0
    for (let k = 0; k < 8 / DEFAULT_DT; k++) stepAt(state, api, 25, true)
    expect(scoreOf(api)).toBe(high)
    // state.best is the CONTINUOUS peak, the watch shows it with 1 decimal (scoreOf parses that) — same value within
    // the display rounding
    expect(state.best as number).toBeCloseTo(high, 1)
    // the run score itself is drained past the clamp (0); only the shown / snapshotted value keeps the peak
    const raw = (state.s as number) + (state.bonus as number) - (state.penalty as number)
    expect(Math.max(0, raw)).toBe(0)
  })
})

// --- the in-world score stage: the line-of-sight gate on the progress credit ("wall between vector and car") ---------

describe('maze training score stage: line-of-sight gate', () => {
  const transform = new Function(`${MAZE_SCORE_STAGE_CODE}\nreturn transform`)() as (
    input: any,
    dt: number,
    params: any,
    state: any,
    api: any,
  ) => unknown
  // chain along x from (0,0) to (50,0); one wall along x at z = 4 covering the whole chain: a car NORTH of it
  // projects onto the chain across the wall (the wrong-side / parallel-corridor occlusion the gate must catch)
  const chain = [[0, 0], [50, 0]] as unknown as number[][]
  const walls = [[[-5, 3.5], [55, 3.5], [55, 4.5], [-5, 4.5]]]
  const params = {
    chain,
    chains: [chain],
    walls,
    chainColors: [],
    cars: [mazeCarId(0)],
    idx: 0,
    hud: false,
    vRef: 20,
    bonusRate: 5,
    wallPenaltyPerS: 12,
    objectPenaltyPerS: 4,
  }
  const mkApi = () => {
    const watch: Record<string, string> = {}
    return {
      watch: (k: string, v: string) => {
        watch[k] = v
      },
      getWatch: () => watch,
      // identity heading +x (the car drives along the chain): the stage anchors the projection at the NOSE (x + 4.1)
      getUpVector: () => [0, 1, 0],
      getForwardVector: () => [1, 0, 0],
      vec: {
        normalize: (v: number[]) => {
          const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
          return [v[0]! / l, v[1]! / l, v[2]! / l]
        },
        projectOntoPlane: (v: number[], n: number[]) => {
          const d = v[0]! * n[0]! + v[1]! * n[1]! + v[2]! * n[2]!
          return [v[0]! - d * n[0]!, v[1]! - d * n[1]!, v[2]! - d * n[2]!]
        },
      },
      raycast: () => ({ hit: false }),
      setScore: () => {},
      getWorldPosition: () => null,
      visualizeLine: () => {},
    }
  }
  const stepAt = (state: Record<string, unknown>, api: ReturnType<typeof mkApi>, x: number, z: number, wall = false) =>
    transform(
      { position: [x, 1, z], velocity: [20, 0, 0], environment: wall ? { isTouchingSide: true } : {} },
      DEFAULT_DT,
      params,
      state,
      api,
    )
  const scoreOf = (api: ReturnType<typeof mkApi>) => Number(/([\d.]+)/.exec(api.getWatch()['maze.score']!)![1])

  it('(i) an occluded chain projection gives NO progress credit: the previous credit stands', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    stepAt(state, api, 10, 1)
    expect(api.getWatch()['maze.prog']).toBe('14.1 / 50 m')
    stepAt(state, api, 20, 8) // north of the wall: the projection (24.1, 0) is behind it
    expect(api.getWatch()['maze.prog']).toBe('14.1 / 50 m')
    expect(state.seg).toBe(0)
  })

  it('(ii) free sight credits normally (a stage without walls stays ungated, like the pre-gate exports)', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    stepAt(state, api, 20, 1)
    expect(api.getWatch()['maze.prog']).toBe('24.1 / 50 m')
    const legacy = { ...params, walls: undefined }
    const state2: Record<string, unknown> = {}
    transform({ position: [20, 1, 8], velocity: [20, 0, 0], environment: {} }, DEFAULT_DT, legacy, state2, mkApi())
    expect((state2 as { s?: number }).s).toBeCloseTo(24.1, 6)
  })

  it('(iii) once the occlusion is gone the progress keeps flowing (no deadlock); bonus and penalties run while occluded', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    stepAt(state, api, 10, 1)
    stepAt(state, api, 20, 8)
    const bonusWhileOccluded = state.bonus as number
    // 0.5 s of scraping the wall on the wrong side: the credit stays, the penalty keeps running
    for (let k = 0; k < 0.5 / DEFAULT_DT; k++) stepAt(state, api, 20, 8, true)
    expect(api.getWatch()['maze.prog']).toBe('14.1 / 50 m')
    expect(state.penalty as number).toBeGreaterThan(0)
    expect(state.bonus as number).toBeGreaterThanOrEqual(bonusWhileOccluded)
    // back on the chain's side of the wall: the credit jumps to the visible projection
    stepAt(state, api, 30, 2)
    expect(api.getWatch()['maze.prog']).toBe('34.1 / 50 m')
  })

  it('(iv) the shown score stays the HIGH-WATER of the occlusion-corrected curve', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    stepAt(state, api, 10, 1)
    const high = scoreOf(api)
    expect(high).toBeGreaterThanOrEqual(10)
    // 8 s occluded against the wall: no credit, -96 pts of run-score drain — the shown score keeps the peak
    for (let k = 0; k < 8 / DEFAULT_DT; k++) stepAt(state, api, 20, 8, true)
    expect(scoreOf(api)).toBe(high)
    // state.best is the CONTINUOUS peak, the watch shows it with 1 decimal (scoreOf parses that) — same value within
    // the display rounding
    expect(state.best as number).toBeCloseTo(high, 1)
    expect(state.s).toBeCloseTo(14.1, 6)
  })
})

// --- route tiles + the load-time route focus (dialog round 5) -------------------------------------------------------

describe('maze training worlds: route tiles and focusMazeRoute', () => {
  it('route_<i>.svg tile files exist on disk for every route of every world', () => {
    for (const spec of MAZE_TRAINING_WORLDS) {
      const { routes } = mazeTrainingRoutes(spec)
      expect(routes.length).toBeGreaterThanOrEqual(2)
      for (let i = 0; i < routes.length; i++) {
        expect(existsSync(join('public/exampleWorlds', spec.id, `route_${i}.svg`))).toBe(true)
      }
      expect(existsSync(join('public/exampleWorlds', spec.id, `route_${routes.length}.svg`))).toBe(false)
    }
  })

  it('focusMazeRoute: camera + display entity + HUD flag move to the selected route; out-of-range is a no-op', () => {
    const base = buildMazeTrainingWorld(MAZE_TRAINING_WORLDS[3]!, shippedGenomeV3()!)
    const count = mazeTrainingRoutes(MAZE_TRAINING_WORLDS[3]!).routes.length
    expect(count).toBe(5)

    const focused = focusMazeRoute(base, 3)
    const w = focused as unknown as {
      world: { camera: { target?: string }; debugTargetLineEntityId?: string }
      transformers: Record<string, { params?: { hud?: boolean } }>
    }
    expect(w.world.camera.target).toBe(mazeCarId(3))
    expect(w.world.debugTargetLineEntityId).toBe(mazeCarId(3))
    for (let i = 0; i < count; i++) expect(w.transformers[mazeScoreStageId(i)]?.params?.hud).toBe(i === 3)

    // the neutral on-disk world keeps its default focus (route 0)
    const neutral = base as unknown as typeof w
    expect(neutral.world.camera.target).toBe(mazeCarId(0))
    expect(neutral.transformers[mazeScoreStageId(0)]?.params?.hud).toBe(true)
    expect(neutral.transformers[mazeScoreStageId(1)]?.params?.hud).toBe(false)

    // out-of-range indices return the world unchanged
    expect(focusMazeRoute(base, -1)).toEqual(base)
    expect(focusMazeRoute(base, count)).toEqual(base)
    expect(focusMazeRoute(base, 99)).toEqual(base)
  })
})

// --- env-gated headless policy runs (MAZE_TRAIN_SIM=1): minutes of simulation, not part of the default suite --------
// This gate doubles as the maze-training progress gate: with the shipped v3 (gen 1000) maze_train_3 stalls at the first
// junction on the primary route (reached false, score ~47) while 1/2/4/5 clear in ~5 s — the v3maze run
// (training-data/policy-evolution/v3maze.json, --kinds maze, warm from the shipped v3) exists to close exactly that
// gap, now measured on every route (forward AND reversed). The gate goes green for all ten when a maze-trained
// candidate clears every route; re-export + re-measure then:
//   npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score
// Trialing a candidate (the run always writes its latest best to training-data/policy-evolution/latest-best.json):
//   RENN_V3_GENOME_FILE=training-data/policy-evolution/latest-best.json MAZE_TRAIN_SIM=1 npx vitest run src/test/scenarios/maze-training-worlds.test.ts -t 'headless v3 run'

const GOAL_REACH_M = MAZE_GOAL_REACH_M
const MAX_SIM_S = 120

describe.skipIf(process.env.MAZE_TRAIN_SIM !== '1')('maze training worlds: headless v3 run (MAZE_TRAIN_SIM=1)', () => {
  for (const spec of MAZE_TRAINING_WORLDS) {
    it(
      `${spec.id}: EVERY car reaches its goal within ${MAX_SIM_S} s of sim and scores > 0`,
      async () => {
        const { routes, chains } = mazeTrainingRoutes(spec)
        const world = buildMazeTrainingWorld(spec, genome()!)
        const K = routes.length
        const goalPos = (world.entities as { id: string; position: number[] }[]).filter((e) => e.id.startsWith(MAZE_GOAL_PREFIX)).map((e) => e.position)
        setAgentObservationWatchActive(true)
        const sim = await WorldSimulator.create(world, 0)
        try {
          const reachedAt: Array<number | null> = new Array(K).fill(null)
          let t = 0
          for (let f = 0; f < Math.round(MAX_SIM_S / DEFAULT_DT); f++) {
            sim.runFrames(1)
            t = (f + 1) * DEFAULT_DT
            let all = true
            for (let i = 0; i < K; i++) {
              const p = sim.getPosition(mazeCarId(i))
              if (reachedAt[i] === null && Math.hypot(p[0] - goalPos[i]![0]!, p[2] - goalPos[i]![2]!) < GOAL_REACH_M) reachedAt[i] = t
              if (reachedAt[i] === null) all = false
            }
            if (all) break
          }
          for (let i = 0; i < K; i++) {
            let score: number | null = null
            let seg: number | null = null
            for (const e of getTransformerWatchEntries().values()) {
              if (e.entityId === mazeCarId(i) && e.label === 'maze.score') score = Number(/([\d.]+)/.exec(String(e.value))![1])
              if (e.entityId === mazeCarId(i) && e.label === 'maze.seg') seg = Number(e.value)
            }
            console.log(`[maze-train] ${spec.id}: route ${i} (${routes[i]!.reversed ? 'rev' : 'fwd'}): reached ${reachedAt[i] !== null} at ${reachedAt[i]?.toFixed(1) ?? t.toFixed(1)} s, score ${score}, seg ${seg}`)
            expect(reachedAt[i]).not.toBeNull()
            expect(score).toBeGreaterThan(0)
            // the dialog's live active-vector highlight reads maze.seg: the own chain segment index, integer 0..n-2
            expect(seg).not.toBeNull()
            expect(Number.isInteger(seg)).toBe(true)
            expect(seg as number).toBeGreaterThanOrEqual(0)
            expect(seg as number).toBeLessThanOrEqual(chains[i]!.length - 2)
          }
        } finally {
          sim.dispose()
          setAgentObservationWatchActive(false)
        }
      },
      600_000,
    )
  }
})
