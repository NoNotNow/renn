import { describe, expect, it } from 'vitest'
import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { AV_GLOBAL_STACK_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'
import { setBindingParams, setBindingScopeParams } from '@/utils/pipeNavMutations'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'

/**
 * Param layering guard: the AV preset (published by av-ego as `av.preset`, merged by every stage) is the LOWEST layer.
 * Explicit params of the pipe binding, a nested-pipe scope and a single stage must each beat it.
 * Probe: preset 'chaser-evasion' sets `obstacleSlowRadius: 1` (speed planner), so boxes ~1.7 m beside the lane do not slow the car;
 * an explicit radius of 5 does. Mean speed past the boxes tells which layer won.
 */
const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())
const SPEED_STAGE = 'global_av_speed_planner'
/** Scope of the local-planner nested pipe (stack > autopilot[1] > plan[1]), which contains the speed planner. */
const PLAN_LOCAL_SCOPE = 'stack:0/member:global_av_stack:1/member:global_av_autopilot:1/member:global_av_plan:1'

const box = (id: string, x: number, z: number) => ({
  id,
  bodyType: 'static',
  shape: { type: 'box', width: 3, height: 3, depth: 3 },
  position: [x, 1.5, z],
  rotation: [0, 0, 0],
})

type Layer = 'none' | 'binding' | 'scope' | 'stage'

function worldWith(layer: Layer, preset: string | undefined): RennWorld {
  let world = {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities: [
      { id: 'floor', bodyType: 'static', shape: { type: 'box', width: 1200, height: 1, depth: 1200 }, position: [0, -0.5, 0], rotation: [0, 0, 0] },
      { id: 'buggy', bodyType: 'dynamic', shape: { type: 'box', width: 2, height: 1, depth: 4 }, position: [0, 0.55, 5], rotation: [0, 0, 0], mass: 2, friction: 0.8 },
      box('a', 3.2, -40), box('b', -3.2, -70), box('c', 3.2, -100), box('d', -3.2, -130),
    ],
  } as unknown as RennWorld
  world = copyGlobalPipeIntoWorld(world, library, AV_GLOBAL_STACK_PIPE_ID)
  world = assignPipeToEntity(world, 'buggy', world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!, 'linked')
  world.transformers!.global_av_mission!.params = { waypoints: [[0, -500]], acceptRadius: 9, mode: 'stop' }
  // bare binding (no pipe-def defaults, which would themselves be "explicit" and mask the preset)
  const base: Record<string, unknown> = { cruiseSpeed: 14, minSpeed: 4, obstacleSlowFactor: 0.2, ...(preset ? { preset } : {}) }
  if (layer === 'binding') base.obstacleSlowRadius = 5
  world = setBindingParams(world, 'buggy', 0, base)
  if (layer === 'scope') world = setBindingScopeParams(world, 'buggy', 0, scopePath(), { obstacleSlowRadius: 5 })
  if (layer === 'stage') world.transformers![SPEED_STAGE] = { ...world.transformers![SPEED_STAGE]!, params: { obstacleSlowRadius: 5 } }
  return world
}

function scopePath() {
  return PLAN_LOCAL_SCOPE.split('/').map((s) => {
    const [kind, a, b] = s.split(':')
    return kind === 'stack' ? { kind: 'stack' as const, index: Number(a) } : { kind: 'member' as const, pipeId: a!, memberIndex: Number(b) }
  })
}

const baselineCache = new Map<string, Promise<number>>()
const cached = (key: string, make: () => RennWorld) => {
  if (!baselineCache.has(key)) baselineCache.set(key, meanSpeed(make()))
  return baselineCache.get(key)!
}

async function meanSpeed(world: RennWorld): Promise<number> {
  setAgentObservationWatchActive(true)
  const sim = await WorldSimulator.create(world, 15)
  try {
    let sum = 0
    let n = 0
    for (let f = 0; f < 720; f++) {
      sim.runFrames(1)
      if (f < 240) continue
      const v = sim.getVelocity('buggy')
      sum += Math.hypot(v[0], v[2])
      n++
    }
    return sum / n
  } finally {
    sim.dispose()
    setAgentObservationWatchActive(false)
  }
}

describe('AV stack: explicit params beat the preset layer', () => {
  it('the preset alone applies (radius 1: boxes beside the lane do not slow the car); no preset = stock radius 5 slows', async () => {
    const presetOnly = await cached('preset', () => worldWith('none', 'chaser-evasion'))
    const stock = await cached('stock', () => worldWith('none', undefined))
    expect(presetOnly).toBeGreaterThan(stock * 1.12)
  }, 60_000)

  it.each(['binding', 'scope', 'stage'] as const)('a %s-level param beats the preset value', async (layer) => {
    const presetOnly = await cached('preset', () => worldWith('none', 'chaser-evasion'))
    const explicit = await meanSpeed(worldWith(layer, 'chaser-evasion'))
    const stock = await cached('stock', () => worldWith('none', undefined))
    // with the explicit radius the car behaves like the stock one (slowed), not like the preset-only one
    expect(explicit).toBeLessThan(presetOnly * 0.92)
    expect(Math.abs(explicit - stock)).toBeLessThan(presetOnly - stock)
  }, 60_000)
})
