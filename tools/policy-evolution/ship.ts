/**
 * Pick the policy to ship from a run file (best mean policy by TRAIN score), round it and compare it with the currently shipped one on
 * the same TRAIN and HOLDOUT courses. src/policyEvolution/shippedPolicy.json is rewritten only if the candidate has the better HOLDOUT
 * fitness (or with --force). For `--v3` the gate is instead on HOLDOUT FINISH COUNT (src/policyEvolution/shipGate.ts, `shipDecision`): candidate ships only if
 * (1) its total finished episodes are STRICTLY higher than the shipped policy's and (2) no kind loses more than tolerance = max(1 episode, ceil(5 % of the kind's
 * episodes)). Fitness is printed as a report column only. The report lists per kind cand/shipped finished, delta, OK/WORSE, and a verdict line naming the failed condition. Then regenerate the example world: npx tsx tools/renn-mcp/export-policy-drive-example-world.ts
 *
 *   npx tsx tools/policy-evolution/ship.ts test-results/policy-evolution/run2.json [--workers 4] [--train-per-kind 30] [--holdout-per-kind 10] [--force]
 *
 * `--v3`: run file of `run-islands.ts --v3`: v3 chain episodes of the kinds free, bay, corridor, field, slalom, maze, crowd (first --train-per-kind / --holdout-per-kind setups per
 * kind, defaults 8 / 6), kind-evenness fitness; per kind the chain finish rate, setups with all chains finished and REVERSE USAGE (share of time backwards, max reverse distance) are
 * printed; writes src/policyEvolution/shippedPolicyV3.json (no comparison partner if absent: the first candidate is written).
 *
 * `--v2`: the run file is a command-chain run (run-islands.ts --v2): TRAIN / HOLDOUT are chain episodes of the first --train-per-kind / --holdout-per-kind
 * accepted setups per kind (all their chains, defaults 8 / 6), fitness is the evenness aggregate and the per-kind chain finish rate, share of setups with all
 * chains finished, offcourse and crashes are reported. Writes src/policyEvolution/shippedPolicyV2.json (compared against it, or against the padded v1 policy if
 * there is none yet; any hidden size, both sizes are printed and a candidate with a different H may replace it when better on HOLDOUT). `--kinds field,crowd` restricts the setup kinds.
 */
import fs from 'node:fs'
import os from 'node:os'
import { flattenChainKeys, holdoutChainEpisodes, holdoutV3Episodes, trainChainEpisodes, trainV3Episodes } from '@/policyEvolution/chains'
import { formatV3Report, v3ReportByKind } from '@/policyEvolution/chainReport'
import { chainReportByKind, formatChainReport, parseKinds, v2GenomeFromFile, v2Hidden } from '@/policyEvolution/chainReport'
import { CHAIN_KINDS, COURSE_KINDS, V3_KINDS, holdoutCourseKeys, trainCourseKeys } from '@/policyEvolution/courses'
import { aggregateEvenness, aggregateFitness, aggregateKindEvenness } from '@/policyEvolution/es'
import { PolicyPool } from './pool'
import { formatShipDecision, shipDecision } from '@/policyEvolution/shipGate'

export { KIND_TOLERANCE_FRACTION, KIND_TOLERANCE_MIN, kindTolerance, shipDecision } from '@/policyEvolution/shipGate'

const argv = process.argv.slice(2)
const v3 = argv.includes('--v3')
const v2 = v3 || argv.includes('--v2')
const SHIPPED = v3 ? 'src/policyEvolution/shippedPolicyV3.json' : v2 ? 'src/policyEvolution/shippedPolicyV2.json' : 'src/policyEvolution/shippedPolicy.json'
const runFile = argv[0]
if (!runFile) throw new Error('usage: ship.ts <run.json> [--workers N] [--train-per-kind N] [--holdout-per-kind N] [--force] [--v2] [--kinds a,b]')
const opt = (name: string, d: number) => {
  const i = argv.indexOf(`--${name}`)
  return i > 0 ? Number(argv[i + 1]) : d
}
const run = JSON.parse(fs.readFileSync(runFile, 'utf8')) as { best?: { gen: number; genome: number[] } }
if (!run.best) throw new Error('run file has no best policy yet')
const genome = (v2 ? v2GenomeFromFile(run) : run.best.genome).map((x) => Math.round(x * 1e5) / 1e5)
const pool = new PolicyPool(opt('workers', Math.max(1, os.cpus().length - 1)))
const evaluate = pool.evaluator()
const kindsArg = argv.indexOf('--kinds') > 0 ? argv[argv.indexOf('--kinds') + 1] : undefined
const kinds = parseKinds(kindsArg, v3 ? V3_KINDS : v2 ? CHAIN_KINDS : COURSE_KINDS)
const trainKeys = v3 ? flattenChainKeys(trainV3Episodes(opt('train-per-kind', 8), kinds)) : v2 ? flattenChainKeys(trainChainEpisodes(opt('train-per-kind', 8), kinds)) : trainCourseKeys(opt('train-per-kind', 6), kinds)
const holdoutKeys = v3 ? flattenChainKeys(holdoutV3Episodes(opt('holdout-per-kind', 6), kinds)) : v2 ? flattenChainKeys(holdoutChainEpisodes(opt('holdout-per-kind', 6), kinds)) : holdoutCourseKeys(opt('holdout-per-kind', 6), kinds)
const fitness = v3 ? aggregateKindEvenness : v2 ? aggregateEvenness : aggregateFitness

