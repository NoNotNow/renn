#!/usr/bin/env npx tsx
/**
 * Write the maze-escape scene (AV car in a seeded 8x8 maze, goal outside the single exit gate) to
 * public/exampleWorlds/av_maze_escape/ (File -> Example Worlds).
 * Source of truth: src/avEvolution/maze/ (generator + episode builder) + the AV car of the `self_hunt_flexible` example world.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateAgentDevExampleWorldIdCache } from '../../src/agent/agentDevExampleWorlds'
import { buildMazeExampleWorld } from '../../src/avEvolution/maze/exampleWorld'
import { AV_CAR_SOURCE_WORLD } from '../../src/test/fixtures/avEvasionArena'
import { loadLabWorld } from '../../src/test/avLab/lab'

const EXAMPLE_WORLD_ID = 'av_maze_escape'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/exampleWorlds', EXAMPLE_WORLD_ID)
const outPath = resolve(outDir, 'world.json')

const world = buildMazeExampleWorld(loadLabWorld({ exampleId: AV_CAR_SOURCE_WORLD }))

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, JSON.stringify(world, null, 2) + '\n')
invalidateAgentDevExampleWorldIdCache()
console.log(JSON.stringify({ ok: true, exampleWorldId: EXAMPLE_WORLD_ID, entities: world.entities.length, path: outPath }, null, 2))
