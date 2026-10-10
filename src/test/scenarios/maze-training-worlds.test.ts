import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pointPolyGap, rectPoly } from '@/avEvolution/eval/geometry'
import { shippedGenomeV3 } from '@/policyEvolution/exampleWorld'
import { POLICY_CAR_ID } from '@/policyEvolution/episode'
import {
  MAZE_CHAIN_MAX_POINTS,
  MAZE_CHAIN_WALL_CLEAR_M,
  MAZE_GOAL_ID,
  MAZE_GOAL_REACH_M,
  MAZE_SCORE_STAGE_ID,
  MAZE_TRAINING_WORLDS,
  buildMazeTrainingWorld,
  mazeTrainingChain,
  mazeTrainingMeta,
} from '@/policyEvolution/mazeTraining'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'

/**
 * The five maze training worlds (shipped v3 policy on seeded 6x6 mazes, tapered guidance chains, in-world scoring).
 * Regenerate after any change to src/policyEvolution/mazeTraining.ts or a policy ship:
 *   npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score
 * The headless policy runs are env-gated (MAZE_TRAIN_SIM=1): they take minutes, not milliseconds.
 */

const genome = () => shippedGenomeV3()

describe('maze training worlds', () => {
  it('shipped v3 genome is available (the worlds are built from it)', () => {
    expect(genome()).toBeTruthy()
  })

  for (const spec of MAZE_TRAINING_WORLDS) {
    it(`${spec.id}: on disk equals the exporter output`, () => {
      const disk = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'world.json'), 'utf8'))
      expect(disk).toEqual(JSON.parse(JSON.stringify(buildMazeTrainingWorld(spec, genome()!))))
    })

    it(`${spec.id}: meta.json matches mazeTrainingMeta (id/seed/name + chain stats consistent with taperChain)`, () => {
      const meta = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'meta.json'), 'utf8'))
      const { chain } = mazeTrainingChain(spec)
      expect(meta.id).toBe(spec.id)
      expect(meta.seed).toBe(spec.seed)
      expect(meta.name).toBe(spec.name)
      expect(meta.candidate).toEqual({ policy: 'v3', label: 'v3 shipped (gen 1000)', gen: 1000, source: 'shippedPolicyV3.json' })
      expect(meta.bestScore === null || typeof meta.bestScore === 'number').toBe(true)
      expect(meta.chain.points).toBe(chain.length)
      expect(meta.chain.lengthM).toBeCloseTo(mazeTrainingMeta(spec, chain, null).chain.lengthM, 5)
    })

    it(`${spec.id}: debug line on the car, score stage attached with the drive stage's chain, no chain marker entities`, () => {
      const world = buildMazeTrainingWorld(spec, genome()!) as unknown as {
        world: { debugTargetLineEntityId?: string }
        entities: { id: string; transformers?: string[] }[]
        transformers: Record<string, { params?: { chain?: number[][] } }>
      }
      expect(world.world.debugTargetLineEntityId).toBe(POLICY_CAR_ID)
      const car = world.entities.find((e) => e.id === POLICY_CAR_ID)
      expect(car?.transformers).toContain(MAZE_SCORE_STAGE_ID)
      expect(world.transformers[MAZE_SCORE_STAGE_ID]?.params?.chain).toEqual(world.transformers['policy_drive']?.params?.chain)
      expect(world.entities.some((e) => e.id.startsWith('chain_marker'))).toBe(false)
      expect(world.entities.find((e) => e.id === MAZE_GOAL_ID)).toBeTruthy()
    })
  }

  it('taperChain: spacing grows along the route, ends stay exact, wall clearance kept, point cap holds', () => {
    for (const spec of MAZE_TRAINING_WORLDS) {
      const { course, route, chain } = mazeTrainingChain(spec)
      expect(chain[0]).toEqual(route[0])
      expect(chain[chain.length - 1]).toEqual(route[route.length - 1])
      expect(chain.length).toBeLessThanOrEqual(MAZE_CHAIN_MAX_POINTS)
      const gaps = chain.slice(1).map((p, i) => Math.hypot(p[0]! - chain[i]![0], p[1]! - chain[i]![1]))
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
      expect(mean(gaps.slice(0, 3))).toBeLessThan(mean(gaps.slice(-3)))
      const polys = course.boxes.map((b) => rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1]))
      for (const p of chain) {
        for (const poly of polys) {
          expect(pointPolyGap(p[0], p[1], poly)).toBeGreaterThanOrEqual(MAZE_CHAIN_WALL_CLEAR_M - 1e-9)
        }
      }
    }
  })
})

// --- env-gated headless policy runs (MAZE_TRAIN_SIM=1): minutes of simulation, not part of the default suite --------
// This gate doubles as the maze-training progress gate: with the shipped v3 (gen 1000) maze_train_3 stalls at the first
// junction (reached false, score ~47) while 1/2/4/5 clear in ~5 s — the v3maze run (training-data/policy-evolution/
// v3maze.json, --kinds maze, warm from the shipped v3) exists to close exactly that gap. The gate goes green for all
// five when a maze-trained candidate clears train_3; re-export + re-measure then:
//   npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score

const GOAL_REACH_M = MAZE_GOAL_REACH_M
const MAX_SIM_S = 120

describe.skipIf(process.env.MAZE_TRAIN_SIM !== '1')('maze training worlds: headless v3 run (MAZE_TRAIN_SIM=1)', () => {
  for (const spec of MAZE_TRAINING_WORLDS) {
    it(
      `${spec.id}: the car reaches the goal within ${MAX_SIM_S} s of sim and scores > 0`,
      async () => {
        const world = buildMazeTrainingWorld(spec, genome()!)
        const goalPos = (world.entities as { id: string; position: number[] }[]).find((e) => e.id === MAZE_GOAL_ID)!.position
        setAgentObservationWatchActive(true)
        const sim = await WorldSimulator.create(world, 0)
        try {
          let t = 0
          let reached = false
          for (let f = 0; f < Math.round(MAX_SIM_S / DEFAULT_DT); f++) {
            sim.runFrames(1)
            t = (f + 1) * DEFAULT_DT
            const p = sim.getPosition(POLICY_CAR_ID)
            if (Math.hypot(p[0] - goalPos[0]!, p[2] - goalPos[2]!) < GOAL_REACH_M) {
              reached = true
              break
            }
          }
          let score: number | null = null
          for (const e of getTransformerWatchEntries().values()) {
            if (e.entityId === POLICY_CAR_ID && e.label === 'maze.score') score = Number(/(\d+)/.exec(String(e.value))![1])
          }
          console.log(`[maze-train] ${spec.id}: reached ${reached} at ${t.toFixed(1)} s, score ${score}`)
          expect(reached).toBe(true)
          expect(score).toBeGreaterThan(0)
        } finally {
          sim.dispose()
          setAgentObservationWatchActive(false)
        }
      },
      300_000,
    )
  }
})
