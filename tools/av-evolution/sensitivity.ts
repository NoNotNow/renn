/**
 * One-at-a-time gene sensitivity (node, worker pool): every gene is moved by +-DELTA (normalised range; bool: flipped; enum: each other
 * option) from the default params on a few TRAIN episodes; genes whose move changes the baseline-relative score are "active".
 *
 *   npx tsx tools/av-evolution/sensitivity.ts --top 28 --out test-results/av-evolution/sensitivity.json
 *
 * Options: --keys a,b,c (default: one start of 6 different TRAIN mazes) --delta 0.25 --top N --workers N --timeout-factor F
 * Output JSON: { active: string[], genes: [{key, effect, bestRatio, ...}] } ; feed `active` to run.ts --active.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_FITNESS_WEIGHTS, episodeScore } from '@/avEvolution/core/fitness'
import { defaultParams, denormalise, normalise, type Params } from '@/avEvolution/core/genes'
import { AV_GENOME_SPEC } from '@/avEvolution/genes'
import { listMazeEpisodes } from '@/avEvolution/maze/episodes'
import { computeBaseline, timeoutFor } from './baseline'
import { DEFAULT_SOURCE_WORLD_ID } from './loadSource'
import { EpisodePool } from './pool'

function parseArgs(argv: string[]) {
  const o: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 2) o[argv[i]!.slice(2)] = argv[i + 1]!
  return o
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const workers = Math.max(1, Math.floor(Number(args.workers ?? Math.max(1, os.cpus().length - 1))))
  const delta = Number(args.delta ?? 0.25)
  const top = Math.floor(Number(args.top ?? 28))
  const factor = Number(args['timeout-factor'] ?? 1.5)
  const { train } = listMazeEpisodes()
  const perMaze = new Map<number, string>()
  for (const e of train) if (!perMaze.has(e.mazeSeed)) perMaze.set(e.mazeSeed, e.key)
  const keys = args.keys ? args.keys.split(',') : [...perMaze.values()].slice(0, 6)
  const out = path.resolve(args.out ?? 'test-results/av-evolution/sensitivity.json')
  const pool = new EpisodePool({ workers, exampleId: DEFAULT_SOURCE_WORLD_ID, stopOnReach: true })
  const t0 = Date.now()
  try {
    const baseline = await computeBaseline(pool, keys, DEFAULT_FITNESS_WEIGHTS)
    const ref = (k: string) => Math.max(baseline[k]!.score, 20)
    const bl = keys.reduce((s, k) => s + baseline[k]!.score / ref(k), 0) / keys.length
    const spec = AV_GENOME_SPEC
    const base = normalise(spec, defaultParams(spec))
    const baseJson = JSON.stringify(denormalise(spec, base))
    const trials: { gene: string; label: string; params: Params }[] = []
    spec.genes.forEach((g, i) => {
      const variants: { label: string; v: number }[] = []
      if (g.type === 'bool') variants.push({ label: 'flip', v: base[i]! >= 0.5 ? 0 : 1 })
      else if (g.type === 'enum') g.options!.forEach((_, k) => variants.push({ label: `opt${k}`, v: k / (g.options!.length - 1) }))
      else variants.push({ label: 'lo', v: Math.max(0, base[i]! - delta) }, { label: 'hi', v: Math.min(1, base[i]! + delta) })
      for (const { label, v } of variants) {
        const vec = base.slice()
        vec[i] = v
        const params = denormalise(spec, vec)
        if (JSON.stringify(params) !== baseJson) trials.push({ gene: g.key, label, params })
      }
    })
    console.log(`${spec.genes.length} genes, ${trials.length} variants x ${keys.length} keys [${keys.join(',')}]`)
    const res = await Promise.all(
      trials.map(async (t) => {
        const ms = await Promise.all(keys.map((k) => pool.episode(t.params, k, timeoutFor(baseline, k, { factor, floor: 25 }))))
        const ratio = ms.reduce((s, m) => s + episodeScore(m, DEFAULT_FITNESS_WEIGHTS) / ref(m.key), 0) / ms.length
        return { ...t, ratio }
      }),
    )
    const byGene = new Map<string, { label: string; ratio: number }[]>()
    for (const r of res) byGene.set(r.gene, [...(byGene.get(r.gene) ?? []), { label: r.label, ratio: r.ratio }])
    const genes = spec.genes.map((g) => {
      const r = byGene.get(g.key) ?? []
      const dev = r.map((x) => Math.abs(x.ratio - bl))
      return { key: g.key, group: g.group, effect: dev.length ? dev.reduce((a, b) => a + b, 0) / dev.length : 0, bestRatio: r.length ? Math.min(...r.map((x) => x.ratio)) : null, variants: r }
    })
    genes.sort((a, b) => b.effect - a.effect)
    const active = genes.filter((g) => g.effect > 0).slice(0, top).map((g) => g.key)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify({ keys, delta, baselineRatio: bl, active, genes }, null, 1))
    console.log(`baseline ratio ${bl.toFixed(3)}; ${genes.filter((g) => g.effect > 0).length}/${genes.length} genes have any effect; top:`)
    for (const g of genes.slice(0, 45)) console.log(`  ${g.key.padEnd(22)} ${g.group.padEnd(10)} effect ${g.effect.toFixed(3)} best ${g.bestRatio?.toFixed(3)}`)
    console.log(`active (${active.length}): ${active.join(',')}\nwrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
