import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RennWorld } from '@/types/world'

const directionCode = readFileSync(
  resolve(process.cwd(), 'tools/renn-mcp/patches/direction-v3.js'),
  'utf8',
)

/** Minimal world: car drives toward wall; direction should trigger short back-off. */
export function buildDirectionBackoffWorld(): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities: [
      {
        id: 'ground',
        name: 'Ground',
        bodyType: 'static',
        shape: { type: 'box', width: 40, height: 1, depth: 40 },
        position: [0, -0.5, 0],
        rotation: [0, 0, 0],
      },
      {
        id: 'car',
        name: 'Follower',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 2, height: 1, depth: 4 },
        position: [0, 0.55, -2.8],
        rotation: [0, 0, 0],
        mass: 2,
        friction: 0.8,
        transformers: ['tf_target', 'tf_direction', 'tf_car'],
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
        position: [0, 1, -5.2],
        rotation: [0, 0, 0],
      },
    ],
    transformers: {
      tf_target: {
        type: 'custom',
        priority: 0,
        enabled: true,
        name: 'Target',
        params: { id: 'goal' },
        code: `function transform(input, dt, params, state, api) {
  var p = api.getWorldPosition(params.id)
  if (!p) return {}
  input.target = { pose: { position: p } }
  return {}
}`,
      },
      tf_direction: {
        type: 'custom',
        priority: 1,
        enabled: true,
        name: 'direction',
        code: directionCode,
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
        stageIds: ['tf_target', 'tf_direction', 'tf_car'],
        stages: [],
        members: [
          { kind: 'stage', stageId: 'tf_target' },
          { kind: 'stage', stageId: 'tf_direction' },
          { kind: 'stage', stageId: 'tf_car' },
        ],
      },
    },
  }
}
