import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureSchlauGenome, shippedGenomeSchlau } from '@/policyEvolution/exampleWorld'
import { hiddenOfSchlau, SCHLAU_ACTUATOR_ID, SCHLAU_STAGE_ID } from '@/policyEvolution/schlauPolicy'
import {
  PLACEHOLDER_SCHLAU_TRAINING_CANDIDATE,
  SCHLAU_GOAL_PREFIX,
  SCHLAU_GOAL_Y,
  SCHLAU_TRAINING_WORLDS,
  applySchlauCandidate,
  buildSchlauTrainingWorld,
  focusSchlauGoal,
  placeholderSchlauGenome,
  schlauCarId,
  schlauGoalId,
  schlauScoreStageId,
  schlauTrainingMeta,
  schlauTrainingSetup,
  shippedSchlauTrainingCandidate,
  trialSchlauTrainingCandidate,
  type SchlauTrainingCandidate,
} from '@/policyEvolution/schlauTraining'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'

/**
 * The six schlau training worlds: ONE start -> goal task per world (3 open seeds 3001-3003, 3 box seeds 3004-3006),
 * the geodesic nose -> goal path as the world's single guidance chain, the schlau policy driving the one car.
 * Regenerate after any change to src/policyEvolution/schlauTraining.ts or a schlau ship:
 *   npx tsx tools/renn-mcp/export-schlau-training-worlds.ts --score
 * The headless policy runs are env-gated (SCHLAU_TRAIN_SIM=1): they take minutes, not milliseconds.
 */

/** The genome the exporter bakes in: the RENN_SCHLAU_GENOME_FILE trial, else the shipped schlau policy, else the placeholder. */
const genome = () => {
  const override = process.env.RENN_SCHLAU_GENOME_FILE
  if (override) {
    const parsed = JSON.parse(readFileSync(override, 'utf8')) as { genome?: number[]; best?: { genome?: number[] } }
    const g = parsed.genome ?? parsed.best?.genome
    if (!g || g.length === 0) throw new Error(`RENN_SCHLAU_GENOME_FILE ${override} has no genome`)
    return ensureSchlauGenome(g)
  }
  return shippedGenomeSchlau() ?? placeholderSchlauGenome()
}

/** The candidate meta.json must name: the trial, else the shipped policy, else the placeholder. */
const expectedCandidate = (): SchlauTrainingCandidate => {
  const override = process.env.RENN_SCHLAU_GENOME_FILE
  if (override)
    return trialSchlauTrainingCandidate(
      JSON.parse(readFileSync(override, 'utf8')) as { best?: { gen?: number }; source?: string },
      override,
    )
  if (shippedGenomeSchlau()) {
    try {
      return shippedSchlauTrainingCandidate(JSON.parse(readFileSync('src/policyEvolution/shippedPolicySchlau.json', 'utf8')) as { source?: string })
    } catch {
      return shippedSchlauTrainingCandidate({})
    }
  }
  return PLACEHOLDER_SCHLAU_TRAINING_CANDIDATE
}

