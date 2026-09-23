import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getTransformerWatchEntries,
  setAgentObservationWatchActive,
} from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'

const umlenkerCode = readFileSync(
  resolve(process.cwd(), 'tools/renn-mcp/patches/umlenker-v3.js'),
  'utf8',
)

function worldWithWallAhead(): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities: [
      {
        id: 'car',
        name: 'Follower',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 2, height: 1, depth: 4 },
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        mass: 2,
        transformers: ['tf_target', 'tf_umlenker', 'tf_car'],
        transformerPipeStack: [{ pipeId: 'p1', enabled: true, params: { id: 'goal' } }],
      },
      {
        id: 'goal',
        name: 'Goal',
        bodyType: 'kinematic',
        shape: { type: 'box', width: 2, height: 1, depth: 2 },
        position: [0, 0.5, -40],
        rotation: [0, 0, 0],
      },
      {
        id: 'wall',
        name: 'Wall',
        bodyType: 'static',
        shape: { type: 'box', width: 8, height: 4, depth: 2 },
        position: [0, 1, -12],
        rotation: [0, 0, 0],
      },
    ],
    transformers: {
      tf_target: {
        type: 'custom',
        priority: 0,
        enabled: true,
        params: { id: 'goal' },
        name: 'Target',
        code: `function transform(input, dt, params, state, api) {
  var p = api.getWorldPosition(params.id)
  if (!p) return {}
  input.target = { pose: { position: p }, id: params.id }
  return {}
}`,
      },
      tf_umlenker: {
        type: 'custom',
        priority: 1,
        enabled: true,
        params: { id: 'goal' },
        name: 'Umlenker',
        code: umlenkerCode,
      },
      tf_car: {
        type: 'car2',
        priority: 2,
        enabled: true,
        params: { power: 400, steeringIntensity: 0.1, steeringSpeed: 0.5, lateralGrip: 100 },
      },
    },
    transformerPipes: {
      p1: {
        id: 'p1',
        name: 'p1',
        stageIds: ['tf_target', 'tf_umlenker', 'tf_car'],
        stages: [],
        members: [
          { kind: 'stage', stageId: 'tf_target' },
          { kind: 'stage', stageId: 'tf_umlenker' },
          { kind: 'stage', stageId: 'tf_car' },
        ],
      },
    },
  }
}

function watchLabelValue(label: string): string | undefined {
  for (const entry of getTransformerWatchEntries().values()) {
    if (entry.label === label) return entry.value
  }
  return undefined
}

function worldFollowIdDoesNotSnapTarget(): RennWorld {
  const base = worldWithWallAhead()
  base.entities[0].position = [0, 0.5, 20]
  base.entities = base.entities.filter((e) => e.id !== 'wall')
  const transformers = base.transformers!
  const pipes = base.transformerPipes!
  transformers.tf_target.code = `function transform(input, dt, params, state, api) {
  input.target = { pose: { position: { x: -30, y: 0.5, z: 20 } } }
  return {}
}`
  transformers.tf_probe = {
    type: 'custom',
    priority: 2,
    enabled: true,
    name: 'Probe',
    code: `function transform(input, dt, params, state, api) {
  api.watch('test.targetX', input.target.pose.position.x)
  return {}
}`,
  }
  transformers.tf_car.priority = 3
  base.entities[0].transformers = ['tf_target', 'tf_umlenker', 'tf_probe', 'tf_car']
  const pipe = pipes.p1
  pipe.stageIds = ['tf_target', 'tf_umlenker', 'tf_probe', 'tf_car']
  pipe.members = pipe.stageIds.map((stageId) => ({ kind: 'stage', stageId }))
  return base
}

describe('Umlenker obstacle raycast (integration)', () => {
  it('does not snap input.target to params.id follow entity when path is clear', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(worldFollowIdDoesNotSnapTarget(), 0)
    try {
      sim.runFrames(2)
      expect(watchLabelValue('test.targetX')).toBe('-30')
      expect(watchLabelValue('uml.frontHit')).toBe('0')
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  })

  it('detects wall ahead and sets maneuver watch', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(worldWithWallAhead(), 0)
    try {
      sim.runFrames(3)
      expect(watchLabelValue('uml.frontHit')).toBe('1')
      expect(Number(watchLabelValue('uml.frontDist'))).toBeGreaterThan(1.2)
      expect(watchLabelValue('uml.frontEnt')).toBe('wall')
      expect(watchLabelValue('uml.maneuver')).toBe('1')
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  })
})
