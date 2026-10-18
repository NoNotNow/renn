#!/usr/bin/env npx tsx
/**
 * Write the widen-freeze candidate example worlds to public/exampleWorlds/wf_<kind>_<n>/ — one world per kind x
 * holdout setup of the eval band (holdoutV3Episodes(3, kinds)), every chain of the setup in its own copy with one
 * car each. The BAKED candidate is the manifest entry with `bakeWorlds: true` (public/policy-evolution/
 * wf-candidates.json — currently the R40 recovery ship, H=40); the OTHER candidates (warm baseline, later stretches) drive
 * the SAME worlds through the training dialogs' candidate chips (export-maze-candidates.ts). The worlds are
 * reachable through the Widen-freeze Worlds dialog only — the generic Example Worlds menu excludes wf_* ids.
 *
 * Per world: world.json, meta.json (identity + bestScore of headless per-chain runs of the baked candidate,
 * noise 0 = exactly what the user watches) and route_<i>.svg tiles (one chain per tile, shared pixel size) +
 * thumb.svg (all chains side by side, like the world layout).
 *
 * A manifest entry whose genome file does not exist yet (a stretch still training) is skipped — re-running this
 * script after the training wrote its candidate file is all it takes (chips: export-maze-candidates.ts).
 *
 *   npx tsx tools/renn-mcp/export-wf-candidate-example-worlds.ts
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chainEpisodeKey } from '../../src/policyEvolution/chains'
import { warmCruxGate } from '../../src/policyEvolution/cruxChains'
import { runPolicyEpisode } from '../../src/policyEvolution/episode'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import {
  buildSetupCourse,
} from '../../src/policyEvolution/courses'
import { chainsForSetup } from '../../src/policyEvolution/chains'
import {
  bakedWfCandidate,
  buildWfCandidateWorld,
  wfCandidateWorldSpecs,
  wfTrainingMeta,
  wfWorldSpacing,
} from '../../src/policyEvolution/wfCandidateWorlds'
import { isWfCandidateWorldId, isLegacyWfCandidateWorldId } from '../../src/policyEvolution/wfCandidates'
import { thumbSvg } from './trainingThumbSvg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Chain color pairs of the tiles / thumb (stroke color, start-circle color), like the maze training worlds. */
const WF_CHAIN_COLORS: Array<[string, string]> = [
  ['#ff8c42', '#ffd24a'],
  ['#42a5ff', '#7cf2ff'],
  ['#ff4a6e', '#ffb0c2'],
  ['#7dff5c', '#c9ffb0'],
]

async function main(): Promise<void> {
  // the crux chain enumeration runs the pure-pursuit acceptance gate: the physics engine must be warm first
  await warmCruxGate()
  const baked = bakedWfCandidate()
  const specs = wfCandidateWorldSpecs()
  const t0 = Date.now()
  const rows: string[] = []

  for (const spec of specs) {
    const world = buildWfCandidateWorld(spec)
    const outDir = resolve(root, 'public/exampleWorlds', spec.id)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')

    // headless per-chain score of the baked candidate (noise 0 = the world as shipped): chain progress in m
    const chains = chainsForSetup(spec.setupKey)
    const scores: Array<number | null> = []
    for (let i = 0; i < chains.length; i++) {
      const m = await runPolicyEpisode(spec.candidate.genome, chainEpisodeKey(spec.setupKey, i, true), { noise: 0 })
      scores.push(Math.round(m.progress))
      rows.push(`${spec.id.padEnd(18)} chain ${i}  ${m.outcome.padEnd(9)} ${String(Math.round(m.progress)).padStart(4)} of ${Math.round(m.length ?? 0)} m in ${m.timeS.toFixed(1)} s`)
    }

    // tiles: one chain per tile, every tile svg shares one pixel size (the dialog overlays the live vector on pts)
    const course = buildSetupCourse(spec.setupKey)
    const tileRoutes: Array<{ pts: Array<[number, number]>; score: number | null }> = []
    let tileW = 0
    let tileH = 0
    chains.forEach((chain, i) => {
      const [color, startColor] = WF_CHAIN_COLORS[i % WF_CHAIN_COLORS.length]!
      const tile = thumbSvg(course.boxes, [{ ox: 0, chain: chain.points, color, startColor }])
      writeFileSync(resolve(outDir, `route_${i}.svg`), tile.svg)
      tileW = tile.w
      tileH = tile.h
      tileRoutes.push({ pts: tile.frames[0]!.pts, score: scores[i] })
    })
    writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ ...wfTrainingMeta(spec, scores), tileSvg: { w: tileW, h: tileH, routes: tileRoutes } }, null, 2) + '\n')
    writeFileSync(
      resolve(outDir, 'thumb.svg'),
      thumbSvg(
        course.boxes,
        chains.map((chain, i) => {
          const [color, startColor] = WF_CHAIN_COLORS[i % WF_CHAIN_COLORS.length]!
          return { ox: i * wfWorldSpacing(spec), chain: chain.points, color, startColor }
        }),
      ).svg,
    )
  }

  // clean up retired wf worlds (this naming scheme + the first round's per-candidate ids)
  const expected = new Set(specs.map((s) => s.id))
  const removed: string[] = []
  for (const id of readdirSync(resolve(root, 'public/exampleWorlds'))) {
    if ((isWfCandidateWorldId(id) || isLegacyWfCandidateWorldId(id)) && !expected.has(id)) {
      rmSync(resolve(root, 'public/exampleWorlds', id), { recursive: true })
      removed.push(id)
    }
  }

  invalidateAgentDevExampleWorldIdCache()
  console.log(`wf candidate worlds written to public/exampleWorlds/ (baked: ${baked.label}, gen ${baked.gen ?? '?'})`)
  console.log(rows.join('\n'))
  if (removed.length > 0) console.log(`removed retired: ${removed.join(', ')}`)
  console.log(`wall clock: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