describe('schlau training worlds', () => {
  it('a schlau genome is available (the worlds are built from it)', () => {
    expect(hiddenOfSchlau(genome().length)).toBeGreaterThanOrEqual(1)
  })

  for (const spec of SCHLAU_TRAINING_WORLDS) {
    it(`${spec.id}: on disk equals the exporter output`, () => {
      const disk = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'world.json'), 'utf8'))
      expect(disk).toEqual(JSON.parse(JSON.stringify(buildSchlauTrainingWorld(spec, genome()))))
    })

    it(`${spec.id}: meta.json matches schlauTrainingMeta (chain = the geodesic path stats, one tile)`, () => {
      const meta = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'meta.json'), 'utf8'))
      const { path } = schlauTrainingSetup(spec)
      expect(meta.id).toBe(spec.id)
      expect(meta.seed).toBe(spec.seed)
      expect(meta.name).toBe(spec.name)
      expect(meta.kind).toBe(spec.kind)
      expect(meta.candidate).toEqual(expectedCandidate())
      expect(meta.bestScore === null || typeof meta.bestScore === 'number').toBe(true)
      expect(meta.chain.points).toBe(path.length)
      expect(meta.chain.lengthM).toBeCloseTo(schlauTrainingMeta(spec, path, null).chain.lengthM, 5)
      // tileSvg: the dialog tile data (ONE tile: the geodesic path in svg pixel space)
      const tile = meta.tileSvg as { w: number; h: number; routes: Array<{ pts: Array<[number, number]>; score: number | null }> }
      expect(tile).toBeTruthy()
      expect(tile.w).toBeGreaterThan(0)
      expect(tile.h).toBeGreaterThan(0)
      expect(tile.routes).toHaveLength(1)
      expect(tile.routes[0]!.pts).toHaveLength(path.length)
      for (const [x, y] of tile.routes[0]!.pts) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(tile.w)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(tile.h)
      }
      expect(tile.routes[0]!.score === null || typeof tile.routes[0]!.score === 'number').toBe(true)
      // a --score export measures the one task: bestScore is its score
      if (meta.bestScore !== null) {
        expect(tile.routes[0]!.score).toBe(meta.bestScore)
      }
    })

    it(`${spec.id}: one car + goal slab + score stage, the car draws everything`, () => {
      const { task, path, walls } = schlauTrainingSetup(spec)
      const world = buildSchlauTrainingWorld(spec, genome()) as unknown as {
        world: { debugTargetLineEntityId?: string; camera?: { target?: string } }
        entities: { id: string; transformers?: string[]; position: number[] }[]
        transformers: Record<string, { params?: Record<string, unknown> }>
      }
      const carId = schlauCarId(0)
      expect(world.world.debugTargetLineEntityId).toBe(carId)
      expect(world.world.camera?.target).toBe(carId)
      const car = world.entities.find((e) => e.id === carId)
      expect(car?.transformers).toEqual([SCHLAU_STAGE_ID, SCHLAU_ACTUATOR_ID, schlauScoreStageId(0)])
      // the drive stage runs the baked genome on this task's goal
      const drive = world.transformers[SCHLAU_STAGE_ID]?.params
      expect(drive?.w).toEqual(genome())
      expect(drive?.goal).toEqual([task.goal[0], task.goal[1]])
      expect(world.transformers[SCHLAU_ACTUATOR_ID]).toMatchObject({ type: 'car2', priority: 11, enabled: true })
      // the score stage scores the geodesic path (the world's single chain), only car 0 draws the HUD
      const scoreParams = world.transformers[schlauScoreStageId(0)]?.params
      expect(scoreParams?.chain).toEqual(path)
      expect(scoreParams?.chains).toEqual([path])
      expect(scoreParams?.walls).toEqual(walls)
      expect(scoreParams?.cars).toEqual([carId])
      expect(scoreParams?.hud).toBe(true)
      // one goal slab at the task's goal, one static box per task box
      const goal = world.entities.find((e) => e.id === schlauGoalId(0))
      expect(goal?.position).toEqual([task.goal[0], SCHLAU_GOAL_Y, task.goal[1]])
      expect(world.entities.filter((e) => e.id.startsWith(SCHLAU_GOAL_PREFIX))).toHaveLength(1)
      expect(world.entities.filter((e) => e.id.startsWith('box_'))).toHaveLength(task.boxes.length)
    })
  }

  it('route_0.svg + thumb.svg exist on disk for every world; route_1.svg does not (one task per world)', () => {
    for (const spec of SCHLAU_TRAINING_WORLDS) {
      expect(existsSync(join('public/exampleWorlds', spec.id, 'route_0.svg'))).toBe(true)
      expect(existsSync(join('public/exampleWorlds', spec.id, 'thumb.svg'))).toBe(true)
      expect(existsSync(join('public/exampleWorlds', spec.id, 'route_1.svg'))).toBe(false)
    }
  })

  it('focusSchlauGoal: camera + display entity + HUD flag focus the one task; any other index is a no-op', () => {
    const base = buildSchlauTrainingWorld(SCHLAU_TRAINING_WORLDS[3]!, placeholderSchlauGenome())
    const carId = schlauCarId(0)
    const focused = focusSchlauGoal(base, 0) as unknown as {
      world: { camera: { target?: string }; debugTargetLineEntityId?: string }
      transformers: Record<string, { params?: { hud?: boolean } }>
    }
    expect(focused.world.camera.target).toBe(carId)
    expect(focused.world.debugTargetLineEntityId).toBe(carId)
    expect(focused.transformers[schlauScoreStageId(0)]?.params?.hud).toBe(true)
    // ONE task per world: every other index returns the world unchanged
    expect(focusSchlauGoal(base, 1)).toEqual(base)
    expect(focusSchlauGoal(base, 99)).toEqual(base)
    expect(focusSchlauGoal(base, -1)).toEqual(base)
  })

  it('applySchlauCandidate swaps the drive-stage weights of the loaded world; a non-schlau genome throws', () => {
    const base = buildSchlauTrainingWorld(SCHLAU_TRAINING_WORLDS[0]!, placeholderSchlauGenome())
    const candidate = placeholderSchlauGenome().map((w) => w + 0.01)
    const swapped = applySchlauCandidate(base, candidate) as unknown as {
      transformers: Record<string, { params?: Record<string, unknown> }>
    }
    expect(swapped.transformers[SCHLAU_STAGE_ID]?.params?.w).toEqual(candidate)
    // the input world is untouched (deep clone)
    expect((base as unknown as typeof swapped).transformers[SCHLAU_STAGE_ID]?.params?.w).toEqual(placeholderSchlauGenome())
    // a v3-shaped genome is NOT a schlau genome (same 29 H + 2 length, different layout) — anything unshaped throws
    expect(() => applySchlauCandidate(base, new Array<number>(10).fill(0))).toThrow(/schlau/)
  })
})

