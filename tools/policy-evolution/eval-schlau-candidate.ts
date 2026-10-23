/**
 * Read-only CROSS-KIND DECISION EVAL for the schlau ship decision (2026-10-23): scores ONE candidate genome — or
 * the untrained placeholder (the status quo the exported worlds bake today) — over the DECISION-GRADE holdout band,
 * 8 holdouts per kind UNSHAPED over ALL THREE schlau kinds (goal_open, goal_box, goal_wall — schlauCourses.ts),
 * headless via the schlau worker pool. NIE the 3-setup smoke band: --holdout-per-kind below
 * SCHLAU_HOLDOUT_PER_KIND (8) throws — decision reports are never based on a 3-setup eval (the noise lesson of
 * feature-policy-evolution.md). No training, no train split, no shaping bonus — the schlau episode runner has no
 * shaping anyway (runSchlauEpisode), and every episode runs on a FRESH world (all entities at their document
 * poses: the defined-start rule) because buildSchlauWorld creates the world per call.
 *
 *   npx tsx tools/policy-evolution/eval-schlau-candidate.ts --policy FILE [--candidate ID] [--kinds a,b,c]
 *       [--holdout-per-kind 8] [--workers N] [--out report.json] [--label x]
 *   npx tsx tools/policy-evolution/eval-schlau-candidate.ts --placeholder [--out report.json]
 *
 * `--policy FILE`: a run file (`best.genome`, policy 'schlau'), a latest-best export (`genome` / `best.genome`),
 * a plain `{ genome }` file, or the exported candidates file (`candidates[]` — pick one with `--candidate ID`
 * or `--candidate INDEX`). A file whose `policy` is not 'schlau' is REFUSED: schlau genomes are length-identical
 * to v3 (29 H + 2) but wired differently; the policy tag is the only distinguishing mark. `--placeholder` scores
 * placeholderSchlauGenome() (schlauTraining.ts) — the genome the exported worlds bake until the user ships one.
 *
 * Output: per-kind finishes / outcome counts / mean progress share (progress / geodesic start distance) / mean
 * norm / weakest-link min (aggregateKindMin over the kind's episode values, es.ts) / wall-touch usage, plus the
 * same aggregates over the whole band — the numbers the ship-bar verdict needs (better than the placeholder
 * AND goal_wall finishes measurably > 0).
 */
import fs from 'node:fs'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { PolicyEpisodeMetrics } from '@/policyEvolution/episode'
import { aggregateKindMin, episodeValues } from '@/policyEvolution/es'
import { placeholderSchlauGenome } from '@/policyEvolution/schlauTraining'
import { parseSchlauKey, parseSchlauKinds, SCHLAU_HOLDOUT_PER_KIND, SCHLAU_KINDS, schlauHoldoutKeys, type SchlauKind } from '@/policyEvolution/schlauCourses'
import { hiddenOfSchlau, N_IN_SCHLAU } from '@/policyEvolution/schlauPolicy'
import type { SchlauWorkerJob } from './worker-schlau'

/** a decision eval never goes below the decision-grade band (8 holdouts per kind; a 3-setup report is noise) */
export const SCHLAU_EVAL_HOLDOUT_FLOOR = SCHLAU_HOLDOUT_PER_KIND

/** Throws when `n` is below the decision-grade floor — the tool refuses to produce a sub-grade decision report. */
export function assertDecisionGradeHoldout(n: number): number {
  if (!Number.isInteger(n) || n < SCHLAU_EVAL_HOLDOUT_FLOOR)
    throw new Error(`--holdout-per-kind must be an integer >= ${SCHLAU_EVAL_HOLDOUT_FLOOR} (decision-grade; never evaluate a ship decision on a 3-setup band), got ${n}`)
  return n
}

/** One candidate genome + its identity (label / gen / where it came from). */
export interface SchlauCandidateSource {
  id: string
  label: string
  gen: number | null
  source: string
  genome: number[]
}

/** Shape + numbers check of a schlau genome (len = 29 H + 2 for the 26 schlau inputs; a v3 genome passes the LENGTH only — the policy tag guards it, see resolveSchlauCandidate). */
function schlauGenomeOrThrow(genome: unknown, where: string): number[] {
  if (!Array.isArray(genome) || !genome.length || !(genome as unknown[]).every((x) => typeof x === 'number' && Number.isFinite(x)))
    throw new Error(`${where}: no schlau genome (expected an array of finite numbers, got ${Array.isArray(genome) ? `an array of ${genome.length}` : typeof genome})`)
  const g = genome as number[]
  if (hiddenOfSchlau(g.length) < 1)
    throw new Error(`${where}: genome of ${g.length} numbers has no integer hidden size for schlau (${N_IN_SCHLAU} inputs, len = 29 H + 2)`)
  return g
}

