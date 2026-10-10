#!/usr/bin/env npx tsx
/**
 * Write the five maze training worlds (the shipped v3 policy driving seeded 6x6 mazes, one maze copy per training
 * route — several routes through the maze, some of them in reverse direction — on tapered guidance chains, in-world
 * scoring + chain rendering) to public/exampleWorlds/maze_train_<n>/ (File -> Example Worlds, Maze Training dialog).
 * Per world: world.json, meta.json (bestScore null until measured) and a top-down thumb.svg (one maze frame per route
 * copy side by side, like the world layout; forward chains orange, reversed chains blue).
 * With --score: run each world headless (shipped v3 candidate, up to 120 s sim, all cars drive simultaneously, stop
 * once EVERY car is within MAZE_GOAL_REACH_M of its goal), write the measured bestScore (max over all route cars)
 * into meta.json and print the per-car table.
 * Source of truth: src/policyEvolution/mazeTraining.ts. Update the policy: tools/policy-evolution/ship.ts, then re-run.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '../../src/runtime/transformerWatchBridge'
import { shippedGenomeV3 } from '../../src/policyEvolution/exampleWorld'
import {
  MAZE_GOAL_PREFIX,
  MAZE_GOAL_REACH_M,
  MAZE_TRAINING_WORLDS,
  MAZE_TRAIN_CHAIN_COLORS,
  MAZE_TRAIN_CHAIN_COLORS_REVERSED,
  MAZE_TRAIN_ROUTES,
  buildMazeTrainingWorld,
  mazeCarId,
  mazeGoalId,
  mazeScoreStageId,
  mazeTrainingMeta,
  mazeTrainingRoutes,
  type MazeTrainingWorldSpec,
} from '../../src/policyEvolution/mazeTraining'
import type { CourseBox } from '../../src/policyEvolution/courses'
import type { V2 } from '../../src/avEvolution/eval/geometry'
import { DEFAULT_DT, WorldSimulator } from '../../src/test/helpers/worldSimulator'
import type { RennWorld } from '../../src/types/world'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const withScore = process.argv.includes('--score')
const MAX_SIM_S = 120

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

/** Headless run of one world: every car drives simultaneously; per car reached/seconds/score, bestScore = max over cars. */
async function scoreWorld(world: RennWorld, chains: number[][][], vRef: number, bonusRate: number) {
  const K = chains.length
  const goalPos = (world.entities as { id: string; position: number[] }[]).filter((e) => e.id.startsWith(MAZE_GOAL_PREFIX)).map((e) => e.position)
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(world, 0)
  try {
    const scorers = chains.map((ch) => identicalScorer(ch, vRef, bonusRate))
    const reachedAt: Array<number | null> = new Array(K).fill(null)
    const identical = new Array<number>(K).fill(0)
    let t = 0
    const frames = Math.round(MAX_SIM_S / DEFAULT_DT)
    for (let f = 0; f < frames; f++) {
      sim.runFrames(1)
      t = (f + 1) * DEFAULT_DT
      let allReached = true
      for (let i = 0; i < K; i++) {
        const p = sim.getPosition(mazeCarId(i))
        const v = sim.getVelocity(mazeCarId(i))
        identical[i] = scorers[i]!.step(p[0], p[2], v[0], v[2], DEFAULT_DT)
        if (reachedAt[i] === null && Math.hypot(p[0] - goalPos[i]![0]!, p[2] - goalPos[i]![2]!) < MAZE_GOAL_REACH_M) reachedAt[i] = t
        if (reachedAt[i] === null) allReached = false
      }
      if (allReached) break
    }
    return reachedAt.map((reached, i) => {
      const m = /(\d+)/.exec(String(watchValues(mazeCarId(i))['maze.score'] ?? ''))
      return { reached: reached !== null, seconds: reached ?? t, score: m ? Number(m[1]) : identical[i], fromWatch: Boolean(m) }
    })
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

// --- thumb.svg: one maze frame per route copy side by side (like the world layout) ---------------------------------------------------

const THUMB_H = 220
const THUMB_MARGIN = 10

function thumbSvg(boxes: CourseBox[], frames: Array<{ ox: number; chain: V2[]; color: string; startColor: string }>): string {
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
    grow(b.at[0] - b.size[0] / 2, b.at[1] - b.size[1] / 2)
    grow(b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] / 2)
  }
  for (const f of frames) for (const p of f.chain) grow(p[0] + f.ox, p[1])
  const spanX = Math.max(maxX - minX, 1)
  const spanZ = Math.max(maxZ - minZ, 1)
  const scale = (THUMB_H - 2 * THUMB_MARGIN) / spanZ
  const width = Math.ceil(spanX * scale + 2 * THUMB_MARGIN)
  const ox = THUMB_MARGIN + (width - 2 * THUMB_MARGIN - spanX * scale) / 2
  const oz = THUMB_MARGIN + (THUMB_H - 2 * THUMB_MARGIN - spanZ * scale) / 2
  const mx = (x: number) => Math.round((ox + (x - minX) * scale) * 10) / 10
  const mz = (z: number) => Math.round((oz + (z - minZ) * scale) * 10) / 10
  const poly = (pts: V2[], o: number) => pts.map((p) => `${mx(p[0] + o)},${mz(p[1])}`).join(' ')
  const lines: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${THUMB_H}" viewBox="0 0 ${width} ${THUMB_H}">`]
  lines.push(`<rect x="0" y="0" width="${width}" height="${THUMB_H}" fill="#10131a"/>`)
  for (const f of frames) {
    for (const b of boxes) {
      const x = mx(b.at[0] - b.size[0] / 2 + f.ox)
      const y = mz(b.at[1] - b.size[1] / 2)
      lines.push(`<rect x="${x}" y="${y}" width="${Math.round(b.size[0] * scale * 10) / 10}" height="${Math.round(b.size[1] * scale * 10) / 10}" fill="#444a55"/>`)
    }
    lines.push(`<polyline points="${poly(f.chain, f.ox)}" fill="none" stroke="${f.color}" stroke-width="1.5" stroke-opacity="0.9"/>`)
    lines.push(`<circle cx="${mx(f.chain[0]![0] + f.ox)}" cy="${mz(f.chain[0]![1])}" r="5" fill="${f.startColor}"/>`)
    lines.push(`<circle cx="${mx(f.chain[f.chain.length - 1]![0] + f.ox)}" cy="${mz(f.chain[f.chain.length - 1]![1])}" r="5" fill="#ff4444"/>`)
  }
  lines.push('</svg>')
  return lines.join('\n') + '\n'
}

