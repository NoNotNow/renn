#!/usr/bin/env npx tsx
/**
 * Headless sim recording for direction back-off (counter-check vs Play).
 * Writes agent-context/recordings/direction-backoff-latest.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDirectionBackoffWorld } from '../../src/test/fixtures/directionBackoffWorld'
import {
  getTransformerWatchEntries,
  setAgentObservationWatchActive,
} from '../../src/runtime/transformerWatchBridge'
import { WorldSimulator } from '../../src/test/helpers/worldSimulator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'agent-context/recordings')
const outPath = resolve(outDir, 'direction-backoff-latest.json')

function watchSnapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of getTransformerWatchEntries().values()) {
    out[entry.label] = entry.value
  }
  return out
}

async function main() {
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(buildDirectionBackoffWorld(), 15)
  const samples: Array<{
    frame: number
    z: number
    watch: Record<string, string>
  }> = []
  try {
    const startZ = sim.getPosition('car')[2]
    let sawBackoff = false
    let maxZDuringBackoff = startZ
    for (let frame = 0; frame < 60; frame++) {
      sim.runFrames(1)
      const z = sim.getPosition('car')[2]
      const watch = watchSnapshot()
      if (watch['dir.backoff'] === '1') {
        sawBackoff = true
        if (z > maxZDuringBackoff) maxZDuringBackoff = z
      }
      if (frame % 5 === 0) {
        samples.push({ frame, z, watch })
      }
    }
    const endZ = sim.getPosition('car')[2]
    const summary = {
      recordedAt: new Date().toISOString(),
      startZ,
      endZ,
      maxZDuringBackoff,
      retreatDeltaDuringBackoff: maxZDuringBackoff - startZ,
      endZ,
      sawBackoff,
      pass:
        sawBackoff &&
        maxZDuringBackoff - startZ > 0.06 &&
        maxZDuringBackoff - startZ < 1.2,
    }
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outPath, JSON.stringify({ summary, samples }, null, 2) + '\n')
    console.log(JSON.stringify(summary, null, 2))
    if (!summary.pass) process.exit(1)
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