/**
 * Resolves the candidate of a parsed policy file: `--candidate ID|INDEX` picks one entry of a candidates export
 * (candidates[] with id/label/gen/genome); without it the top-level `genome`, then `epochBest.genome`, then
 * `best.genome` wins (the eval-candidate.ts order). A `policy` field that is present and not 'schlau' throws —
 * schlau and v3 genomes share the 29 H + 2 length formula and must never cross the streams.
 */
export function resolveSchlauCandidate(
  doc: unknown,
  opts: { candidate?: string; source?: string } = {},
): SchlauCandidateSource {
  if (typeof doc !== 'object' || doc === null) throw new Error(`${opts.source ?? 'policy file'}: not a JSON object`)
  const d = doc as { policy?: unknown; gen?: unknown; genome?: unknown; epochBest?: { gen?: unknown; genome?: unknown }; best?: { gen?: unknown; genome?: unknown }; candidates?: unknown }
  const source = opts.source ?? 'policy file'
  if (d.policy !== undefined && d.policy !== 'schlau')
    throw new Error(`${source}: policy is ${JSON.stringify(d.policy)}, not 'schlau' (schlau and v3 genomes share the 29 H + 2 length formula — never feed one into the other's stage)`)
  if (opts.candidate !== undefined) {
    if (!Array.isArray(d.candidates)) throw new Error(`${source}: --candidate ${opts.candidate} needs a candidates[] export (like public/policy-evolution/schlau-candidates.json)`)
    const sel = opts.candidate
    const entry = /^\d+$/.test(sel) ? (d.candidates as Array<Record<string, unknown>>)[Number(sel)] : (d.candidates as Array<Record<string, unknown>>).find((c) => c.id === sel)
    if (!entry) throw new Error(`${source}: no candidate ${JSON.stringify(sel)} in the candidates export`)
    return {
      id: String(entry.id ?? sel),
      label: String(entry.label ?? entry.id ?? sel),
      gen: typeof entry.gen === 'number' ? entry.gen : null,
      source: `${source}#${sel}`,
      genome: schlauGenomeOrThrow(entry.genome, `${source}#${sel}`),
    }
  }
  const raw = d.genome ?? d.epochBest?.genome ?? d.best?.genome
  const id = d.genome !== undefined ? 'genome' : d.epochBest !== undefined ? 'epochBest' : 'best'
  return {
    id,
    label: d.best?.gen !== undefined || d.epochBest?.gen !== undefined ? `schlau gen ${d.best?.gen ?? d.epochBest?.gen}` : 'schlau candidate',
    gen: typeof (d.best?.gen ?? d.epochBest?.gen ?? d.gen) === 'number' ? ((d.best?.gen ?? d.epochBest?.gen ?? d.gen) as number) : null,
    source,
    genome: schlauGenomeOrThrow(raw, source),
  }
}

/** Per-kind slice of the holdout band: finishes, outcome counts, progress / score aggregates, wall-touch usage. */
export interface SchlauKindReport {
  kind: SchlauKind
  episodes: number
  finished: number
  finishRate: number
  offcourse: number
  crashes: number
  stalls: number
  flips: number
  timeouts: number
  /** mean share of the geodesic start distance covered (progress / d0; 1.0 = reached the goal band) */
  meanProgressShare: number
  /** mean end-of-episode norm (score / (d0 x NORM_SPEED), no fail factor) */
  meanNorm: number
  /** weakest-link value over this kind's episode values (episodeValues / aggregateKindMin, es.ts) */
  minLink: number
  /** mean wall-touch frames per episode (60 frames = 1 s of contact) */
  meanTouchWallFrames: number
  /** share of episodes with ANY wall touch */
  touchedShare: number
  /** mean sim seconds per episode */
  meanTimeS: number
}

const isSchlauKind = (key: string, kind: SchlauKind): boolean => parseSchlauKey(key).kind === kind

