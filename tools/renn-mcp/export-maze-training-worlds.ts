#!/usr/bin/env npx tsx
/**
 * Write the five maze training worlds (the shipped v3 policy driving seeded 6x6 mazes on tapered guidance chains,
 * in-world scoring + chain rendering) to public/exampleWorlds/maze_train_<n>/ (File -> Example Worlds, Maze Training dialog).
 * Per world: world.json, meta.json (bestScore null until measured) and a top-down thumb.svg.
 * With --score: run each world headless (shipped v3 candidate, up to 90 s sim, stop within MAZE_GOAL_REACH_M of the goal),
 * write the measured bestScore into meta.json and print the summary table.
 * Source of truth: src/policyEvolution/mazeTraining.ts. Update the policy: tools/policy-evolution/ship.ts, then re-run.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '../../src/runtime/transformerWatchBridge'
import { shippedGenomeV3 } from '../../src/policyEvolution/exampleWorld'
import { POLICY_CAR_ID } from '../../src/policyEvolution/episode'
import {
  MAZE_GOAL_ID,
  MAZE_GOAL_REACH_M,
  MAZE_TRAINING_WORLDS,
  buildMazeTrainingWorld,
  mazeTrainingChain,
  mazeTrainingMeta,
  type MazeTrainingWorldSpec,
} from '../../src/policyEvolution/mazeTraining'
import { DEFAULT_DT, WorldSimulator } from '../../src/test/helpers/worldSimulator'
import type { RennWorld } from '../../src/types/world'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const withScore = process.argv.includes('--score')
const MAX_SIM_S = 90

function watchValues(entityId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const e of getTransformerWatchEntries().values()) if (e.entityId === entityId) out[e.label] = e.value
  return out
}

/** Same scoring rule as the in-world stage (monotone chain progress + speed bonus), as a cross-check of the watch value. */
function identicalScorer(chain: number[][], vRef: number, bonusRate: number) {
  const cum = [0]
  for (let q = 1; q < chain.length; q++) cum.push(cum[q - 1]! + Math.hypot(chain[q]![0] - chain[q - 1]![0], chain[q]![1] - chain[q - 1]![1]))
  let s = 0
  let bonus = 0
  let seg = 0
  return {
    step(px: number, pz: number, vx: number, vz: number, dt: number): number {
      let bestD = Infinity
      let bestS = s
      let bestSeg = seg
      for (let i = Math.max(0, seg - 2); i <= Math.min(chain.length - 2, seg + 3); i++) {
        const ax = chain[i]![0]
        const az = chain[i]![1]
        const dx = chain[i + 1]![0] - ax
        const dz = chain[i + 1]![1] - az
        const len2 = dx * dx + dz * dz || 1
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
        const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
        if (d < bestD) {
          bestD = d
          bestS = cum[i]! + t * Math.sqrt(len2)
          bestSeg = i
        }
      }
      seg = bestSeg
      if (bestS > s) s = bestS
      bonus += (Math.min(Math.hypot(vx, vz), vRef) / vRef) * dt * bonusRate
      return Math.floor(s + bonus)
    },
  }
}

