/**
 * Read-only candidate evaluation for the widen-freeze pipeline (and any A/B screening): evaluates ONE policy on the
 * v3 TRAIN / HOLDOUT episodes of the given kinds and writes a machine-readable per-kind report — chain finish rate,
 * offcourse / crash counts, WALL-TOUCH usage (mean touch frames, share of episodes that touched), reverse usage —
 * plus the weakest-link fitness. The phase-1 validation gate and the A/B driver diff these reports against the warm
 * candidate's baseline; nothing here influences any training.
 *
 *   npx tsx tools/policy-evolution/eval-candidate.ts --policy FILE --kinds free,bay,corridor
 *       [--train-per-kind 6] [--holdout-per-kind 8] [--workers N] [--out report.json] [--label x] [--speed-cap 10] [--smoke]
 *
 * `--policy FILE`: a candidate file with a top-level `genome` (like the focus driver's *-candidate-best.json or
 * latest-best.json), a plain `{ genome }` file, or a run file with `best.genome` / `epochBest.genome` (epochBest
 * wins — a focused run's stored best can be a stale pre-focus genome).
 *
 * `--smoke`: a quick manual look only (train/holdout 3 per kind, report marked `smoke: true`) — reports and gates
 * never go below the decision-grade default of DECISION_HOLDOUT_PER_KIND (see src/policyEvolution/evalDefaults.ts).
 */
import fs from 'node:fs'
import os from 'node:os'
import { flattenChainKeys, holdoutV3Episodes, parseChainEpisodeKey, trainV3Episodes } from '@/policyEvolution/chains'
import { parseKinds } from '@/policyEvolution/chainReport'
import { parseCourseKey, V3_KINDS, type CourseKind } from '@/policyEvolution/courses'
import { aggregateKindMin, episodeValues } from '@/policyEvolution/es'
import type { PolicyEpisodeMetrics } from '@/policyEvolution/episode'
import { warmCruxGate } from '@/policyEvolution/cruxChains'
import { DECISION_HOLDOUT_PER_KIND, DECISION_TRAIN_PER_KIND, SMOKE_HOLDOUT_PER_KIND, SMOKE_TRAIN_PER_KIND } from '@/policyEvolution/evalDefaults'
import { PolicyPool } from './pool'

const argv = process.argv.slice(2)
const arg = (n: string) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : undefined)
const num = (n: string, d: number) => (arg(n) !== undefined ? Number(arg(n)) : d)

interface KindReport {
  kind: CourseKind
  chains: number
  finished: number
  finishRate: number
  offcourse: number
  crashes: number
  stalls: number
  /** mean wall-touch frames per episode (60 frames = 1 s of contact) */
  meanTouchWallFrames: number
  /** share of episodes with ANY wall touch */
  touchedShare: number
  /** time-weighted share of the sim time spent driving backwards */
  reverseShare: number
  maxReverseM: number
}

function kindReports(metrics: PolicyEpisodeMetrics[], kinds: readonly CourseKind[]): KindReport[] {
  return kinds.map((kind) => {
    const of = metrics.filter((m) => parseCourseKey(parseChainEpisodeKey(m.key).setupKey).kind === kind)
    if (!of.length) return { kind, chains: 0, finished: 0, finishRate: 0, offcourse: 0, crashes: 0, stalls: 0, meanTouchWallFrames: 0, touchedShare: 0, reverseShare: 0, maxReverseM: 0 }
    const time = of.reduce((a, m) => a + m.timeS, 0)
    return {
      kind,
      chains: of.length,
      finished: of.filter((m) => m.outcome === 'finish').length,
      finishRate: of.filter((m) => m.outcome === 'finish').length / of.length,
      offcourse: of.filter((m) => m.outcome === 'offcourse').length,
      crashes: of.filter((m) => m.outcome === 'crash').length,
      stalls: of.filter((m) => m.outcome === 'stall' || m.outcome === 'flip' || m.outcome === 'timeout').length,
      meanTouchWallFrames: of.reduce((a, m) => a + m.touchWallFrames, 0) / of.length,
      touchedShare: of.filter((m) => m.touchWallFrames > 0).length / of.length,
      reverseShare: time > 0 ? of.reduce((a, m) => a + (m.reverseShare ?? 0) * m.timeS, 0) / time : 0,
      maxReverseM: of.reduce((a, m) => Math.max(a, m.maxReverseM ?? 0), 0),
    }
  })
}

