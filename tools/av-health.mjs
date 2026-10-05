#!/usr/bin/env node
// Aggregate AV health gate. Runs the AV lab over many seeds and prints per-seed rows + aggregate.
// Usage: node tools/av-health.mjs [--save <name>] [--compare <name>] [--no-run]
// Env: AVHEALTH_WORLD, AVHEALTH_FOCUS, AVHEALTH_SEEDS (count N or comma list), AVHEALTH_FRAMES, AVHEALTH_PARAMS (JSON -> AVLAB_PARAMS).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Regression thresholds (single place).
const THRESHOLDS = { catchesRise: 2, troubleFramesRisePct: 25, medianPathDropPct: 10 }

const env = process.env
const args = process.argv.slice(2)
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const world = env.AVHEALTH_WORLD ?? 'self_hunt_flexible'
const focus = env.AVHEALTH_FOCUS ?? 'entity_1779823253285_brtkx1p'
const nSeeds = env.AVHEALTH_SEEDS ?? '8'
const seeds = nSeeds.includes(',') ? nSeeds.split(',').map(Number) : Array.from({ length: Number(nSeeds) }, (_, i) => i + 1)
const frames = Number(env.AVHEALTH_FRAMES ?? 1800)
const out = 'test-results/av-health/run'

if (!args.includes('--no-run')) {
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  const t0 = Date.now()
  const r = spawnSync('npx', ['vitest', 'run', 'src/test/scenarios/av-lab.diagnostic.test.ts'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...env, AVLAB_WORLD: world, AVLAB_FOCUS: focus, AVLAB_SEEDS: seeds.join(','), AVLAB_FRAMES: String(frames), AVLAB_OUT: out, AVLAB_MAX_SCENES: '0', AVLAB_NAME: 'health', ...(env.AVHEALTH_PARAMS ? { AVLAB_PARAMS: env.AVHEALTH_PARAMS } : {}) },
  })
  if (r.status !== 0) { console.error('lab run failed'); process.exit(r.status ?? 1) }
  console.error(`lab wall time ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}

const rows = seeds.map((s) => JSON.parse(fs.readFileSync(path.join(out, `health-s${s}.summary.json`), 'utf8')))
const ep = (r, k) => r.events.filter((e) => e.kind === k).length
const fr = (r, k) => r.classFrames[k] ?? 0
const sum = (a) => a.reduce((x, y) => x + y, 0)
const median = (a) => { const b = [...a].sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2 }

const kinds = ['stall', 'shuttle', 'jitter']
console.log(`world ${world} focus ${focus} seeds ${seeds.length} x ${frames} frames  av ${rows[0].stackVersion}`)
console.log('seed  path_m  mean_v  catch | stall ep/fr  shuttle ep/fr  jitter ep/fr | maneuver_fr  minDist')
for (const r of rows) {
  console.log([
    String(r.seed).padStart(4), r.pathLength.toFixed(0).padStart(7), r.meanSpeed.toFixed(1).padStart(7), String(r.catches).padStart(6), '|',
    ...kinds.map((k) => `${ep(r, k)}/${fr(r, k)}`.padStart(12)), '|', String(r.maneuverFrames).padStart(11), r.minChaserDist.toFixed(1).padStart(8),
  ].join(' '))
}
const agg = {
  seeds: seeds.length, frames, world, focus, stackVersion: rows[0].stackVersion,
  catches: sum(rows.map((r) => r.catches)),
  stallFrames: sum(rows.map((r) => fr(r, 'stall'))), shuttleFrames: sum(rows.map((r) => fr(r, 'shuttle'))), jitterFrames: sum(rows.map((r) => fr(r, 'jitter'))),
  troubleFrames: sum(rows.map((r) => kinds.reduce((a, k) => a + fr(r, k), 0))),
  episodes: sum(rows.map((r) => r.events.length)),
  maneuverFrames: sum(rows.map((r) => r.maneuverFrames)),
  medianPath: median(rows.map((r) => r.pathLength)), meanPath: sum(rows.map((r) => r.pathLength)) / rows.length,
  meanSpeed: sum(rows.map((r) => r.meanSpeed)) / rows.length,
  minChaserDist: Math.min(...rows.map((r) => r.minChaserDist)),
}
const f1 = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)
for (const k of Object.keys(agg)) agg[k] = f1(agg[k])
console.log(`AGG catches ${agg.catches} | stall+shuttle+jitter frames ${agg.troubleFrames} (${agg.stallFrames}/${agg.shuttleFrames}/${agg.jitterFrames}) | episodes ${agg.episodes} | maneuver frames ${agg.maneuverFrames} | path median ${agg.medianPath} mean ${agg.meanPath} | mean speed ${agg.meanSpeed} | min chaser dist ${agg.minChaserDist}`)

const dir = 'test-results/av-health'
const save = arg('--save')
if (save) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${save}.json`), JSON.stringify(agg, null, 1)); console.log(`saved ${dir}/${save}.json`) }
const cmp = arg('--compare')
if (cmp) {
  const b = JSON.parse(fs.readFileSync(path.join(dir, `${cmp}.json`), 'utf8'))
  if (b.seeds !== agg.seeds || b.frames !== agg.frames) console.log(`WARNING: baseline used ${b.seeds} x ${b.frames}`)
  console.log(`DELTA vs ${cmp}:`)
  for (const k of ['catches', 'troubleFrames', 'episodes', 'maneuverFrames', 'medianPath', 'meanPath', 'meanSpeed', 'minChaserDist']) console.log(`  ${k.padEnd(15)} ${b[k]} -> ${agg[k]} (${agg[k] - b[k] >= 0 ? '+' : ''}${f1(agg[k] - b[k])})`)
  const reg = []
  if (agg.catches - b.catches > THRESHOLDS.catchesRise) reg.push(`catches +${agg.catches - b.catches} > ${THRESHOLDS.catchesRise}`)
  const tr = b.troubleFrames > 0 ? ((agg.troubleFrames - b.troubleFrames) / b.troubleFrames) * 100 : (agg.troubleFrames > 0 ? Infinity : 0)
  if (tr > THRESHOLDS.troubleFramesRisePct) reg.push(`stall+shuttle+jitter frames +${f1(tr)}% > ${THRESHOLDS.troubleFramesRisePct}%`)
  const pd = ((b.medianPath - agg.medianPath) / b.medianPath) * 100
  if (pd > THRESHOLDS.medianPathDropPct) reg.push(`median path -${f1(pd)}% > ${THRESHOLDS.medianPathDropPct}%`)
  console.log(reg.length ? `REGRESSION: ${reg.join('; ')}` : 'OK: no regression')
  if (reg.length) process.exitCode = 2
}
