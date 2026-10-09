/**
 * Compare groups of runs (e.g. one config with several seeds against another): every run's best policy is evaluated on the SAME
 * HOLDOUT courses (random start poses, sensor noise as in training), then per run and per group the fitness and the finish rate per
 * course kind are printed. Use it for screening experiments; single runs vary a lot, so look at the group spread, not one number.
 *
 *   npx tsx tools/policy-evolution/compare.ts --group base a1.json a2.json a3.json --group islands b1.json b2.json [--holdout-per-kind 20] [--workers 4]
 *
 * A group may also be `shipped` (no files): the currently shipped policy.
 */
import fs from 'node:fs'
import os from 'node:os'
import { COURSE_KINDS, holdoutCourseKeys, parseCourseKey } from '@/policyEvolution/courses'
import type { PolicyEpisodeMetrics } from '@/policyEvolution/episode'
import { aggregateFitness } from '@/policyEvolution/es'
import { shippedGenome } from '@/policyEvolution/exampleWorld'
import { PolicyPool } from './pool'

const argv = process.argv.slice(2)
const opt = (name: string, d: number) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? Number(argv[i + 1]) : d
}
const groups: Array<{ name: string; runs: Array<{ label: string; genome: number[] }> }> = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--group') {
    const name = argv[++i]!
    const runs: Array<{ label: string; genome: number[] }> = []
    while (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
      const file = argv[++i]!
      const run = JSON.parse(fs.readFileSync(file, 'utf8')) as { best?: { gen: number; genome: number[] } }
      if (!run.best) throw new Error(`${file} has no best policy yet`)
      runs.push({ label: `${file.split('/').pop()} (gen ${run.best.gen})`, genome: run.best.genome })
    }
    if (name === 'shipped' && runs.length === 0) runs.push({ label: 'shippedPolicy.json', genome: shippedGenome() })
    if (runs.length === 0) throw new Error(`group ${name} has no runs`)
    groups.push({ name, runs })
  } else if (argv[i]!.startsWith('--')) i++
}
if (groups.length === 0) throw new Error('usage: compare.ts --group NAME run.json [run.json ...] [--group ...] [--holdout-per-kind N] [--workers N]')

const keys = holdoutCourseKeys(opt('holdout-per-kind', 20))
const pool = new PolicyPool(opt('workers', Math.max(1, os.cpus().length - 1)))
const evaluate = pool.evaluator()
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
const sd = (a: number[]) => (a.length < 2 ? 0 : Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)))
const finishByKind = (m: PolicyEpisodeMetrics[]) =>
  COURSE_KINDS.map((k) => {
    const of = m.filter((x) => parseCourseKey(x.key).kind === k)
    return `${k} ${of.filter((x) => x.outcome === 'finish').length}/${of.length}`
  }).join(', ')

try {
  console.log(`${keys.length} HOLDOUT courses`)
  for (const g of groups) {
    const fits: number[] = []
    const finishes: number[] = []
    for (const r of g.runs) {
      const m = await evaluate(r.genome, keys)
      const f = aggregateFitness(m)
      fits.push(f)
      finishes.push(m.filter((x) => x.outcome === 'finish').length / m.length)
      console.log(`  ${g.name.padEnd(12)} ${r.label.padEnd(36)} fitness ${f.toFixed(3)}  finished ${finishByKind(m)}`)
    }
    console.log(`${g.name.padEnd(14)} n=${g.runs.length}  fitness mean ${mean(fits).toFixed(3)} sd ${sd(fits).toFixed(3)} [${Math.min(...fits).toFixed(3)} .. ${Math.max(...fits).toFixed(3)}]  finish rate mean ${(100 * mean(finishes)).toFixed(0)} %`)
  }
} finally {
  await pool.close()
}
