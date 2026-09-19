/**
 * Entity add via apply_world_patch preserves existing poses when allowSceneRebuild is set.
 */

import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import { createLogicVerificationHost } from '@/agent/logicVerificationHost'

function minimalWorld(): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -10, 0] },
    assets: {},
    transformers: {},
    entities: [
      {
        id: 'falling',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 5, 0],
        mass: 1,
      },
    ],
    scripts: {},
  }
}

describe('LogicVerificationHost entity patch (integration)', () => {
  it('adds entity with allowSceneRebuild and keeps existing pose', async () => {
    const host = await createLogicVerificationHost({
      world: minimalWorld(),
      dt: 1 / 60,
      warmupSteps: 3,
    })

    host.runSteps(10)
    const yBefore = host.snapshot().poses.falling!.position[1]

    const applied = await host.applyWorldPatch({
      allowSceneRebuild: true,
      entities: {
        add: [
          {
            id: 'platform',
            bodyType: 'static',
            shape: { type: 'box', width: 4, height: 0.5, depth: 4 },
            position: [0, -2, 0],
          },
        ],
      },
    })
    expect(applied.ok).toBe(true)

    const afterAdd = host.snapshot()
    expect(afterAdd.poses.falling!.position[1]).toBeCloseTo(yBefore, 3)
    expect(afterAdd.poses.platform).toBeDefined()

    host.dispose()
  })
})
