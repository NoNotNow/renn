/**
 * Held-out comparison of AV parameter sets on maze episodes (node, worker_threads pool, FULL runs: no stop-on-reach).
 *
 *   npx tsx tools/av-evolution/compare.ts --run test-results/av-evolution/run.json --top 3 --keys holdout --out test-results/av-evolution/compare
 *
 * Options:
 *   --run FILE        evolution export; its top --top candidates by TRAIN fitness are compared (omit for baselines only)
 *   --top N           number of evolved candidates (default 3)
 *   --params FILES    comma list of JSON files: a params object, or an array of {label, params}
 *   --keys SET        'holdout' (original 6, default) | 'holdout-extra' (18 fresh mazes) | 'holdout-all' (24) | 'train' | 'all' | comma list of episode keys
 *   --no-baselines    skip the two baselines
 *   --workers N       default cores - 1
 *   --out BASE        writes BASE.json and BASE.md (default test-results/av-evolution/compare)
 *   --example ID      example world holding the AV car
 * Baselines: "baseline-off" = default params, saver off (the evolution protocol); "baseline-shipped" = { saver: true } (the shipped car config).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { EpisodeMetrics } from '@/avEvolution/core/fitness'
import type { Params } from '@/avEvolution/core/genes'
import type { RunExport } from '@/avEvolution/core/store'
import { listMazeEpisodes } from '@/avEvolution/maze/episodes'
import { DEFAULT_SOURCE_WORLD_ID } from './loadSource'
import { EpisodePool } from './pool'

interface Variant {
  label: string
  params: Params
  note?: string
}

function parseArgs(argv: string[]) {
  const o: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      o[a.slice(2)] = next
      i++
    } else o[a.slice(2)] = true
  }
  return o
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const median = (a: number[]) => {
  if (!a.length) return NaN
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : String(x))
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : String(x))

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const workers = Math.max(1, Math.floor(Number(args.workers ?? Math.max(1, os.cpus().length - 1))))
  const outBase = path.resolve(String(args.out ?? 'test-results/av-evolution/compare'))
  const { train, holdout, holdoutExtra } = listMazeEpisodes()
  const ks = String(args.keys ?? 'holdout')
  const sets: Record<string, string[]> = {
    holdout: holdout.map((e) => e.key),
    'holdout-extra': holdoutExtra.map((e) => e.key),
    'holdout-all': [...holdout, ...holdoutExtra].map((e) => e.key),
    train: train.map((e) => e.key),
    all: [...train, ...holdout, ...holdoutExtra].map((e) => e.key),
  }
  const keys = sets[ks] ?? ks.split(',')

  const variants: Variant[] = []
  if (!args['no-baselines']) {
    variants.push({ label: 'baseline-off', params: {}, note: 'default params, saver off (evolution protocol)' })
    variants.push({ label: 'baseline-shipped', params: { saver: true }, note: 'shipped car config (saver: true)' })
  }
  if (args.run) {
    const data = JSON.parse(fs.readFileSync(path.resolve(String(args.run)), 'utf8')) as RunExport
    const top = Math.floor(Number(args.top ?? 3))
    // rank by full-TRAIN fitness: only candidates evaluated on every train key (falls back to all candidates for old runs)
    const nTrain = data.run.trainKeys.length
    const pickFrom = data.candidates.filter((c) => c.n >= nTrain && new Set(c.episodes.map((e) => e.key)).size >= nTrain)
    const sorted = (pickFrom.length >= top ? pickFrom : data.candidates.filter((c) => c.n > 0)).sort((a, b) => a.fitness - b.fitness).slice(0, top)
    sorted.forEach((c, i) =>
      variants.push({ label: `evolved#${i + 1}`, params: c.params, note: `${c.id} gen ${c.gen}, train fitness ${c.fitness.toFixed(3)} over n=${c.n} episodes (train mean exit ${c.meanExitT.toFixed(1)} s, reach ${(c.reachRate * 100).toFixed(0)}%)` }),
    )
  }
  if (args.params) {
    for (const f of String(args.params).split(',')) {
      const j = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')) as Params | { label: string; params: Params }[]
      if (Array.isArray(j)) j.forEach((v) => variants.push({ label: v.label, params: v.params }))
      else variants.push({ label: path.basename(f, '.json'), params: j })
    }
  }

  const pool = new EpisodePool({ workers, exampleId: String(args.example ?? DEFAULT_SOURCE_WORLD_ID), stopOnReach: false })
  const t0 = Date.now()
  const results: Record<string, EpisodeMetrics[]> = {}
  try {
    await Promise.all(
      variants.map(async (v) => {
        results[v.label] = await Promise.all(keys.map((k) => pool.episode(v.params, k)))
      }),
    )
  } finally {
    await pool.close()
  }

  const rows = variants.map((v) => {
    const m = results[v.label]!
    const t = m.map((x) => x.exitT)
    return {
      label: v.label,
      note: v.note,
      meanExitT: mean(t),
      medianExitT: median(t),
      maxExitT: Math.max(...t),
      reached: m.filter((x) => x.reached).length,
      contactEvents: m.reduce((s, x) => s + x.contactEvents, 0),
      contactFrames: m.reduce((s, x) => s + x.contactFrames, 0),
      flipped: m.filter((x) => x.flipped).length,
      minStaticGap: Math.min(...m.map((x) => x.minStaticGap)),
    }
  })
  const lines: string[] = []
  lines.push(`# Comparison on [${keys.join(', ')}] (full run to goal or ${results[variants[0]!.label]![0]!.timeoutSec} s timeout, no stop-on-reach)`, '')
  lines.push('## Summary', '', '| variant | mean exitT | median | max | reached | contactEvents | contactFrames | flipped | min static gap |', '|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) lines.push(`| ${r.label} | ${f1(r.meanExitT)} | ${f1(r.medianExitT)} | ${f1(r.maxExitT)} | ${r.reached}/${keys.length} | ${r.contactEvents} | ${r.contactFrames} | ${r.flipped} | ${f2(r.minStaticGap)} |`)
  lines.push('', '## Per episode (exitT s [R=reached, T=timeout] / contactEvents / contactFrames / minStaticGap)', '', `| variant | ${keys.join(' | ')} |`, `|---|${keys.map(() => '---').join('|')}|`)
  for (const v of variants) lines.push(`| ${v.label} | ${results[v.label]!.map((m) => `${f1(m.exitT)}${m.reached ? 'R' : 'T'} / ${m.contactEvents} / ${m.contactFrames} / ${f2(m.minStaticGap)}`).join(' | ')} |`)
  const bases = rows.filter((b) => b.label.startsWith('baseline'))
  if (bases.length) {
    lines.push('', '## Mean exitT vs baselines', '')
    for (const r of rows.filter((x) => !x.label.startsWith('baseline'))) {
      const parts = bases.map((b) => `${((1 - r.meanExitT / b.meanExitT) * 100).toFixed(1)}% faster than ${b.label}`)
      lines.push(`- ${r.label}: ${parts.join('; ')}; contacts ${r.contactEvents} events / ${r.contactFrames} frames`)
    }
  }
  lines.push('', '## Variants', '', ...variants.map((v) => `- ${v.label}: ${v.note ?? ''}`))
  const md = lines.join('\n')
  console.log(md)
  fs.mkdirSync(path.dirname(outBase), { recursive: true })
  fs.writeFileSync(`${outBase}.md`, md + '\n')
  fs.writeFileSync(`${outBase}.json`, JSON.stringify({ keys, rows, variants, results }, null, 1))
  console.log(`\nwrote ${outBase}.md/.json in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
