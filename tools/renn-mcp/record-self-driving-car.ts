#!/usr/bin/env npx tsx
/**
 * Headless sim recording for Pipe3 self-driving stack (wanderer + umlenker + direction).
 * Writes agent-context/recordings/self-driving-car-latest.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSelfDrivingCarWorld } from '../../src/test/fixtures/selfDrivingCarWorld'
import {
  getTransformerWatchEntries,
  setAgentObservationWatchActive,
} from '../../src/runtime/transformerWatchBridge'
import { WorldSimulator } from '../../src/test/helpers/worldSimulator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'agent-context/recordings')
const outPath = resolve(outDir, 'self-driving-car-latest.json')

function watchSnapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of getTransformerWatchEntries().values()) {
    out[entry.label] = entry.value
  }
  return out
}

function distToGoalZ(z: number, goalZ: number): number {
  return Math.abs(z - goalZ)
}

async function runScenario(
  variant: 'wallAhead' | 'clearPath',
  frames: number,
): Promise<{
  variant: string
  startZ: number
  endZ: number
  minDistToGoal: number
  sawAvoidance: boolean
  sawBackoff: boolean
  retreatDeltaDuringBackoff: number
  backoffFrames: number
  samples: Array<{ frame: number; z: number; watch: Record<string, string> }>
}> {
  const goalZ = -32
  const sim = await WorldSimulator.create(buildSelfDrivingCarWorld({ variant }), 15)
  const samples: Array<{ frame: number; z: number; watch: Record<string, string> }> = []
  try {
    const startZ = sim.getPosition('car')[2]
    let sawAvoidance = false
    let sawBackoff = false
    let maxZDuringBackoff = startZ
    let backoffFrames = 0
    let minDist = distToGoalZ(startZ, goalZ)
    for (let frame = 0; frame < frames; frame++) {
      sim.runFrames(1)
      const z = sim.getPosition('car')[2]
      const watch = watchSnapshot()
      const d = distToGoalZ(z, goalZ)
      if (d < minDist) minDist = d
      if (watch['uml.maneuver'] === '1' && watch['uml.frontHit'] === '1') sawAvoidance = true
      if (watch['dir.backoff'] === '1') {
        sawBackoff = true
        backoffFrames++
        if (z > maxZDuringBackoff) maxZDuringBackoff = z
      }
      if (frame % 10 === 0) samples.push({ frame, z, watch })
    }
    const endZ = sim.getPosition('car')[2]
    return {
      variant,
      startZ,
      endZ,
      minDistToGoal: minDist,
      sawAvoidance,
      sawBackoff,
      retreatDeltaDuringBackoff: sawBackoff ? maxZDuringBackoff - startZ : 0,
      backoffFrames,
      samples,
    }
  } finally {
    sim.dispose()
  }
}

async function main() {
  setAgentObservationWatchActive(true)
  try {
    const wall = await runScenario('wallAhead', 80)
    const clear = await runScenario('clearPath', 120)
    const startDistClear = distToGoalZ(wall.startZ, -32)
    const pass =
      (wall.sawAvoidance || wall.sawBackoff) &&
      (!wall.sawBackoff ||
        (wall.retreatDeltaDuringBackoff > 0.04 && wall.retreatDeltaDuringBackoff < 1.2)) &&
      clear.minDistToGoal < startDistClear - 0.35 &&
      clear.backoffFrames < 15

    const summary = {
      recordedAt: new Date().toISOString(),
      pass,
      wall,
      clear,
    }
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n')
    console.log(JSON.stringify({ pass, wall: { sawAvoidance: wall.sawAvoidance, sawBackoff: wall.sawBackoff }, clear: { minDistToGoal: clear.minDistToGoal, backoffFrames: clear.backoffFrames } }, null, 2))
    if (!pass) process.exit(1)
  } finally {
    setAgentObservationWatchActive(false)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