// --- main ----------------------------------------------------------------------------------------------------------------------------

const t0 = Date.now()

async function main(): Promise<void> {
  const genome = shippedGenomeV3()
  if (!genome) throw new Error('shippedPolicyV3.json not shipped yet (tools/policy-evolution/ship.ts)')
  const rows: string[] = [`${'world'.padEnd(13)} ${'route'.padStart(5)}  dir  reached  seconds  score`]
  for (const spec of MAZE_TRAINING_WORLDS) {
    const { course, routes, chains } = mazeTrainingRoutes(spec)
    const world = buildMazeTrainingWorld(spec, genome)
    const scoreStage0 = (world.transformers as Record<string, { params?: { vRef?: number; bonusRate?: number; chains?: number[][][] } }>)[mazeScoreStageId(0)]
    const chainsWorld = (scoreStage0?.params?.chains ?? []) as number[][][]
    const outDir = resolve(root, 'public/exampleWorlds', spec.id)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(world, null, 2) + '\n')
    let bestScore: number | null = null
    if (withScore) {
      const results = await scoreWorld(world, chainsWorld, scoreStage0?.params?.vRef ?? 20, scoreStage0?.params?.bonusRate ?? 5)
      bestScore = Math.max(...results.map((r) => r.score))
      results.forEach((r, i) => {
        rows.push(`${spec.id.padEnd(13)} ${String(i).padStart(5)}  ${routes[i]!.reversed ? 'rev' : 'fwd'}  ${r.reached ? 'yes' : 'no '}     ${r.seconds.toFixed(1).padStart(5)} s  ${String(r.score).padStart(4)}`)
      })
    }
    writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify(mazeTrainingMeta(spec, routes, bestScore), null, 2) + '\n')
    writeFileSync(
      resolve(outDir, 'thumb.svg'),
      thumbSvg(
        course.boxes,
        routes.map((route, i) => ({
          ox: i * MAZE_TRAIN_ROUTES.spacingM,
          chain: chains[i]!,
          color: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.end,
          startColor: route.reversed ? MAZE_TRAIN_CHAIN_COLORS_REVERSED.start : MAZE_TRAIN_CHAIN_COLORS.start,
        })),
      ),
    )
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
