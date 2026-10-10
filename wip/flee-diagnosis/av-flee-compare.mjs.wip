#!/usr/bin/env node
// Paired before/after table for the flee diagnostic (src/test/scenarios/av-flee.diagnostic.test.ts, AV_FLEE_DIAG=1).
// Usage: node tools/av-flee-compare.mjs <baseName> [<variantName> ...] [--dir test-results/avflee]
// Reads <dir>/<name>-s<seed>-st<start>.json (written per run by the diagnostic). Pairs runs by (seed, start); prints pooled (frame-weighted) values per name and,
// for every variant, the per-run paired difference (variant - base) with a bootstrap 95 % interval and wins / losses. Same seeds x starts x frames only.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const di = args.indexOf('--dir')
const dir = di >= 0 ? args[di + 1] : 'test-results/avflee'
const names = args.filter((a, i) => !a.startsWith('--') && (di < 0 || (i !== di && i !== di + 1)))
if (names.length < 1) {
  console.error('usage: node tools/av-flee-compare.mjs <base> [<variant> ...] [--dir D]')
  process.exit(1)
}

function load(name) {
  const rows = new Map()
  for (const f of fs.readdirSync(dir)) {
    const m = new RegExp(`^${name}-s(\\d+)-st(\\d+)\\.json$`).exec(f)
    if (m) rows.set(`${m[1]}/${m[2]}`, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  }
  return rows
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const near = (r, k) => r.near?.[k]
// metric: [label, extractor(run) -> number | null, unit/format, lowerIsBetter]
const METRICS = [
  ['mean speed m/s', (r) => num(r.meanSpeed), 1, false],
  ['catches', (r) => num(r.catches), 2, true],
  ['speed with >=1 chaser < 30 m', (r) => {
    const a = near(r, '1-2'), b = near(r, '>=3')
    const fa = (a?.timeShare ?? 0), fb = (b?.timeShare ?? 0)
    return fa + fb > 0.01 ? ((num(a?.meanV) ?? 0) * fa + (num(b?.meanV) ?? 0) * fb) / (fa + fb) : null
  }, 1, false],
  ['time with a chaser < 30 m %', (r) => 100 * ((near(r, '1-2')?.timeShare ?? 0) + (near(r, '>=3')?.timeShare ?? 0)), 1, true],
  ['time in manoeuvre %', (r) => 100 * (num(r.maneuverTimeShare) ?? 0), 1, true],
  ['time in slow episodes (|v|<5) %', (r) => 100 * (num(r.slowTimeShare) ?? 0), 1, true],
  ['slow episode duration median s', (r) => num(r.slowDurMedian), 1, true],
  ['manoeuvre cluster duration max s', (r) => num(r.clusterDurMax), 1, true],
  ['reverse speed mean m/s', (r) => num(r.revSpeedMean), 1, false],
  ['goal changes / min', (r) => num(r.goalChangesPerMin), 1, true],
  ['flee goal age at switch median s', (r) => num(r.fleeSwitchAgeMedian), 1, false],
  ['flee time with chaser > 60 m %', (r) => (num(r.fleeFar60Share) === null ? null : 100 * r.fleeFar60Share), 0, true],
  ['bad flee goals % (labyrinth/dead end/wall/detour)', (r) => (num(r.badGoalShare) === null ? null : 100 * r.badGoalShare), 0, true],
  ['over-braking events / min', (r) => num(r.overBrakeEventsPerMin), 1, true],
]

function pooled(rows, f) {
  const v = [...rows.values()].map((r) => f(r)).filter((x) => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
function boot(d, n = 2000) {
  if (!d.length) return [NaN, NaN]
  let s = 12345
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  const means = []
  for (let i = 0; i < n; i++) {
    let t = 0
    for (let j = 0; j < d.length; j++) t += d[Math.floor(rnd() * d.length)]
    means.push(t / d.length)
  }
  means.sort((a, b) => a - b)
  return [means[Math.floor(0.025 * n)], means[Math.floor(0.975 * n)]]
}

const base = load(names[0])
console.log(`base "${names[0]}": ${base.size} runs`)
for (const v of names.slice(1)) {
  const var_ = load(v)
  console.log(`\nvariant "${v}": ${var_.size} runs; paired with base on (seed, start)`)
  console.log('metric'.padEnd(52), 'base'.padStart(8), 'variant'.padStart(8), 'diff'.padStart(8), '  95% CI (paired bootstrap)   win/loss/tie')
  for (const [label, f, dec, lower] of METRICS) {
    const d = []
    let w = 0, l = 0, t = 0
    for (const [k, rb] of base) {
      const rv = var_.get(k)
      if (!rv) continue
      const a = f(rb), b = f(rv)
      if (a === null || b === null) continue
      d.push(b - a)
      const better = lower ? b < a - 1e-9 : b > a + 1e-9
      const worse = lower ? b > a + 1e-9 : b < a - 1e-9
      if (better) w++
      else if (worse) l++
      else t++
    }
    const mb = pooled(base, f), mv = pooled(var_, f)
    const [lo, hi] = boot(d)
    const md = d.length ? d.reduce((a, b) => a + b, 0) / d.length : NaN
    console.log(label.padEnd(52), (mb === null ? '-' : mb.toFixed(dec)).padStart(8), (mv === null ? '-' : mv.toFixed(dec)).padStart(8), (Number.isFinite(md) ? md.toFixed(dec) : '-').padStart(8), `  [${lo.toFixed(dec)}, ${hi.toFixed(dec)}]`.padEnd(22), `${w}/${l}/${t}`)
  }
}
if (names.length === 1) {
  console.log('metric'.padEnd(52), 'mean over runs'.padStart(14))
  for (const [label, f, dec] of METRICS) {
    const m = pooled(base, f)
    console.log(label.padEnd(52), (m === null ? '-' : m.toFixed(dec)).padStart(14))
  }
}
