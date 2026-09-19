/**
 * Agent observation session wired through LogicVerificationHost: api.watch → timeline.
 */

import { describe, it, expect, afterEach } from 'vitest'
import type { RennWorld } from '@/types/world'
import { createLogicVerificationHost } from '@/agent/logicVerificationHost'
import { resetTransformerWatchBridgeForTests } from '@/runtime/transformerWatchBridge'
import { resetTransformerTraceBridgeForTests } from '@/runtime/transformerTraceBridge'

function watchProbeWorld(): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -9.81, 0] },
    assets: {},
    transformers: {
      probe_tf: {
        type: 'custom',
        priority: 0,
        code: `function transform(input, dt, params, state, api) {
          api.watch('z', input.position[2]);
          return {};
        }`,
      },
    },
    entities: [
      {
        id: 'ground',
        bodyType: 'static',
        shape: { type: 'box', width: 40, height: 1, depth: 40 },
        position: [0, -0.5, 0],
      },
      {
        id: 'probe',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 2, 0],
        mass: 1,
        transformers: ['probe_tf'],
      },
    ],
    scripts: {},
  }
}

describe('Agent observation session (integration)', () => {
  afterEach(() => {
    resetTransformerWatchBridgeForTests()
    resetTransformerTraceBridgeForTests()
  })

  it('records api.watch labels on the timeline when observation run is active', async () => {
    const host = await createLogicVerificationHost({
      world: watchProbeWorld(),
      dt: 1 / 60,
      warmupSteps: 5,
    })

    host.registerObservationProbes([
      { id: 'pose', kind: 'entityPose', entityId: 'probe', intervalMs: 1000 },
    ])
    host.startObservationRun()

    host.runSteps(10)

    const timeline = host.getObservationTimeline()
    expect(timeline.length).toBeGreaterThan(0)
    const withWatch = timeline.filter((row) => row.rows.z !== undefined)
    expect(withWatch.length).toBeGreaterThan(0)
    expect(typeof withWatch[0]!.rows.z).toBe('string')

    host.dispose()
  })
})
