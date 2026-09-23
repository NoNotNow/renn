#!/usr/bin/env npx tsx
/**
 * Deterministic self-driving diagnostic run (fixed spawn, fresh sim each invocation).
 *
 * Outputs (grep-friendly):
 *   agent-context/recordings/car-diagnostic-events.log  — RENNDIAG:* one-liners
 *   agent-context/recordings/car-diagnostic-latest.jsonl — per-frame JSON lines
 *   agent-context/recordings/car-diagnostic-summary.json
 *
 * Usage:
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts --variant cubeGoalBehind --frames 120
 *   rg 'RENNDIAG:' agent-context/recordings/car-diagnostic-events.log
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSelfDrivingCarWorld,
  SELF_DRIVE_SPAWN,
  SELF_DRIVE_SPAWN_MATRIX,
  selfDriveGoAroundPass,
  type GoalBehindObstacleShape,
  type SelfDriveSpawnId,
  type SelfDrivingCarVariant,
} from '../../src/test/fixtures/selfDrivingCarWorld'
import {
  getTransformerWatchEntries,
  setAgentObservationWatchActive,
} from '../../src/runtime/transformerWatchBridge'
import { WorldSimulator } from '../../src/test/helpers/worldSimulator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'agent-context/recordings')
const eventsPath = resolve(outDir, 'car-diagnostic-events.log')
const jsonlPath = resolve(outDir, 'car-diagnostic-latest.jsonl')
const summaryPath = resolve(outDir, 'car-diagnostic-summary.json')
const pathPath = resolve(outDir, 'car-diagnostic-path.json')

function parseArgs(): {
  variant: SelfDrivingCarVariant
  frames: number
  spawnId?: SelfDriveSpawnId
  obstacleShape?: GoalBehindObstacleShape
  runs: number
} {
  const args = process.argv.slice(2)
  let variant: SelfDrivingCarVariant = 'cubeGoalBehind'
  let frames = 120
  let spawnId: SelfDriveSpawnId | undefined
  let obstacleShape: GoalBehindObstacleShape | undefined
  let runs = 1
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--variant' && args[i + 1]) {
      variant = args[i + 1] as SelfDrivingCarVariant
      i++
    } else if (args[i] === '--frames' && args[i + 1]) {
      frames = Number(args[i + 1])
      i++
    } else if (args[i] === '--spawn' && args[i + 1]) {
      spawnId = args[i + 1] as SelfDriveSpawnId
      i++
    } else if (args[i] === '--shape' && args[i + 1]) {
      obstacleShape = args[i + 1] as GoalBehindObstacleShape
      i++
    } else if (args[i] === '--runs' && args[i + 1]) {
      runs = Math.max(1, Number(args[i + 1]))
      i++
    }
  }
  return { variant, frames, spawnId, obstacleShape, runs }
}

function watchSnapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of getTransformerWatchEntries().values()) {
    out[entry.label] = entry.value
  }
  return out
}

function logEvent(line: string) {
  appendFileSync(eventsPath, line + '\n')
  process.stdout.write(line + '\n')
}

async function runOnce(params: {
  variant: SelfDrivingCarVariant
  frames: number
  spawnId?: SelfDriveSpawnId
  obstacleShape?: GoalBehindObstacleShape
  runIndex: number
}): Promise<{ pass: boolean; summary: Record<string, unknown> }> {
  const { variant, frames, spawnId, obstacleShape, runIndex } = params
  writeFileSync(jsonlPath, '')

  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(
    buildSelfDrivingCarWorld({ variant, spawnId, obstacleShape }),
    15,
  )
  try {
    const start = sim.getPosition('car')
    logEvent(
      `RENNDIAG:START run=${runIndex} variant=${variant} spawnId=${spawnId ?? 'default'} shape=${obstacleShape ?? SELF_DRIVE_SPAWN_MATRIX[spawnId ?? 'center']?.obstacleShape ?? 'box'} frames=${frames} car=${start.join(',')} goalZ=${SELF_DRIVE_SPAWN.goalZ}`,
    )

    const posHistory: Array<[number, number, number]> = []
    let stuckSince: number | null = null
    let zSignFlips = 0
    let lastZSign = 0
    let sawManeuver = false
    let sawBackoff = false
    const keyMoments: Array<{ frame: number; tag: string; detail: string }> = []

    for (let frame = 0; frame < frames; frame++) {
      sim.runFrames(1)
      const pos = sim.getPosition('car')
      const vel = sim.getVelocity('car')
      posHistory.push(pos)
      const watch = watchSnapshot()

      if (watch['uml.maneuver'] === '1') sawManeuver = true
      if (watch['dir.backoff'] === '1') sawBackoff = true

      appendFileSync(
        jsonlPath,
        JSON.stringify({ frame, t: frame / 60, pos, vel, watch }) + '\n',
      )

      if (frame % 15 === 0) {
        keyMoments.push({
          frame,
          tag: 'SAMPLE',
          detail: `z=${pos[2].toFixed(2)} uml=${watch['uml.maneuver'] ?? '-'} backoff=${watch['dir.backoff'] ?? '-'} aimX=${watch['uml.aimX'] ?? '-'} aimZ=${watch['uml.aimZ'] ?? '-'}`,
        })
      }

      if (posHistory.length >= 40) {
        const window = posHistory.slice(-40)
        let minX = window[0][0]
        let maxX = window[0][0]
        let minZ = window[0][2]
        let maxZ = window[0][2]
        for (const p of window) {
          if (p[0] < minX) minX = p[0]
          if (p[0] > maxX) maxX = p[0]
          if (p[2] < minZ) minZ = p[2]
          if (p[2] > maxZ) maxZ = p[2]
        }
        const spread = Math.max(maxX - minX, maxZ - minZ)
        if (spread < 0.28) {
          if (stuckSince == null) stuckSince = frame - 39
          if (frame - stuckSince >= 44) {
            logEvent(
              `RENNDIAG:STUCK frame=${frame} spread=${spread.toFixed(3)} pos=${pos.join(',')} watch=${JSON.stringify(watch)}`,
            )
            stuckSince = frame
          }
        } else {
          stuckSince = null
        }
      }

      const vz = vel[2]
      const sign = vz > 0.15 ? 1 : vz < -0.15 ? -1 : 0
      if (sign !== 0 && lastZSign !== 0 && sign !== lastZSign) zSignFlips++
      if (sign !== 0) lastZSign = sign
      if (frame > 0 && frame % 60 === 0 && zSignFlips >= 4) {
        logEvent(
          `RENNDIAG:BACKFORTH frame=${frame} zSignFlips=${zSignFlips} pos=${pos.join(',')} vel=${vel.join(',')}`,
        )
        zSignFlips = 0
      }

      if (
        watch['uml.frontHit'] === '1' &&
        watch['uml.maneuver'] === '1' &&
        watch['uml.aimX'] != null &&
        Math.abs(Number(watch['uml.aimX'])) < 0.5 &&
        Number(watch['uml.aimZ']) < SELF_DRIVE_SPAWN.cubeCenter[2] + 2
      ) {
        logEvent(
          `RENNDIAG:AIM_THROUGH_OBSTACLE frame=${frame} aimX=${watch['uml.aimX']} aimZ=${watch['uml.aimZ']} goalZ=${SELF_DRIVE_SPAWN.goalZ}`,
        )
      }
    }

    const end = sim.getPosition('car')
    const eventsText = readFileSync(eventsPath, 'utf8')
    const aimThroughCount = (eventsText.match(/RENNDIAG:AIM_THROUGH_OBSTACLE/g) ?? []).length

    let minX = posHistory[0]?.[0] ?? 0
    let maxX = minX
    let minZ = posHistory[0]?.[2] ?? 0
    let maxZ = minZ
    let minY = posHistory[0]?.[1] ?? 0
    let maxY = minY
    for (const p of posHistory) {
      if (p[0] < minX) minX = p[0]
      if (p[0] > maxX) maxX = p[0]
      if (p[2] < minZ) minZ = p[2]
      if (p[2] > maxZ) maxZ = p[2]
      if (p[1] < minY) minY = p[1]
      if (p[1] > maxY) maxY = p[1]
    }

    const pass =
      variant === 'cubeGoalBehind'
        ? aimThroughCount === 0 &&
          selfDriveGoAroundPass({
            startPos: start,
            endPos: end,
            obstacleCenterZ: SELF_DRIVE_SPAWN.cubeCenter[2],
          })
        : sawManeuver || sawBackoff

    const summary = {
      recordedAt: new Date().toISOString(),
      runIndex,
      variant,
      spawnId: spawnId ?? 'center',
      obstacleShape: obstacleShape ?? SELF_DRIVE_SPAWN_MATRIX[spawnId ?? 'center']?.obstacleShape ?? 'box',
      frames,
      spawn: SELF_DRIVE_SPAWN,
      startPos: start,
      endPos: end,
      bounds: { minX, maxX, minY, maxY, minZ, maxZ },
      sawManeuver,
      sawBackoff,
      aimThroughCount,
      keyMoments,
      paths: { eventsPath, jsonlPath, summaryPath, pathPath },
      pass,
    }
    writeFileSync(
      pathPath,
      JSON.stringify(
        {
          variant,
          spawnId: summary.spawnId,
          obstacleShape: summary.obstacleShape,
          frames,
          polyline: posHistory,
          bounds: summary.bounds,
        },
        null,
        2,
      ) + '\n',
    )
    logEvent(
      `RENNDIAG:DONE run=${runIndex} pass=${pass} sawManeuver=${sawManeuver} sawBackoff=${sawBackoff} aimThrough=${aimThroughCount} endZ=${end[2].toFixed(2)} endX=${end[0].toFixed(2)}`,
    )
    return { pass, summary }
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

async function main() {
  const { variant, frames, spawnId, obstacleShape, runs } = parseArgs()
  mkdirSync(outDir, { recursive: true })
  writeFileSync(eventsPath, '')

  const runSummaries: Record<string, unknown>[] = []
  let allPass = true
  for (let run = 0; run < runs; run++) {
    const { pass, summary } = await runOnce({
      variant,
      frames,
      spawnId,
      obstacleShape,
      runIndex: run,
    })
    runSummaries.push(summary)
    if (!pass) allPass = false
  }
  writeFileSync(
    summaryPath,
    JSON.stringify({ recordedAt: new Date().toISOString(), runs: runSummaries, pass: allPass }, null, 2) +
      '\n',
  )
  console.log(JSON.stringify(runSummaries[runSummaries.length - 1], null, 2))
  if (!allPass) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