async function main() {
  // the crux kind's chain enumeration runs the sync pursuit gate: the physics engine must be warm first
  await warmCruxGate()
  const policyFile = arg('policy')
  if (!policyFile) throw new Error('usage: eval-candidate.ts --policy FILE [--kinds a,b] [--train-per-kind 6] [--holdout-per-kind 8] [--out report.json] [--label x] [--smoke]')
  const json = JSON.parse(fs.readFileSync(policyFile, 'utf8')) as { genome?: number[]; best?: { genome: number[] }; epochBest?: { genome: number[] } }
  const genome = json.genome ?? json.epochBest?.genome ?? json.best?.genome
  if (!genome) throw new Error(`${policyFile}: no genome (expected top-level genome, epochBest.genome or best.genome)`)
  const kinds = parseKinds(arg('kinds'), V3_KINDS)
  const smoke = argv.includes('--smoke')
  if (smoke) console.warn('SMOKE eval — quick look only (3 setups/kind); reports and gates must use the decision-grade default')
  const trainPerKind = num('train-per-kind', smoke ? SMOKE_TRAIN_PER_KIND : DECISION_TRAIN_PER_KIND)
  const holdoutPerKind = num('holdout-per-kind', smoke ? SMOKE_HOLDOUT_PER_KIND : DECISION_HOLDOUT_PER_KIND)
  const speedCap = arg('speed-cap') !== undefined ? Number(arg('speed-cap')) : undefined
  const pool = new PolicyPool(num('workers', Math.max(1, os.cpus().length - 1)))
  const evaluate = pool.evaluator()
  const t0 = Date.now()
  const runSplit = async (split: 'train' | 'holdout') => {
    const groups = split === 'train' ? trainV3Episodes(trainPerKind, kinds) : holdoutV3Episodes(holdoutPerKind, kinds)
    const keys = flattenChainKeys(groups)
    const metrics = await evaluate(genome, keys)
    return {
      split,
      episodes: keys.length,
      fitness: aggregateKindMin(metrics, speedCap),
      worst3: episodeValues(metrics, speedCap).slice(0, 3),
      perKind: kindReports(metrics, kinds),
      metrics,
    }
  }
  const [train, holdout] = await Promise.all([runSplit('train'), runSplit('holdout')])
  const report = {
    schema: 'renn.policy-evolution.candidate-eval/1',
    policy: policyFile,
    label: arg('label') ?? '',
    evaluatedAt: new Date().toISOString(),
    kinds: [...kinds],
    ...(smoke ? { smoke: true } : {}),
    ...(speedCap ? { speedCap } : {}),
    hidden: (genome.length - 2) / 29,
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    train: { ...train, metrics: undefined },
    holdout: { ...holdout, metrics: undefined },
  }
  const fmt = (r: KindReport) =>
    `${r.kind.padEnd(8)} ${r.finished}/${r.chains} (${(100 * r.finishRate).toFixed(0)} %)  offc ${r.offcourse} crash ${r.crashes} stall ${r.stalls} | touch ${r.meanTouchWallFrames.toFixed(0)} f/ep, ${(100 * r.touchedShare).toFixed(0)} % eps | rev ${(100 * r.reverseShare).toFixed(0)} % max ${r.maxReverseM.toFixed(0)} m`
  console.log(`eval ${policyFile} H=${report.hidden} [${report.label}]  (${report.elapsedSec} s)`)
  for (const s of [train, holdout]) {
    console.log(`\n## ${s.split}: fitness ${s.fitness.toFixed(3)} worst3 [${s.worst3.map((x) => x.toFixed(3)).join(' ')}]`)
    for (const r of s.perKind) if (r.chains) console.log(`  ${fmt(r)}`)
  }
  if (arg('out')) fs.writeFileSync(arg('out')!, JSON.stringify({ ...report, train: { ...train, metrics: train.metrics }, holdout: { ...holdout, metrics: holdout.metrics } }, null, 1) + '\n')
  await pool.close()
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