// --- env-gated headless runs (SCHLAU_TRAIN_SIM=1): minutes of simulation, not part of the default suite ----------------
// Smoke gate only: the baked candidate is the untrained placeholder until the first schlau net is trained and
// shipped, so the runs assert the world DRIVES (the car moves, the score watch ticks, the segment index is sane) —
// not that it reaches. The progress gate (reached within 120 s, score > 0) joins with the first real training:
//   SCHLAU_TRAIN_SIM=1 npx vitest run src/test/scenarios/schlau-training-worlds.test.ts -t 'headless schlau run'
// Trialing a candidate (the run always writes its latest best next to --out):
//   RENN_SCHLAU_GENOME_FILE=test-results/policy-evolution/latest-best.json npx tsx tools/renn-mcp/export-schlau-training-worlds.ts --score

const MAX_SIM_S = 120

describe.skipIf(process.env.SCHLAU_TRAIN_SIM !== '1')('schlau training worlds: headless schlau run (SCHLAU_TRAIN_SIM=1)', () => {
  for (const spec of SCHLAU_TRAINING_WORLDS) {
    it(
      `${spec.id}: the on-disk world drives — the car moves and the score watch ticks`,
      async () => {
        const { path } = schlauTrainingSetup(spec)
        const world = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'world.json'), 'utf8')) as never
        const carId = schlauCarId(0)
        const start = (world as { entities: { id: string; position: number[] }[] }).entities.find((e) => e.id === carId)!.position
        setAgentObservationWatchActive(true)
        const sim = await WorldSimulator.create(world, 0)
        try {
          let t = 0
          for (let f = 0; f < Math.round(MAX_SIM_S / DEFAULT_DT); f++) {
            sim.runFrames(1)
            t = (f + 1) * DEFAULT_DT
            const p = sim.getPosition(carId)
            if (Math.hypot(p[0] - start[0]!, p[2] - start[2]!) > 5) break // the car left its start pose — the world drives
          }
          const p = sim.getPosition(carId)
          expect(Math.hypot(p[0] - start[0]!, p[2] - start[2]!)).toBeGreaterThan(5)
          let score: number | null = null
          let seg: number | null = null
          for (const e of getTransformerWatchEntries().values()) {
            if (e.entityId === carId && e.label === 'schlau.score') score = Number(/([\d.]+)/.exec(String(e.value))![1])
            if (e.entityId === carId && e.label === 'schlau.seg') seg = Number(e.value)
          }
          console.log(`[schlau-train] ${spec.id}: moved after ${t.toFixed(1)} s, score ${score}, seg ${seg}`)
          expect(score).not.toBeNull()
          expect(Number.isFinite(score)).toBe(true)
          // the dialog's live active-vector highlight reads schlau.seg: the own chain segment index, integer 0..n-2
          expect(seg).not.toBeNull()
          expect(Number.isInteger(seg)).toBe(true)
          expect(seg as number).toBeGreaterThanOrEqual(0)
          expect(seg as number).toBeLessThanOrEqual(path.length - 2)
        } finally {
          sim.dispose()
          setAgentObservationWatchActive(false)
        }
      },
      600_000,
    )
  }
})
