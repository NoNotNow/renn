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
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts --variant parkour --frames 1550
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts --variant parkour --segment seg2_beside_cone
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts --variant parkour --segment seg4_cylinder
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts --variant parkour --segment seg4_cylinder --cylinder-start tight
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts --variant parkour --parkour-spawn-matrix
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts --variant parkour --parkour-full-spawn-matrix
 *   npx tsx tools/renn-mcp/sim-car-diagnostic.ts --batch 400,600,900 --runs 3
 *   rg 'RENNDIAG:' agent-context/recordings/car-diagnostic-events.log
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSelfDrivingCarWorld,
  buildSelfDrivingParkourBesideWorld,
  selfDriveParkourBesideGatePass,
  SELF_DRIVE_SPAWN,
  SELF_DRIVE_SPAWN_MATRIX,
  selfDriveGoAroundPass,
  selfDriveGoalDistance,
  selfDriveLongRunPass,
  selfDriveParkourPass,
  selfDriveParkourSegmentPass,
  SELF_DRIVE_PARKOUR_SEGMENTS,
  SELF_DRIVE_PARKOUR_SPAWN_IDS,
  SELF_DRIVE_PARKOUR_WAYPOINTS,
  selfDrivingParkourSegmentWorldOptions,
  type GoalBehindObstacleShape,
  type SelfDriveParkourCylinderStartId,
  type SelfDriveParkourSegmentId,
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
  batchFrames?: number[]
  spawnId?: SelfDriveSpawnId
  obstacleShape?: GoalBehindObstacleShape
  parkourSegment?: SelfDriveParkourSegmentId
  parkourSpawnMatrix: boolean
  parkourFullSpawnMatrix: boolean
  cylinderStart: SelfDriveParkourCylinderStartId
  runs: number
} {
  const args = process.argv.slice(2)
  let variant: SelfDrivingCarVariant = 'cubeGoalBehind'
  let frames = 120
  let batchFrames: number[] | undefined
  let spawnId: SelfDriveSpawnId | undefined
  let obstacleShape: GoalBehindObstacleShape | undefined
  let parkourSegment: SelfDriveParkourSegmentId | undefined
  let parkourSpawnMatrix = false
  let parkourFullSpawnMatrix = false
  let cylinderStart: SelfDriveParkourCylinderStartId = 'approach'
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
    } else if (args[i] === '--batch' && args[i + 1]) {
      batchFrames = args[i + 1]
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
      i++
    } else if (args[i] === '--segment' && args[i + 1]) {
      parkourSegment = args[i + 1] as SelfDriveParkourSegmentId
      i++
    } else if (args[i] === '--cylinder-start' && args[i + 1]) {
      cylinderStart = args[i + 1] as SelfDriveParkourCylinderStartId
      i++
    } else if (args[i] === '--parkour-spawn-matrix') {
      parkourSpawnMatrix = true
    } else if (args[i] === '--parkour-full-spawn-matrix') {
      parkourFullSpawnMatrix = true
    }
  }
  return {
    variant,
    frames,
    batchFrames,
    spawnId,
    obstacleShape,
    parkourSegment,
    parkourSpawnMatrix,
    parkourFullSpawnMatrix,
    cylinderStart,
    runs,
  }
}