let holdoutNorms: number[] = []
async function score(g: number[]) {
  const [tr, ho] = await Promise.all([evaluate(g, trainKeys), evaluate(g, holdoutKeys)])
  holdoutNorms = ho.map((m) => m.norm)
  const outcomes = (m: typeof tr) => Object.fromEntries(['finish', 'crash', 'offcourse', 'stall', 'flip', 'timeout'].map((o) => [o, m.filter((x) => x.outcome === o).length]))
  const part = (m: typeof tr) => ({ fitness: fitness(m), meanProgress: m.reduce((a, x) => a + x.progress, 0) / m.length, outcomes: outcomes(m), ...(v3 ? { perKind: v3ReportByKind(m, kinds) } : v2 ? { perKind: chainReportByKind(m, kinds) } : {}) })
  return { train: part(tr), holdout: part(ho) }
}

try {
  const cand = await score(genome)
  const candNorms = holdoutNorms
  const V1 = 'src/policyEvolution/shippedPolicy.json'
const currentFile = fs.existsSync(SHIPPED) ? SHIPPED : v2 && !v3 && fs.existsSync(V1) ? V1 : undefined
const current = currentFile ? { genome: v2GenomeFromFile(JSON.parse(fs.readFileSync(currentFile, 'utf8'))) } : undefined
if (v2 && currentFile === V1) console.log('no shippedPolicyV2.json yet: comparing with the padded v1 policy')
  if (v2) {
    const hc = v2Hidden(genome)
    const hs = current ? v2Hidden(current.genome) : undefined
    console.log(`hidden units: candidate ${hc}, ${currentFile ?? 'no current policy'} ${hs ?? '-'}${hs !== undefined && hs !== hc ? '  (DIFFERENT hidden size: shippedPolicyV2.json will change H if written)' : ''}`)
  }
  const cur = current ? await score(current.genome) : undefined
  // paired comparison on identical HOLDOUT courses: mean difference of the normalised score with a bootstrap 95 % interval
  let paired: unknown
  if (cur) {
    const d = candNorms.map((v, i) => v - holdoutNorms[i]!)
    const mean = d.reduce((a, b) => a + b, 0) / d.length
    let seed = 12345
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
    const boots: number[] = []
    for (let b = 0; b < 4000; b++) {
      let sum = 0
      for (let i = 0; i < d.length; i++) sum += d[Math.floor(rnd() * d.length)]!
      boots.push(sum / d.length)
    }
    boots.sort((a, b) => a - b)
    paired = {
      meanDiff: mean,
      ci95: [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]],
      candidateWins: d.filter((x) => x > 1e-9).length,
      candidateLosses: d.filter((x) => x < -1e-9).length,
      ties: d.filter((x) => Math.abs(x) <= 1e-9).length,
    }
  }
  let better = !cur || cand.holdout.fitness > cur.holdout.fitness
  let gateReport: string | undefined
  if (v3 && cur) {
    const d = shipDecision(cand.holdout.perKind as ReturnType<typeof v3ReportByKind>, cur.holdout.perKind as ReturnType<typeof v3ReportByKind>)
    better = d.ship
    gateReport = formatShipDecision(d, cand.holdout.fitness, cur.holdout.fitness)
  }
  const force = argv.includes('--force')
  if (v3) {
    console.log('CANDIDATE TRAIN\n    ' + formatV3Report(cand.train.perKind as ReturnType<typeof v3ReportByKind>))
    console.log('CANDIDATE HOLDOUT\n    ' + formatV3Report(cand.holdout.perKind as ReturnType<typeof v3ReportByKind>))
    if (cur) console.log('SHIPPED HOLDOUT\n    ' + formatV3Report(cur.holdout.perKind as ReturnType<typeof v3ReportByKind>))
  } else if (v2) {
    console.log('CANDIDATE TRAIN  ' + formatChainReport(cand.train.perKind as ReturnType<typeof chainReportByKind>))
    console.log('CANDIDATE HOLDOUT ' + formatChainReport(cand.holdout.perKind as ReturnType<typeof chainReportByKind>))
  }
  if (gateReport) console.log(gateReport)
  console.log(JSON.stringify({ candidate: { gen: run.best.gen, ...cand }, shipped: cur, paired, courses: { train: trainKeys.length, holdout: holdoutKeys.length }, better }, null, 2))
  if (better || force) {
    const info = { source: `${runFile} generation ${run.best.gen} (best mean policy by TRAIN fitness)`, ...cand, evaluatedOn: { train: trainKeys.length, holdout: holdoutKeys.length }, genome }
    fs.writeFileSync(SHIPPED, JSON.stringify(info, null, 1) + '\n')
    console.log('WROTE', SHIPPED)
  } else console.log('kept the shipped policy (candidate does not pass the HOLDOUT gate)')
} finally {
  await pool.close()
}
