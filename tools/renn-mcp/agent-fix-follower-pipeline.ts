/**
 * Apply hunt-style follower fixes: registry Umlenker/direction + pipe binding `id` param.
 * Requires Builder attach with project loaded.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LogicVerificationMcpSession } from '../../src/agent/logicVerificationMcpSession'
import type { LogicVerificationWorldPatch } from '../../src/agent/applyLogicVerificationWorldPatch'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'

const DEFAULT_FOLLOW_TARGET_ID = 'entity_1779823253285_brtkx1p'
const DEFAULT_FOLLOWER_PIPE_ID = 'pipe_1780343603350'

function readJs(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

async function main(): Promise<void> {
  const followTargetId = process.env.RENN_FOLLOW_TARGET_ID?.trim() || DEFAULT_FOLLOW_TARGET_ID
  const followerPipeId = process.env.RENN_FOLLOWER_PIPE_ID?.trim() || DEFAULT_FOLLOWER_PIPE_ID

  const umlenkerCode = readJs('public/global/transformers/self-driving-car/umlenker.js')
  const directionCode = readJs('public/global/transformers/self-driving-car/direction.js')

  const session = new LogicVerificationMcpSession()
  const devToken = resolveMcpDevToken()
  try {
    await session.attachBrowser({
      devToken,
      waitForBrowserMs: 120_000,
      rpcTimeoutMs: 120_000,
    })

    const snapshot = (await session.getWorldAuthoringSnapshot({
      maxEntities: 200,
    })) as { entities?: Array<{ entityId: string; pipeStack: Array<{ pipeId: string }> }> }

    const entityPipeStack: LogicVerificationWorldPatch['entityPipeStack'] = []
    for (const ent of snapshot.entities ?? []) {
      ent.pipeStack.forEach((binding, stackIndex) => {
        if (binding.pipeId === followerPipeId) {
          entityPipeStack.push({
            entityId: ent.entityId,
            stackIndex,
            mergeBindingParams: { id: followTargetId },
          })
        }
      })
    }

    const patch: LogicVerificationWorldPatch = {
      transformers: {
        car_tf5: { code: umlenkerCode },
        car_tf4: { code: directionCode },
        car_tf3: { params: { id: followTargetId } },
      },
      transformerPipes: {
        [followerPipeId]: {
          stagePatches: [
            {
              match: { name: 'Umlenker' },
              patch: { code: umlenkerCode },
            },
            {
              match: { name: 'direction' },
              patch: { code: directionCode },
            },
            {
              match: { name: 'Target' },
              patch: { params: { id: followTargetId } },
            },
          ],
        },
      },
      entityPipeStack,
    }

    for (const id of ['car_tf3', 'car_tf4', 'car_tf5']) {
      const code =
        id === 'car_tf5' ? umlenkerCode : id === 'car_tf4' ? directionCode : undefined
      if (code) {
        const v = session.validateStageCode(code, id)
        if (!v.ok) throw new Error(`${id}: ${v.message}`)
      }
    }

    const applied = await session.applyWorldPatch(patch)
    if (!applied.ok) throw new Error(applied.message)
    console.log('apply_world_patch:', applied)

    const player = snapshot.entities?.find((e) => e.entityId === followTargetId)
    if (player?.stages?.some((s) => s.registryId === 'car_tf5' || s.name === 'Umlenker')) {
      const ids = (await session.getEntityAuthoringSummary({ entityId: followTargetId })) as {
        transformerIds: string[]
      }
      const withoutUmlenker = ids.transformerIds.filter((id) => id !== 'car_tf5')
      if (withoutUmlenker.length !== ids.transformerIds.length) {
        const strip = await session.applyWorldPatch({
          entities: {
            update: { [followTargetId]: { transformers: withoutUmlenker } },
          },
        })
        console.log('removed car_tf5 from player car:', strip)
      }
    }

    const saved = await session.saveProject()
    console.log('save_project:', saved)
  } finally {
    await session.dispose()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
