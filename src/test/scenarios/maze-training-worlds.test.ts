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
  MAZE_TRAINING_WORLDS,
  MAZE_TRAIN_CHAIN_COLORS,
  MAZE_TRAIN_CHAIN_COLORS_REVERSED,
  MAZE_TRAIN_ROUTES,
  buildMazeTrainingWorld,
  mazeCarId,
  mazeGoalId,
  mazeScoreStageId,
  mazeTrainingMeta,
  mazeTrainingRoutes,
  type MazeRoute,
} from '@/policyEvolution/mazeTraining'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'

/**
 * The five maze training worlds: one maze copy per training route (several routes through the maze, some driven in
 * reverse direction — bias removal), the shipped v3 policy driving every copy on its own tapered guidance chain.
 * Regenerate after any change to src/policyEvolution/mazeTraining.ts or a policy ship:
 *   npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score
 * The headless policy runs are env-gated (MAZE_TRAIN_SIM=1): they take minutes, not milliseconds.
 */

const genome = () => shippedGenomeV3()

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
        expect(r.route.length).toBeLessThanOrEqual(26)
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
      expect(meta.candidate).toEqual({ policy: 'v3', label: 'v3 shipped (gen 1000)', gen: 1000, source: 'shippedPolicyV3.json' })
      expect(meta.bestScore === null || typeof meta.bestScore === 'number').toBe(true)
      expect(meta.chain.points).toBe(chains[0]!.length)
      expect(meta.chain.lengthM).toBeCloseTo(mazeTrainingMeta(spec, routes, null).chain.lengthM, 5)
      expect(meta.routes).toEqual({
        forward: routes.filter((r) => !r.reversed).length,
        reversed: routes.filter((r) => r.reversed).length,
      })
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
        // the score stage of car i scores the SAME (shifted) chain its drive stage commands
        const scoreParams = world.transformers[mazeScoreStageId(i)]?.params
        expect(scoreParams?.chain).toEqual(world.transformers[`policy_drive_${i}`]?.params?.chain)
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

// --- env-gated headless policy runs (MAZE_TRAIN_SIM=1): minutes of simulation, not part of the default suite --------
// This gate doubles as the maze-training progress gate: with the shipped v3 (gen 1000) maze_train_3 stalls at the first
// junction on the primary route (reached false, score ~47) while 1/2/4/5 clear in ~5 s — the v3maze run
// (training-data/policy-evolution/v3maze.json, --kinds maze, warm from the shipped v3) exists to close exactly that
// gap, now measured on every route (forward AND reversed). The gate goes green for all five when a maze-trained
// candidate clears every route; re-export + re-measure then:
//   npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score

const GOAL_REACH_M = MAZE_GOAL_REACH_M
const MAX_SIM_S = 120

describe.skipIf(process.env.MAZE_TRAIN_SIM !== '1')('maze training worlds: headless v3 run (MAZE_TRAIN_SIM=1)', () => {
  for (const spec of MAZE_TRAINING_WORLDS) {
    it(
      `${spec.id}: EVERY car reaches its goal within ${MAX_SIM_S} s of sim and scores > 0`,
      async () => {
        const { routes } = mazeTrainingRoutes(spec)
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
            for (const e of getTransformerWatchEntries().values()) {
              if (e.entityId === mazeCarId(i) && e.label === 'maze.score') score = Number(/(\d+)/.exec(String(e.value))![1])
            }
            console.log(`[maze-train] ${spec.id}: route ${i} (${routes[i]!.reversed ? 'rev' : 'fwd'}): reached ${reachedAt[i] !== null} at ${reachedAt[i]?.toFixed(1) ?? t.toFixed(1)} s, score ${score}`)
            expect(reachedAt[i]).not.toBeNull()
            expect(score).toBeGreaterThan(0)
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
