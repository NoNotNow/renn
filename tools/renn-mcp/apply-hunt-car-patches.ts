#!/usr/bin/env node
/**
 * Push hunt_repair2 car patches to attached Builder (after sync-hunt-car-patches.mjs).
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RennWorld } from '../../src/types/world'
import { LogicVerificationMcpSession } from '../../src/agent/logicVerificationMcpSession'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const COPY_ENTITY_ID = 'entity_1779823253285_brtkx1p'

function readJs(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8')
}

function loadWorld(): RennWorld {
  return JSON.parse(
    readFileSync(resolve(root, 'public/exampleWorlds/hunt_repair2/world.json'), 'utf8'),
  ) as RennWorld
}

async function main(): Promise<void> {
  const umlenkerCode = readJs('public/global/transformers/self-driving-car/umlenker.js')
  const directionCode = readJs('public/global/transformers/self-driving-car/direction.js')
  const diskWorld = loadWorld()
  const autoBrakeCode = diskWorld.transformers!.car_tf1_copy!.code!
  const pipe3 = diskWorld.transformerPipes!.pipe3!
  const copyEntity = diskWorld.entities.find((e) => e.id === COPY_ENTITY_ID)
  if (!copyEntity) throw new Error('copy entity missing on disk')

  const session = new LogicVerificationMcpSession()
  const devToken = resolveMcpDevToken()
  await session.attachBrowser({ devToken, waitForBrowserMs: 120_000, rpcTimeoutMs: 120_000 })
  await session.loadExampleWorld({ devToken, exampleWorldId: 'hunt_repair2' })

  for (const [id, code] of [
    ['car_tf5', umlenkerCode],
    ['car_tf4', directionCode],
    ['car_tf1_copy', autoBrakeCode],
  ] as const) {
    const v = session.validateStageCode(code, id)
    if (!v.ok) throw new Error(`${id}: ${v.message}`)
  }

  const applied = await session.applyWorldPatch({
    devToken,
    transformers: {
      car_tf3: { enabled: true },
      car_tf5: { code: umlenkerCode },
      car_tf4: { code: directionCode },
      car_tf1_copy: { code: autoBrakeCode },
    },
    transformerPipes: {
      pipe3: {
        stagePatches: [
          { match: { name: 'Umlenker' }, patch: { code: umlenkerCode } },
          { match: { name: 'direction' }, patch: { code: directionCode } },
          { match: { name: 'AutoBrake' }, patch: { code: autoBrakeCode } },
        ],
      },
    },
    entities: {
      update: {
        [COPY_ENTITY_ID]: {
          transformers: [...(copyEntity.transformers ?? [])],
          transformerPipeStack: copyEntity.transformerPipeStack,
        },
      },
    },
  })
  if (!applied.ok) throw new Error(applied.message)

  console.log('apply_world_patch ok — pipe3 stages on disk:', pipe3.stageIds?.length ?? 0)

  const saved = await session.saveProject()
  console.log('save_project', saved)
  await session.dispose()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