function cubeGoalBehindPass(
  frames: number,
  start: [number, number, number],
  end: [number, number, number],
  aimThroughCount: number,
  maxAbsX: number,
): boolean {
  if (aimThroughCount > 0) return false
  if (frames >= 300) {
    return selfDriveLongRunPass({
      startPos: start,
      endPos: end,
      obstacleCenterZ: SELF_DRIVE_SPAWN.cubeCenter[2],
      goalZ: SELF_DRIVE_SPAWN.goalZ,
      maxAbsX,
    })
  }
  return selfDriveGoAroundPass({
    startPos: start,
    endPos: end,
    obstacleCenterZ: SELF_DRIVE_SPAWN.cubeCenter[2],
  })
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
  parkourSegment?: SelfDriveParkourSegmentId
  cylinderStart?: SelfDriveParkourCylinderStartId
  runIndex: number
}): Promise<{ pass: boolean; summary: Record<string, unknown> }> {
  const { variant, frames, spawnId, obstacleShape, parkourSegment, cylinderStart = 'approach', runIndex } =
    params
  writeFileSync(jsonlPath, '')

  setAgentObservationWatchActive(true)
  const segmentWorld =
    variant === 'parkour' && parkourSegment
      ? selfDrivingParkourSegmentWorldOptions(
          parkourSegment,
          parkourSegment === 'seg4_cylinder' ? cylinderStart : 'approach',
        )
      : undefined
  const world =
    variant === 'parkourBeside'
      ? buildSelfDrivingParkourBesideWorld({ spawnId, obstacleShape })
      : buildSelfDrivingCarWorld({
          variant,
          spawnId,
          obstacleShape,
          ...segmentWorld,
        })
  const sim = await WorldSimulator.create(world, 15)
  try {
    const start = sim.getPosition('car')
    logEvent(
      `RENNDIAG:START run=${runIndex} variant=${variant} spawnId=${spawnId ?? 'default'} segment=${parkourSegment ?? '-'} shape=${obstacleShape ?? SELF_DRIVE_SPAWN_MATRIX[spawnId ?? 'center']?.obstacleShape ?? 'box'} frames=${frames} car=${start.join(',')} goalZ=${SELF_DRIVE_SPAWN.goalZ}`,
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

    let maxAbsX = 0
    let minX = posHistory[0]?.[0] ?? 0
    let maxX = minX
    let minZ = posHistory[0]?.[2] ?? 0
    let maxZ = minZ
    let minY = posHistory[0]?.[1] ?? 0
    let maxY = minY
    for (const p of posHistory) {
      const absX = Math.abs(p[0])
      if (absX > maxAbsX) maxAbsX = absX
      if (p[0] < minX) minX = p[0]
      if (p[0] > maxX) maxX = p[0]
      if (p[2] < minZ) minZ = p[2]
      if (p[2] > maxZ) maxZ = p[2]
      if (p[1] < minY) minY = p[1]
      if (p[1] > maxY) maxY = p[1]
    }

    const pass =
      variant === 'cubeGoalBehind'
        ? cubeGoalBehindPass(frames, start, end, aimThroughCount, maxAbsX)
        : variant === 'parkourBeside'
          ? selfDriveParkourBesideGatePass({ startPos: start, endPos: end, maxAbsX })
          : variant === 'parkour'
            ? parkourSegment
              ? selfDriveParkourSegmentPass({
                  segmentId: parkourSegment,
                  startPos: start,
                  endPos: end,
                  maxAbsX,
                })
              : selfDriveParkourPass({
                  startPos: start,
                  endPos: end,
                  maxAbsX,
                  finalWaypoint:
                    SELF_DRIVE_PARKOUR_WAYPOINTS[SELF_DRIVE_PARKOUR_WAYPOINTS.length - 1].position,
                })
            : sawManeuver || sawBackoff

    const goalDistStart = selfDriveGoalDistance(start, SELF_DRIVE_SPAWN.goalZ)
    const goalDistEnd = selfDriveGoalDistance(end, SELF_DRIVE_SPAWN.goalZ)

    const summary = {
      recordedAt: new Date().toISOString(),
      runIndex,
      variant,
      spawnId: spawnId ?? 'center',
      parkourSegment: parkourSegment ?? null,
      obstacleShape: obstacleShape ?? SELF_DRIVE_SPAWN_MATRIX[spawnId ?? 'center']?.obstacleShape ?? 'box',
      frames,
      spawn: SELF_DRIVE_SPAWN,
      startPos: start,
      endPos: end,
      bounds: { minX, maxX, minY, maxY, minZ, maxZ },
      maxAbsX,
      goalDistStart,
      goalDistEnd,
      goalDistDelta: goalDistStart - goalDistEnd,
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
      `RENNDIAG:DONE run=${runIndex} pass=${pass} sawManeuver=${sawManeuver} sawBackoff=${sawBackoff} aimThrough=${aimThroughCount} endZ=${end[2].toFixed(2)} endX=${end[0].toFixed(2)} minY=${minY.toFixed(2)} goalDist=${goalDistEnd.toFixed(2)} goalDelta=${(goalDistStart - goalDistEnd).toFixed(2)}`,
    )
    return { pass, summary }
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

async function main() {
  const {
    variant,
    frames,
    batchFrames,
    spawnId,
    obstacleShape,
    parkourSegment,
    parkourSpawnMatrix,
    parkourFullSpawnMatrix,
    cylinderStart,
    runs,
  } = parseArgs()
  mkdirSync(outDir, { recursive: true })

  if (parkourFullSpawnMatrix) {
    if (variant !== 'parkour') {
      console.error('--parkour-full-spawn-matrix requires --variant parkour')
      process.exit(1)
    }
    writeFileSync(eventsPath, '')
    const matrixRows: Record<string, unknown>[] = []
    let matrixPass = true
    const fullFrames = SELF_DRIVE_PARKOUR_SEGMENTS.full.frames
    for (const matrixSpawnId of SELF_DRIVE_PARKOUR_SPAWN_IDS) {
      const { pass, summary } = await runOnce({
        variant: 'parkour',
        frames: fullFrames,
        spawnId: matrixSpawnId,
        runIndex: matrixRows.length,
      })
      matrixRows.push(summary)
      if (!pass) matrixPass = false
    }
    const matrixPayload = {
      recordedAt: new Date().toISOString(),
      kind: 'parkour-full-spawn-matrix',
      pass: matrixPass,
      rows: matrixRows,
    }
    writeFileSync(
      resolve(outDir, 'car-diagnostic-parkour-full-spawn-matrix.json'),
      JSON.stringify(matrixPayload, null, 2) + '\n',
    )
    writeFileSync(summaryPath, JSON.stringify(matrixPayload, null, 2) + '\n')
    if (!matrixPass) process.exit(1)
    return
  }

  if (parkourSpawnMatrix) {
    if (variant !== 'parkour') {
      console.error('--parkour-spawn-matrix requires --variant parkour')
      process.exit(1)
    }
    const matrixSegments = ['seg1_box', 'seg2_beside_cone'] as const satisfies readonly SelfDriveParkourSegmentId[]
    writeFileSync(eventsPath, '')
    const matrixRows: Record<string, unknown>[] = []
    let matrixPass = true
    const besideSpawnIds = SELF_DRIVE_PARKOUR_SPAWN_IDS.filter((id) => id !== 'yawRight')
    for (const matrixSpawnId of SELF_DRIVE_PARKOUR_SPAWN_IDS) {
      for (const seg of matrixSegments) {
        const segFrames = SELF_DRIVE_PARKOUR_SEGMENTS[seg].frames
        if (seg === 'seg2_beside_cone' && !besideSpawnIds.includes(matrixSpawnId)) {
          continue
        }
        const matrixVariant = seg === 'seg2_beside_cone' ? 'parkourBeside' : 'parkour'
        const { pass, summary } = await runOnce({
          variant: matrixVariant,
          frames: segFrames,
          spawnId: matrixSpawnId,
          parkourSegment: seg === 'seg2_beside_cone' ? undefined : seg,
          runIndex: matrixRows.length,
        })
        matrixRows.push(summary)
        if (!pass) matrixPass = false
      }
    }
    const matrixPayload = {
      recordedAt: new Date().toISOString(),
      kind: 'parkour-spawn-matrix',
      pass: matrixPass,
      rows: matrixRows,
    }
    writeFileSync(
      resolve(outDir, 'car-diagnostic-parkour-spawn-matrix.json'),
      JSON.stringify(matrixPayload, null, 2) + '\n',
    )
    writeFileSync(summaryPath, JSON.stringify(matrixPayload, null, 2) + '\n')
    if (!matrixPass) process.exit(1)
    return
  }

  const resolvedSegment = parkourSegment
  const resolvedFrames =
    variant === 'parkour' && resolvedSegment
      ? SELF_DRIVE_PARKOUR_SEGMENTS[resolvedSegment].frames
      : frames

  const frameList = batchFrames?.length ? batchFrames : [resolvedFrames]
  const batchOutPath = resolve(outDir, 'car-diagnostic-batch-summary.json')
  const batchRows: Record<string, unknown>[] = []
  let batchPass = true

  for (const frameBudget of frameList) {
    writeFileSync(eventsPath, '')
    const runSummaries: Record<string, unknown>[] = []
    let allPass = true
    for (let run = 0; run < runs; run++) {
      const { pass, summary } = await runOnce({
        variant,
        frames: frameBudget,
        spawnId,
        obstacleShape,
        parkourSegment: resolvedSegment,
        cylinderStart,
        runIndex: run,
      })
      runSummaries.push(summary)
      if (!pass) allPass = false
    }
    const payload = {
      recordedAt: new Date().toISOString(),
      frames: frameBudget,
      runs: runSummaries,
      pass: allPass,
    }
    writeFileSync(summaryPath, JSON.stringify(payload, null, 2) + '\n')
    batchRows.push(payload)
    if (!allPass) batchPass = false
    console.log(JSON.stringify(runSummaries[runSummaries.length - 1], null, 2))
  }

  if (frameList.length > 1) {
    writeFileSync(
      batchOutPath,
      JSON.stringify({ recordedAt: new Date().toISOString(), batches: batchRows, pass: batchPass }, null, 2) +
        '\n',
    )
    const csvPath = resolve(outDir, 'car-diagnostic-batch-summary.csv')
    const csvLines = [
      'frames,runIndex,pass,endX,endZ,minY,goalDistEnd,goalDistDelta',
      ...batchRows.flatMap((b) => {
        const f = b.frames as number
        return (b.runs as Record<string, unknown>[]).map((r) => {
          const end = r.endPos as number[]
          const bounds = r.bounds as { minY: number }
          return [
            f,
            r.runIndex,
            r.pass,
            end[0].toFixed(2),
            end[2].toFixed(2),
            bounds.minY.toFixed(2),
            (r.goalDistEnd as number).toFixed(2),
            (r.goalDistDelta as number).toFixed(2),
          ].join(',')
        })
      }),
    ]
    writeFileSync(csvPath, csvLines.join('\n') + '\n')
  }

  if (!batchPass) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
