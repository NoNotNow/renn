/**
 * export-maze-candidates: writes `public/policy-evolution/candidates.json` — the candidate models the Training
 * Mazes dialog can load besides the deployed one (the deployed best stays baked into the exported worlds):
 * the ISLAND CENTERS of the training run, the LATEST BEST and the SHIPPED policy. One flat candidate list
 * (id / label / genome / gen / detail tooltip); the dialog renders one chip per candidate.
 *
 * The auto-trial watcher refreshes this file every cycle while the training runs; it also deploys with the site
 * (public/ is served as-is). Genomes are stored in the v3 26-input layout (the shipped legacy 24-input genome is
 * zero-padded via ensureV3Inputs, bit-identical behavior), so the dialog can swap `params.w` of the drive stages
 * without any shape handling.
 *
 *   npx tsx tools/policy-evolution/export-maze-candidates.ts [runFile]   # default: latest-best.json's `source`
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ensureV3Inputs } from '@/policyEvolution/exampleWorld'

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..')

const latestBestPath = resolve(root, 'training-data/policy-evolution/latest-best.json')
const shippedPath = resolve(root, 'src/policyEvolution/shippedPolicyV3.json')
const outPath = resolve(root, 'public/policy-evolution/candidates.json')

interface RunIsland {
  es: { theta?: number[] }
  age?: number
  origin?: string
  stagn?: number
  lastCenter?: number
  bestScore?: number
}

interface RunFile {
  source?: string
  state?: { gen?: number; islands?: RunIsland[] }
  best?: { gen?: number; island?: number; genome?: number[] }
}

const num = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '?')

const runFile = resolve(root, process.argv[2] ?? (() => {
  const lb = JSON.parse(readFileSync(latestBestPath, 'utf8')) as { source?: string }
  if (!lb.source) throw new Error('latest-best.json has no source — pass the run file as an argument')
  return lb.source
})())

const run = JSON.parse(readFileSync(runFile, 'utf8')) as RunFile
const islands = run.state?.islands ?? []
if (islands.length === 0) throw new Error(`${runFile} has no islands`)

const candidates = islands.map((island, k) => {
  const genome = island.es.theta
  if (!genome || genome.length === 0) throw new Error(`island ${k} has no es.theta`)
  return {
    id: `island-${k}`,
    label: `I${k + 1}`,
    gen: run.state?.gen ?? null,
    genome,
    detail: `island ${k + 1} center · age ${island.age ?? '?'} · origin ${island.origin ?? '?'} · stagn ${island.stagn ?? '?'} · lastCenter ${island.lastCenter ?? '?'} · bestScore ${num(island.bestScore)}`,
  }
})

const best = run.best?.genome
if (best && best.length > 0) {
  candidates.push({
    id: 'best',
    label: 'Best',
    gen: run.best?.gen ?? null,
    genome: best,
    detail: `latest best by train fitness${run.best?.island != null ? ` (island ${run.best.island})` : ''}`,
  })
}

const shipped = JSON.parse(readFileSync(shippedPath, 'utf8')) as { genome?: number[]; source?: string }
if (shipped.genome && shipped.genome.length > 0) {
  const genMatch = /generation (\d+)/.exec(shipped.source ?? '')
  candidates.push({
    id: 'shipped',
    label: 'Shipped',
    gen: genMatch ? Number(genMatch[1]) : null,
    genome: ensureV3Inputs(shipped.genome),
    detail: 'shippedPolicyV3.json (the shipped policy)',
  })
}

for (const c of candidates) ensureV3Inputs(c.genome)

const file = {
  schema: 'renn.policy-evolution.candidates/1',
  source: runFile.slice(root.length + 1),
  policy: 'v3',
  gen: run.state?.gen ?? null,
  updatedAt: new Date().toISOString(),
  candidates,
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(file))
console.log(
  `candidates -> ${outPath.slice(root.length + 1)} (gen ${file.gen}: ${candidates.map((c) => `${c.label} ${c.genome.length}w`).join(', ')})`,
)
