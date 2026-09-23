#!/usr/bin/env node
/**
 * Sync car patches into hunt_repair2/world.json — Pipe3 wanderer goals + aligned entity.transformers.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const worldPath = resolve(root, 'public/exampleWorlds/hunt_repair2/world.json')
const umlenker = readFileSync(resolve(root, 'tools/renn-mcp/patches/umlenker-v3.js'), 'utf8')
const direction = readFileSync(resolve(root, 'tools/renn-mcp/patches/direction-v3.js'), 'utf8')

const AUTO_BRAKE_GUARD =
  "  if (params && params.id) return {}\n  if (input.actions && input.actions._obstacle_escape) return {}\n"

const COPY_ENTITY_ID = 'entity_1779823253285_brtkx1p'
const PIPE_ID = 'pipe3'
/** Wanderer picks goals (targetPoseInput omitted — redundant target source). */
const PIPE3_STAGE_IDS = [
  'entity_1779823253285_brtkx1p_tf1',
  'car_tf2',
  'car_tf0',
  'car_tf5',
  'car_tf4',
  'Umlenker2',
  'car_tf1_copy',
  'entity_1779823253285_brtkx1p_tf2',
  'car_tf1',
]

function stageSnapshotFromRegistry(registry, stageId) {
  const def = registry[stageId]
  if (!def) throw new Error(`Missing transformer registry id: ${stageId}`)
  return JSON.parse(JSON.stringify(def))
}

const world = JSON.parse(readFileSync(worldPath, 'utf8'))
const registry = world.transformers

registry.car_tf5.code = umlenker
registry.car_tf4.code = direction
registry.entity_1779823253285_brtkx1p_tf0.enabled = false
registry.entity_1779823253285_brtkx1p_tf1.enabled = true

let autoBrake = registry.car_tf1_copy.code
if (!autoBrake.includes('params.id')) {
  autoBrake = autoBrake.replace(
    ') {\n  if(input.target.distance',
    `) {\n${AUTO_BRAKE_GUARD}  if(input.target.distance`,
  )
  registry.car_tf1_copy.code = autoBrake
}

const pipe = world.transformerPipes?.[PIPE_ID]
if (!pipe) throw new Error(`Missing ${PIPE_ID}`)

pipe.stageIds = [...PIPE3_STAGE_IDS]
pipe.stages = PIPE3_STAGE_IDS.map((id) => stageSnapshotFromRegistry(registry, id))
pipe.members = PIPE3_STAGE_IDS.map((stageId) => ({ kind: 'stage', stageId }))

const copy = world.entities.find((e) => e.id === COPY_ENTITY_ID)
if (!copy) throw new Error(`Missing entity ${COPY_ENTITY_ID}`)
copy.transformers = [...PIPE3_STAGE_IDS]
copy.transformerPipeStack = [
  {
    pipeId: PIPE_ID,
    enabled: true,
  },
]

writeFileSync(worldPath, JSON.stringify(world, null, 2) + '\n')
console.log('Pipe3 wanderer pipeline synced:', PIPE3_STAGE_IDS.length, 'stages')
