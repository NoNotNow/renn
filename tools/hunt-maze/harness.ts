/**
 * Headless labyrinth-escape harness on the REAL hunt world (default self_hunt_flexible; its AV car exactly as in world.json).
 *
 *   npx tsx tools/hunt-maze/harness.ts --set base={} --set c870-full=src/avEvolution/maze/mazeEscapeDefaultCar.json \
 *        --scenarios solo,flee,cim --mazes A,B,C,D,E,F,G --seconds 120 --workers 8 --out test-results/hunt-maze/base
 *
 * --set label[@av|@chasers|@both]=<params.json path | inline JSON>   (repeatable; merged OVER the car binding; default target av)
 * --scenarios solo | flee | flee-real | cim (comma list; default solo,flee,cim)
 * --mazes      comma list of maze ids (default all found); --starts N (use only the first N starts per maze)
 * --seconds    sim timeout per episode (default 120); --full keep running after exit/catch (default stop at exit)
 * --workers    default cores-1; --wall  wall-clock kill in seconds (default 1500; workers terminated, exit 124)
 * --out DIR    writes DIR/results.json (+ results.md)
 * Metrics: see tools/hunt-maze/episode.ts header. Each episode reloads the world from the prepared source and resets all entities.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { loadSourceWorld } from '../av-evolution/loadSource'
import type { ApplyTo, EpOpts, EpResult, EpSpec, Kind } from './episode'
import { buildSpecs } from './scenarios'

function args(argv: string[]) {
  const o: Record<string, string[]> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) throw new Error(`unexpected ${a}`)
    const nx = argv[i + 1]
    const v = nx !== undefined && !nx.startsWith('--') ? (i++, nx) : 'true'
    ;(o[a.slice(2)] ??= []).push(v)
  }
  return o
}
const A = args(process.argv.slice(2))
const one = (k: string, d: string) => A[k]?.[0] ?? d
const seconds = Number(one('seconds', '120'))
const wallKill = Number(one('wall', '1500'))
const kinds = one('scenarios', 'solo,flee,cim').split(',') as Kind[]
const mazes = A.mazes ? one('mazes', '').split(',') : undefined
const outDir = one('out', 'test-results/hunt-maze/run')

interface SetDef { label: string; applyTo: ApplyTo; params: Record<string, unknown> }
const sets: SetDef[] = (A.set ?? ['base={}']).map((s) => {
  const eq = s.indexOf('=')
  const [label, at] = s.slice(0, eq).split('@')
  const src = s.slice(eq + 1)
  const params = JSON.parse(src.trim().startsWith('{') ? src : fs.readFileSync(src, 'utf8')) as Record<string, unknown>
  return { label: label!, applyTo: (at ?? 'av') as ApplyTo, params }
})

const source = loadSourceWorld()
const built = buildSpecs(source, kinds, mazes)
const nStarts = A.starts ? Number(one('starts', '3')) : 3
const specs = built.specs.filter((s) => Number(s.id.slice(-1)) <= nStarts)
const jobs: { set: SetDef; spec: EpSpec }[] = []
for (const set of sets) for (const spec of specs) jobs.push({ set, spec })
console.log(`# ${jobs.length} episodes (${sets.length} sets x ${specs.length} specs), ${seconds}s sim cap, wall kill ${wallKill}s`)

const nW = Math.max(1, Math.min(jobs.length, Number(one('workers', String(Math.max(1, os.cpus().length - 1))))))
const url = new URL('./worker-boot.mjs', import.meta.url)
const workers: Worker[] = []
const kill = setTimeout(() => {
  console.error(`WALL-CLOCK KILL after ${wallKill}s`)
  void Promise.all(workers.map((w) => w.terminate())).finally(() => process.exit(124))
}, wallKill * 1000)

const results: { label: string; applyTo: ApplyTo; res: EpResult }[] = []
let next = 0
let done = 0
await new Promise<void>((resolve, reject) => {
  const feed = (w: Worker) => {
    const j = jobs[next]
    if (!j) { if (done === jobs.length) resolve(); return }
    const idx = next++
    ;(w as Worker & { cur?: number }).cur = idx
    const opts: EpOpts = { params: j.set.params, applyTo: j.set.applyTo, seconds, fullRun: A.full !== undefined }
    w.postMessage({ id: idx, spec: j.spec, opts })
  }
  for (let i = 0; i < nW; i++) {
    const w = new Worker(url, { workerData: {} })
    workers.push(w)
    w.on('error', reject)
    w.on('exit', (code) => { if (done < jobs.length) reject(new Error(`worker exited early (code ${code}) on job ${(w as Worker & { cur?: number }).cur}`)) })
    w.on('message', (m: { ready?: boolean; id?: number; result?: EpResult; error?: string }) => {
      if (m.ready) return feed(w)
      if (m.error) return reject(new Error(m.error))
      const j = jobs[m.id!]!
      results.push({ label: j.set.label, applyTo: j.set.applyTo, res: m.result! })
      const r = m.result!
      console.log(`${j.set.label.padEnd(10)} ${r.id.padEnd(10)} ${r.reached ? 'OUT ' : 'FAIL'} t=${r.exitT.toFixed(1).padStart(5)} contacts ${r.contactEvents}/${r.contactFrames}f rev ${r.reversals} revS ${r.reverseS.toFixed(1)} hits ${r.hits} minCh ${r.minChaserDist.toFixed(0)} wall ${(r.wallMs / 1000).toFixed(0)}s`)
      done++
      feed(w)
    })
  }
})
clearTimeout(kill)
await Promise.all(workers.map((w) => w.terminate()))

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN }
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-')
const lines: string[] = [`# hunt-maze results (${seconds}s cap)`, '', '| set | scenario | n | reached | mean exit s (reached) | median | mean w/ timeout | contact eps (frames) | contact-free | reversals | reverseS | hits | wall s/ep |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|']
const byKey = (label: string, pred: (r: EpResult) => boolean) => results.filter((x) => x.label === label && pred(x.res)).map((x) => x.res)
const row = (label: string, name: string, rs: EpResult[]) => {
  if (!rs.length) return
  const ok = rs.filter((r) => r.reached)
  const sum = (f: (r: EpResult) => number) => rs.reduce((s, r) => s + f(r), 0)
  lines.push(`| ${label} | ${name} | ${rs.length} | ${ok.length}/${rs.length} | ${f1(mean(ok.map((r) => r.exitT)))} | ${f1(median(ok.map((r) => r.exitT)))} | ${f1(mean(rs.map((r) => r.exitT)))} | ${sum((r) => r.contactEvents)} (${sum((r) => r.contactFrames)}) | ${rs.filter((r) => r.contactEvents === 0).length}/${rs.length} | ${f1(mean(rs.map((r) => r.reversals)))} | ${f1(mean(rs.map((r) => r.reverseS)))} | ${sum((r) => r.hits)} | ${f1(mean(rs.map((r) => r.wallMs / 1000)))} |`)
}
for (const set of sets) {
  for (const k of kinds) {
    row(set.label, k, byKey(set.label, (r) => r.kind === k))
    for (const m of [...new Set(specs.map((s) => s.maze))]) row(set.label, `${k}/${m}`, byKey(set.label, (r) => r.kind === k && r.maze === m))
  }
}
fs.mkdirSync(outDir, { recursive: true })
results.sort((a, b) => (a.label + a.res.id < b.label + b.res.id ? -1 : 1))
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ seconds, sets, specs, infos: built.infos, results }, null, 1))
fs.writeFileSync(path.join(outDir, 'results.md'), lines.join('\n') + '\n')
console.log('\n' + lines.join('\n'))
process.exit(0)