/** Aggregates one candidate's holdout metrics per kind (pure; the report's core logic). */
export function schlauKindReports(metrics: PolicyEpisodeMetrics[], kinds: readonly SchlauKind[]): SchlauKindReport[] {
  return kinds.map((kind) => {
    const of = metrics.filter((m) => isSchlauKind(m.key, kind))
    if (!of.length)
      return { kind, episodes: 0, finished: 0, finishRate: 0, offcourse: 0, crashes: 0, stalls: 0, flips: 0, timeouts: 0, meanProgressShare: 0, meanNorm: 0, minLink: 0, meanTouchWallFrames: 0, touchedShare: 0, meanTimeS: 0 }
    const progressShares = of.map((m) => (m.length ? Math.min(1, m.progress / m.length) : 0))
    return {
      kind,
      episodes: of.length,
      finished: of.filter((m) => m.outcome === 'finish').length,
      finishRate: of.filter((m) => m.outcome === 'finish').length / of.length,
      offcourse: of.filter((m) => m.outcome === 'offcourse').length,
      crashes: of.filter((m) => m.outcome === 'crash').length,
      stalls: of.filter((m) => m.outcome === 'stall' || m.outcome === 'timeout').length,
      flips: of.filter((m) => m.outcome === 'flip').length,
      timeouts: of.filter((m) => m.outcome === 'timeout').length,
      meanProgressShare: progressShares.reduce((a, b) => a + b, 0) / of.length,
      meanNorm: of.reduce((a, m) => a + m.norm, 0) / of.length,
      minLink: aggregateKindMin(of),
      meanTouchWallFrames: of.reduce((a, m) => a + m.touchWallFrames, 0) / of.length,
      touchedShare: of.filter((m) => m.touchWallFrames > 0).length / of.length,
      meanTimeS: of.reduce((a, m) => a + m.timeS, 0) / of.length,
    }
  })
}

/** The ship-bar numbers of one candidate (schlauShipBarVerdict's input). */
export interface SchlauShipBarCandidate {
  /** total holdout finishes over the whole band */
  finishes: number
  /** goal_wall holdout finishes (the WF lesson: must be measurably > 0 before any ship) */
  wallFinishes: number
  /** mean progress share over the whole band */
  meanProgressShare: number
}

/** The night session's ship bar, applied to one candidate against the status quo (the placeholder). */
export interface SchlauShipBarVerdict {
  /** strictly more holdout finishes than the status quo, or equal finishes with strictly more mean progress */
  betterThanStatusQuo: boolean
  /** the candidate's goal_wall holdout finishes */
  wallFinishes: number
  /** the wall kind finishes measurably above zero */
  wallAboveZero: boolean
  /** betterThanStatusQuo AND wallAboveZero — the night session's ship bar */
  ship: boolean
}

/**
 * The ship bar of the night session (STATUS.md): ship only if the candidate is BETTER than the status quo (the
 * placeholder the exported worlds bake today) AND the wall kind (goal_wall) finishes measurably above 0. "Better"
 * = strictly more total holdout finishes; on a tie the MEAN PROGRESS SHARE decides (a creeper that stalls at 10 %
 * never out-ranks a driver at 60 % just because both finish 0).
 */
export function schlauShipBarVerdict(c: SchlauShipBarCandidate, statusQuo: SchlauShipBarCandidate): SchlauShipBarVerdict {
  const betterThanStatusQuo = c.finishes > statusQuo.finishes || (c.finishes === statusQuo.finishes && c.meanProgressShare > statusQuo.meanProgressShare)
  const wallAboveZero = c.wallFinishes > 0
  return { betterThanStatusQuo, wallFinishes: c.wallFinishes, wallAboveZero, ship: betterThanStatusQuo && wallAboveZero }
}

// --- worker pool (one episode per worker at a time; jobs queue up — the run-schlau.ts SchlauPool, shared boot) ------------------

interface Pending {
  job: SchlauWorkerJob
  resolve: (m: PolicyEpisodeMetrics) => void
  reject: (e: Error) => void
}

class SchlauPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: Pending[] = []
  private running = new Map<Worker, Pending>()
  private nextId = 1
  private ready: Promise<void>

  constructor(n: number) {
    const url = new URL('./worker-boot-schlau.mjs', import.meta.url)
    const boots: Promise<void>[] = []
    for (let i = 0; i < n; i++) {
      const w = new Worker(url)
      this.workers.push(w)
      boots.push(
        new Promise<void>((resolve, reject) => {
          w.once('error', reject)
          w.on('message', (msg: { ready?: boolean; metrics?: PolicyEpisodeMetrics; error?: string }) => {
            if (msg.ready) {
              this.idle.push(w)
              resolve()
              return
            }
            const p = this.running.get(w)
            this.running.delete(w)
            this.idle.push(w)
            if (p) {
              if (msg.error) p.reject(new Error(msg.error))
              else p.resolve(msg.metrics!)
            }
            this.pump()
          })
        }),
      )
    }
    this.ready = Promise.all(boots).then(() => this.pump())
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift()!
      const p = this.queue.shift()!
      this.running.set(w, p)
      w.postMessage(p.job)
    }
  }

  episode(genome: number[], key: string): Promise<PolicyEpisodeMetrics> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job: { id: this.nextId++, genome, key }, resolve, reject })
      void this.ready.then(() => this.pump())
    })
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()))
  }
}

