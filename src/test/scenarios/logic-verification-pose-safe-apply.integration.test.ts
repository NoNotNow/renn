/**
 * Pose-safe apply: patch transformer params mid-run without resetting pose; new behavior on next steps.
 */

import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import { createLogicVerificationHost } from '@/agent/logicVerificationHost'

function forceGainWorld(gain: number): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, 0, 0] },
    assets: {},
    transformers: {
      push_tf: {
        type: 'custom',
        priority: 0,
        params: { gain },
        code: `function transform(input, dt, params, state, api) {
          const g = params.gain ?? 1;
          return { force: [0, 0, -g * 80] };
        }`,
      },
    },
    entities: [
      {
        id: 'box',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
        mass: 1,
        transformers: ['push_tf'],
      },
    ],
    scripts: {},
  }
}

describe('LogicVerificationHost pose-safe apply (integration)', () => {
  it('applies param patch without moving pose; higher gain moves farther on next steps', async () => {
    const host = await createLogicVerificationHost({
      world: forceGainWorld(1),
      dt: 1 / 60,
      warmupSteps: 5,
    })

    host.runSteps(20)
    const z0 = host.snapshot().poses.box!.position[2]
    host.runSteps(20)
    const atApply = host.snapshot()
    const z1 = atApply.poses.box!.position[2]
    const deltaBefore = z1 - z0

    const applied = await host.applyWorldPatch({
      transformers: { push_tf: { params: { gain: 40 } } },
    })
    expect(applied.ok).toBe(true)

    const afterApply = host.snapshot()
    expect(afterApply.poses.box!.position[2]).toBeCloseTo(z1, 4)

    host.runSteps(20)
    const z2 = host.snapshot().poses.box!.position[2]
    const deltaAfter = z2 - z1
    expect(Math.abs(deltaAfter)).toBeGreaterThan(Math.abs(deltaBefore) * 2)

    host.dispose()
  })
})
