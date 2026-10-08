/**
 * Compare named profiles on the TRAIN and HELD-OUT start sets (harness episodes), optionally with the full constraint proxy.
 *
 *   npx tsx tools/hunt-profile-evo/compare.ts --profiles base,P1,LMnoC,S8,best:test-results/hunt-profile-evo/run1 [--sets train,heldout] [--proxy]
 *
 * --profiles   comma list of base | seed name (tools/hunt-profile-evo/seeds) | file.json | best:<outDir>[:rank] ; label=ref renames (e.g. mine=best:dir:1)
 * --sets       train,heldout (default both)    --scenarios solo,flee,flee-real    --mazes A,B,..    --starts N (default 3)
 * --seconds N  sim cap per episode (default 120)    --workers N (max 5)    --world ID    --proxy  also run the 22-case proxy (pass/fail per profile)
 * --cache DIR  task cache (default test-results/hunt-profile-evo/compare-cache); identical (profile, start) pairs are never re-simulated
 * --out FILE  also write the table as markdown
 * Table per set and scenario: reached, mean exit s (reached), mean w/ timeout, hits, reversals (mean/episode), reverseS (mean/episode), contact eps/frames.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { EpResult, Kind } from '../hunt-maze/episode'
import type { CaseResult } from './probe/proxy'
import { DEFAULT_KINDS, parseArgs, resolveProfile, specSet, toProfile } from './common'
import { constraintScore, DEFAULT_WEIGHTS, harnessFitness, summarise } from './fitness'
import { profileHash, profileParams, proxyExtra } from './genome'
import { TaskPool } from './pool'
import { epTaskId, proxyCases, proxyId, pxTaskId } from './tasks'

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-')

async function main() {
  const raw = process.argv.slice(2)
  if (raw.includes('--help') || raw.includes('-h')) {
    const src = fs.readFileSync(new URL(import.meta.url), 'utf8')
    console.log(src.slice(src.indexOf('/**') + 4, src.indexOf('*/')).replace(/^ \* ?/gm, ''))
    return
  }
  const A = parseArgs(raw)
  const one = (k: string, d: string) => A[k]?.[0] ?? d
  const profiles = one('profiles', 'base,S8,P1,LMnoC').split(',').filter(Boolean).map((s) => { const r = resolveProfile(s); return { name: r.name, p: toProfile(r.profile) } })
  const sets = one('sets', 'train,heldout').split(',')
  const kinds = one('scenarios', DEFAULT_KINDS.join(',')).split(',') as Kind[]
  const seconds = Number(one('seconds', '120'))
  const world = A.world?.[0]
  const common = { world, kinds, mazes: A.mazes ? one('mazes', '').split(',') : undefined, starts: Number(one('starts', '3')) }
  const cacheDir = one('cache', 'test-results/hunt-profile-evo/compare-cache')
  fs.mkdirSync(cacheDir, { recursive: true })
  const pool = new TaskPool(Number(one('workers', '5')), path.join(cacheDir, 'tasks.jsonl'))
  const lines: string[] = []
  const out = (s: string) => { lines.push(s); console.log(s) }
  try {
    const specSets = Object.fromEntries(sets.map((s) => [s, specSet({ ...common, heldOut: s === 'heldout' })]))
    const jobs = profiles.flatMap((pr) => sets.flatMap((s) => specSets[s]!.map((spec) => ({ pr, s, spec }))))
    console.error(`# ${jobs.length} episodes (cached ones are free)`)
    const res = await Promise.all(jobs.map((j) => pool.run<EpResult>({ t: 'ep', id: epTaskId(profileHash(j.pr.p), j.spec.id, seconds, world), spec: j.spec, params: profileParams(j.pr.p), seconds, world })))
    out('| set | scenario | profile | n | reached | mean exit s | mean w/ timeout | hits | reversals/ep | reverseS/ep | contact eps/frames | fitness |')
    out('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const s of sets) {
      for (const k of kinds) {
        for (const pr of profiles) {
          const rs = jobs.map((j, i) => ({ j, r: res[i]! })).filter((x) => x.j.s === s && x.j.pr === pr && x.r.kind === k).map((x) => x.r)
          if (!rs.length) continue
          const m = summarise(rs)
          out(`| ${s} | ${k} | ${pr.name} | ${m.n} | ${m.reached}/${m.n} | ${f1(m.meanExit)} | ${f1(m.meanTimeout)} | ${m.hits} | ${f1(m.reversals)} | ${f1(m.reverseS)} | ${m.contactEps}/${m.contactFrames} | |`)
        }
      }
      for (const pr of profiles) {
        const all = jobs.map((j, i) => ({ j, r: res[i]! })).filter((x) => x.j.s === s && x.j.pr === pr).map((x) => x.r)
        out(`| ${s} | ALL | ${pr.name} | ${all.length} | ${all.filter((r) => r.reached).length}/${all.length} | | | ${all.reduce((a, r) => a + r.hits, 0)} | | | | ${harnessFitness(all, DEFAULT_WEIGHTS, Object.keys(pr.p.mazeProfile).length).fitness.toFixed(2)} |`)
      }
    }
    if (A.proxy) {
      const baseP = profiles.find((p) => profileHash(p.p) === 'base')?.p ?? { mazeProfile: {} }
      const run = (p: typeof baseP) => Promise.all(proxyCases().map(async (c) => ({ id: proxyId(c), r: await pool.run<CaseResult>({ t: 'px', id: pxTaskId(profileHash(p), c), name: c.name, budget: c.budget, extra: proxyExtra(p) }) })))
      const baseRes = Object.fromEntries((await run(baseP)).map((x) => [x.id, x.r]))
      out('\n| profile | proxy | failing cases | violation |\n|---|---|---|---|')
      for (const pr of profiles) {
        const cs = constraintScore(await run(pr.p), baseRes)
        out(`| ${pr.name} | ${cs.feasible ? 'PASS' : 'FAIL'} | ${cs.failing.join(', ') || '-'} | ${cs.violation.toFixed(2)} |`)
      }
    }
  } finally {
    await pool.close()
  }
  if (A.out) fs.writeFileSync(one('out', ''), lines.join('\n') + '\n')
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
