/**
 * Shared export driver of the two training-world CLIs (export-maze-training-worlds.ts / export-crux-training-
 * worlds.ts): per world — write world.json, run the headless --score measurement (scoreTrainingWorld), write the
 * route_<i>.svg tiles, write meta.json (+ tileSvg), write thumb.svg — then invalidate the agent-dev example-world
 * id cache and print the summary. The per-set facts (specs, geometry + colors, score-stage wiring, meta body,
 * table rows) live in the `TrainingWorldsExport` the CLI passes; everything else is this driver's implementation.
 * Byte-identical output across the extraction: the file writes below are the same statements both CLIs ran.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RennWorld } from '../../src/types/world'
import type { V2 } from '../../src/avEvolution/eval/geometry'
import type { Course } from '../../src/policyEvolution/courses'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { shippedGenomeV3 } from '../../src/policyEvolution/exampleWorld'
import { trialMazeTrainingCandidate, type MazeTrainingCandidate } from '../../src/policyEvolution/mazeTraining'
import { scoreTrainingWorld, type TrainingScoreRunResult } from './trainingScoreRun'
import { thumbSvg } from './trainingThumbSvg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MAX_SIM_S = 120

/** One chain / route copy of a world: its polyline + tile/thumb color pair and the thumb's x offset (the world layout). */
export interface TrainingWorldCopy {
  points: V2[]
  color: string
  startColor: string
  ox: number
}

/**
 * The per-set facts of one training-world export. `setup` runs once per spec; its `context` (the maze routes /
 * the crux chains) is handed back to `meta` and `rowOf` so nothing is derived twice.
 */
export interface TrainingWorldsExport<TSpec extends { id: string }, TContext> {
  specs: readonly TSpec[]
  /** log name: `<name> written to public/exampleWorlds/` */
  name: string
  /** optional engine warm-up before the first setup (the crux chain enumeration gates pursuit episodes) */
  warmup?: () => Promise<void>
  setup: (spec: TSpec) => { course: Course; context: TContext; copies: readonly TrainingWorldCopy[] }
  buildWorld: (spec: TSpec, genome: number[]) => RennWorld
  /** score-stage transformer id of copy `i` (maze_score_<i> / crux_score_<i>) */
  scoreStageId: (copy: number) => string
  score: { carId: (i: number) => string; goalPrefix: string; goalReachM: number; watchLabel: string }
  /** meta.json body of one world (the driver adds tileSvg) */
  meta: (
    spec: TSpec,
    context: TContext,
    bestScore: number | null,
    trialCandidate: MazeTrainingCandidate | undefined,
  ) => Record<string, unknown>
  /** --score table header + one row per measured copy */
  rowsHeader: string
  rowOf: (spec: TSpec, context: TContext, copy: number, result: TrainingScoreRunResult) => string
}

export async function exportTrainingWorlds<TSpec extends { id: string }, TContext>(
  exp: TrainingWorldsExport<TSpec, TContext>,
): Promise<void> {
  const t0 = Date.now()
  await exp.warmup?.()
  const genome = shippedGenomeV3()
  if (!genome) throw new Error('shippedPolicyV3.json not shipped yet (tools/policy-evolution/ship.ts)')
  // when trialing via RENN_V3_GENOME_FILE (shippedGenomeV3 reads the same file), name the candidate in meta.json
  // (the dialog shows candidate.label) instead of silently labelling a trial as the shipped policy
  const overridePath = process.env.RENN_V3_GENOME_FILE
  const trialCandidate: MazeTrainingCandidate | undefined = overridePath
    ? trialMazeTrainingCandidate(JSON.parse(readFileSync(overridePath, 'utf8')) as { best?: { gen?: number }; source?: string }, overridePath)
    : undefined
  const withScore = process.argv.includes('--score')
  const rows: string[] = [exp.rowsHeader]
  for (const spec of exp.specs) {
    const { course, context, copies } = exp.setup(spec)
    const world = exp.buildWorld(spec, genome)
    const scoreStages = (world.transformers as Record<string, { params?: { vRef?: number; bonusRate?: number; chains?: number[][][]; walls?: V2[][] } }>)
    const scoreStage0 = scoreStages[exp.scoreStageId(0)]
    const chainsWorld = (scoreStage0?.params?.chains ?? []) as number[][][]
    // the line-of-sight gate walls live on each copy's own score stage (shifted to its copy)
    const wallsWorld = Array.from({ length: chainsWorld.length }, (_, i) => (scoreStages[exp.scoreStageId(i)]?.params?.walls ?? []) as V2[][])
    const outDir = resolve(root, 'public/exampleWorlds', spec.id)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
    let bestScore: number | null = null
    let copyScores: Array<number | null> = copies.map(() => null)
    if (withScore) {
      const results = await scoreTrainingWorld(world, {
        carId: exp.score.carId,
        goalPrefix: exp.score.goalPrefix,
        goalReachM: exp.score.goalReachM,
        watchLabel: exp.score.watchLabel,
        maxSimS: MAX_SIM_S,
        chains: chainsWorld,
        walls: wallsWorld,
        vRef: scoreStage0?.params?.vRef ?? 20,
        bonusRate: scoreStage0?.params?.bonusRate ?? 5,
      })
      bestScore = Math.max(...results.map((r) => r.score))
      copyScores = results.map((r) => r.score)
      results.forEach((r, i) => rows.push(exp.rowOf(spec, context, i, r)))
    }
    // per-copy tiles: individually clickable in the dialog (select the run's target vector); every tile svg shares
    // one pixel size, and the dialog overlays the live active-vector highlight on tileSvg.routes[i].pts
    const tileRoutes: Array<{ pts: Array<[number, number]>; score: number | null }> = []
    let tileW = 0
    let tileH = 0
    copies.forEach((copy, i) => {
      const tile = thumbSvg(course.boxes, [{ ox: 0, chain: copy.points, color: copy.color, startColor: copy.startColor }])
      writeFileSync(resolve(outDir, `route_${i}.svg`), tile.svg)
      tileW = tile.w
      tileH = tile.h
      tileRoutes.push({ pts: tile.frames[0]!.pts, score: copyScores[i] })
    })
    const tileSvg = { w: tileW, h: tileH, routes: tileRoutes }
    writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ ...exp.meta(spec, context, bestScore, trialCandidate), tileSvg }, null, 2) + '\n')
    writeFileSync(
      resolve(outDir, 'thumb.svg'),
      thumbSvg(course.boxes, copies.map((copy) => ({ ox: copy.ox, chain: copy.points, color: copy.color, startColor: copy.startColor }))).svg,
    )
  }
  invalidateAgentDevExampleWorldIdCache()
  console.log(`${exp.name} written to public/exampleWorlds/ (--score ${withScore ? 'on' : 'off'})`)
  if (withScore) console.log(rows.join('\n'))
  console.log(`wall clock: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}