// --- main ------------------------------------------------------------------------------------------------------------------------

const argv = process.argv.slice(2)
const arg = (n: string) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : undefined)
const num = (n: string, d: number) => (arg(n) !== undefined ? Number(arg(n)) : d)

async function main() {
  const policyFile = arg('policy')
  const placeholder = argv.includes('--placeholder')
  if (!policyFile && !placeholder) throw new Error('usage: eval-schlau-candidate.ts --policy FILE [--candidate ID] [--kinds a,b,c] [--holdout-per-kind 8] [--workers N] [--out report.json] [--label x] | --placeholder')
  const kinds: SchlauKind[] = arg('kinds') !== undefined ? parseSchlauKinds(arg('kinds')!) : [...SCHLAU_KINDS]
  const holdoutPerKind = assertDecisionGradeHoldout(num('holdout-per-kind', SCHLAU_HOLDOUT_PER_KIND))
  const candidate: SchlauCandidateSource = placeholder
    ? { id: 'placeholder', label: 'schlau (untrained placeholder)', gen: null, source: 'placeholderSchlauGenome()', genome: placeholderSchlauGenome() }
    : resolveSchlauCandidate(JSON.parse(fs.readFileSync(policyFile!, 'utf8')), { candidate: arg('candidate'), source: policyFile! })
  const label = arg('label') ?? candidate.label
  const keys = schlauHoldoutKeys(holdoutPerKind, kinds)
  const pool = new SchlauPool(num('workers', Math.max(1, os.cpus().length - 1)))
  const t0 = Date.now()
  const metrics = await Promise.all(keys.map((k) => pool.episode(candidate.genome, k)))
  await pool.close()
  const perKind = schlauKindReports(metrics, kinds)
  const finishes = metrics.filter((m) => m.outcome === 'finish').length
  const progressShares = metrics.map((m) => (m.length ? Math.min(1, m.progress / m.length) : 0))
  const report = {
    schema: 'renn.policy-evolution.schlau-candidate-eval/1',
    policy: 'schlau' as const,
    candidate: { ...candidate, label },
    evaluatedAt: new Date().toISOString(),
    kinds: [...kinds],
    holdoutPerKind,
    episodes: keys.length,
    hidden: hiddenOfSchlau(candidate.genome.length),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    total: {
      finishes,
      finishRate: finishes / metrics.length,
      minLink: aggregateKindMin(metrics),
      worst3: episodeValues(metrics).slice(0, 3),
      meanNorm: metrics.reduce((a, m) => a + m.norm, 0) / metrics.length,
      meanProgressShare: progressShares.reduce((a, b) => a + b, 0) / metrics.length,
      meanTouchWallFrames: metrics.reduce((a, m) => a + m.touchWallFrames, 0) / metrics.length,
    },
    perKind,
    metrics,
  }
  const fmt = (r: SchlauKindReport) =>
    `${r.kind.padEnd(10)} ${r.finished}/${r.episodes} (${(100 * r.finishRate).toFixed(0)} %)  offc ${r.offcourse} crash ${r.crashes} stall ${r.stalls}${r.flips ? ` flip ${r.flips}` : ''}${r.timeouts ? ` t/o ${r.timeouts}` : ''} | prog ${(100 * r.meanProgressShare).toFixed(0)} %  norm ${r.meanNorm.toFixed(3)}  min ${r.minLink.toFixed(3)} | touch ${r.meanTouchWallFrames.toFixed(0)} f/ep, ${(100 * r.touchedShare).toFixed(0)} % eps | ${(r.meanTimeS).toFixed(1)} s/ep`
  console.log(`eval-schlau ${candidate.source} H=${report.hidden} [${label}]  ${finishes}/${metrics.length} finishes  (${report.elapsedSec} s)`)
  for (const r of perKind) if (r.episodes) console.log(`  ${fmt(r)}`)
  console.log(`  TOTAL min-link ${report.total.minLink.toFixed(3)} worst3 [${report.total.worst3.map((x) => x.toFixed(3)).join(' ')}] mean norm ${report.total.meanNorm.toFixed(3)} mean progress ${(100 * report.total.meanProgressShare).toFixed(0)} %`)
  if (arg('out')) {
    fs.mkdirSync(dirname(arg('out')!), { recursive: true })
    fs.writeFileSync(arg('out')!, JSON.stringify(report, null, 1) + '\n')
  }
}

// only run when invoked directly (the unit test imports this module for the pure functions above)
const invokedDirectly = process.argv[1] != null && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly)
  void main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