async function scoreWorld(world: RennWorld, chain: number[][], vRef: number, bonusRate: number) {
  const goal = world.entities.find((e) => e.id === MAZE_GOAL_ID)
  const goalPos = goal?.position ?? [0, 0, 0]
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(world, 0)
  try {
    const scorer = identicalScorer(chain, vRef, bonusRate)
    let t = 0
    let reached = false
    let identical = 0
    const frames = Math.round(MAX_SIM_S / DEFAULT_DT)
    for (let f = 0; f < frames; f++) {
      sim.runFrames(1)
      t = (f + 1) * DEFAULT_DT
      const p = sim.getPosition(POLICY_CAR_ID)
      const v = sim.getVelocity(POLICY_CAR_ID)
      identical = scorer.step(p[0], p[2], v[0], v[2], DEFAULT_DT)
      if (Math.hypot(p[0] - goalPos[0]!, p[2] - goalPos[2]!) < MAZE_GOAL_REACH_M) {
        reached = true
        break
      }
    }
    const m = /(\d+)/.exec(String(watchValues(POLICY_CAR_ID)['maze.score'] ?? ''))
    const fromWatch = m ? Number(m[1]) : null
    const score = fromWatch ?? identical
    return { reached, seconds: t, score, fromWatch }
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

// --- thumb.svg: 220 x 220 top-down map -----------------------------------------------------------------------------------------------

const THUMB_SIZE = 220
const THUMB_MARGIN = 10

function thumbSvg(boxes: { at: number[]; size: number[] }[], route: number[][], chain: number[][]): string {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const grow = (x: number, z: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  for (const b of boxes) {
    grow(b.at[0]! - b.size[0]! / 2, b.at[1]! - b.size[1]! / 2)
    grow(b.at[0]! + b.size[0]! / 2, b.at[1]! + b.size[1]! / 2)
  }
  for (const p of [...route, ...chain]) grow(p[0]!, p[1]!)
  const spanX = Math.max(maxX - minX, 1)
  const spanZ = Math.max(maxZ - minZ, 1)
  const scale = Math.min((THUMB_SIZE - 2 * THUMB_MARGIN) / spanX, (THUMB_SIZE - 2 * THUMB_MARGIN) / spanZ)
  const ox = THUMB_MARGIN + ((THUMB_SIZE - 2 * THUMB_MARGIN) - spanX * scale) / 2
  const oz = THUMB_MARGIN + ((THUMB_SIZE - 2 * THUMB_MARGIN) - spanZ * scale) / 2
  const mx = (x: number) => Math.round((ox + (x - minX) * scale) * 10) / 10
  const mz = (z: number) => Math.round((oz + (z - minZ) * scale) * 10) / 10
  const poly = (pts: number[][]) => pts.map((p) => `${mx(p[0]!)},${mz(p[1]!)}`).join(' ')
  const lines: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_SIZE}" height="${THUMB_SIZE}" viewBox="0 0 ${THUMB_SIZE} ${THUMB_SIZE}">`]
  lines.push(`<rect x="0" y="0" width="${THUMB_SIZE}" height="${THUMB_SIZE}" fill="#10131a"/>`)
  for (const b of boxes) {
    const x = mx(b.at[0]! - b.size[0]! / 2)
    const y = mz(b.at[1]! - b.size[1]! / 2)
    lines.push(`<rect x="${x}" y="${y}" width="${Math.round(b.size[0]! * scale * 10) / 10}" height="${Math.round(b.size[1]! * scale * 10) / 10}" fill="#444a55"/>`)
  }
  lines.push(`<polyline points="${poly(route)}" fill="none" stroke="#2e6b4f" stroke-width="1" stroke-opacity="0.75"/>`)
  lines.push(`<polyline points="${poly(chain)}" fill="none" stroke="#ffaa44" stroke-width="1.5" stroke-opacity="0.9"/>`)
  lines.push(`<circle cx="${mx(route[0]![0]!)}" cy="${mz(route[0]![1]!)}" r="5" fill="#44ff77"/>`)
  lines.push(`<circle cx="${mx(route[route.length - 1]![0]!)}" cy="${mz(route[route.length - 1]![1]!)}" r="5" fill="#ff4444"/>`)
  lines.push('</svg>')
  return lines.join('\n') + '\n'
}

// --- main ----------------------------------------------------------------------------------------------------------------------------

const t0 = Date.now()

async function main(): Promise<void> {
  const genome = shippedGenomeV3()
  if (!genome) throw new Error('shippedPolicyV3.json not shipped yet (tools/policy-evolution/ship.ts)')
  const rows: string[] = []
  for (const spec of MAZE_TRAINING_WORLDS) {
  const { course, route, chain } = mazeTrainingChain(spec)
  const world = buildMazeTrainingWorld(spec, genome)
  const outDir = resolve(root, 'public/exampleWorlds', spec.id)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
  let bestScore: number | null = null
  let reached = false
  let seconds = 0
  if (withScore) {
    const scoreStage = (world.transformers as Record<string, { params?: { vRef?: number; bonusRate?: number } }>)['maze_score_0']
    const r = await scoreWorld(world, chain as number[][], scoreStage?.params?.vRef ?? 20, scoreStage?.params?.bonusRate ?? 5)
    bestScore = r.score
    reached = r.reached
    seconds = r.seconds
  }
  writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify(mazeTrainingMeta(spec, chain, bestScore), null, 2) + '\n')
  writeFileSync(resolve(outDir, 'thumb.svg'), thumbSvg(course.boxes as unknown as { at: number[]; size: number[] }[], route as number[][], chain as number[][]))
  rows.push(`${spec.id.padEnd(14)} reached ${reached ? 'yes' : 'no '}  ${seconds.toFixed(1).padStart(5)} s  score ${String(bestScore).padStart(4)}  chain ${chain.length} pts / ${mazeTrainingMeta(spec, chain, null).chain.lengthM.toFixed(0)} m`)
  }
  invalidateAgentDevExampleWorldIdCache()
  console.log(`maze training worlds written to public/exampleWorlds/ (--score ${withScore ? 'on' : 'off'})`)
  if (withScore) console.log(rows.join('\n'))
  console.log(`wall clock: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
