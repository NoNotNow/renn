import { describe, expect, it } from 'vitest'
import type { RennWorld } from '@/types/world'
import { resolveEntityStageRuntime } from '@/utils/pipeStageResolve'
import { setParamValue } from '@/params/paramValue'
import { effectiveValues, layerChainTooltip, resolveEffectiveParams } from './effectiveParams'

/** stack:0 = outer pipe [inner pipe[stage s1, stage s2]]. */
const INNER_SCOPE = 'stack:0/member:outer:0'
const S1_SCOPE = `${INNER_SCOPE}/member:inner:0`

function makeWorld(over: {
  stageParams?: Record<string, unknown>
  binding?: Record<string, unknown>
  scopeParams?: Record<string, Record<string, unknown>>
}): RennWorld {
  return {
    version: '1.0',
    world: { gravity: [0, -10, 0] },
    transformers: {
      s1: { type: 'custom', name: 'Route planner', priority: 1, params: over.stageParams ?? {}, code: '' },
      s2: { type: 'custom', name: 'Other', priority: 2, params: { vehicleWidth: 2 }, code: '' },
    },
    transformerPipes: {
      outer: { id: 'outer', name: 'Outer', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'inner' }] },
      inner: {
        id: 'inner',
        name: 'Inner',
        stageIds: ['s1', 's2'],
        stages: [],
        members: [
          { kind: 'stage', stageId: 's1' },
          { kind: 'stage', stageId: 's2' },
        ],
      },
    },
    entities: [
      {
        id: 'car',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        transformers: ['s1', 's2'],
        transformerPipeStack: [{ pipeId: 'outer', params: over.binding, scopeParams: over.scopeParams }],
      },
    ],
  } as unknown as RennWorld
}

function layersFor(world: RennWorld, stageId: 's1' | 's2' = 's1') {
  const runtime = resolveEntityStageRuntime(world, world.entities[0]!)
  return { runtime, layers: runtime.paramLayersAt(stageId === 's1' ? 0 : 1)! }
}

describe('resolveEffectiveParams', () => {
  it('stage value alone: source is the stage and nothing is overridden', () => {
    const { layers } = layersFor(makeWorld({ stageParams: { vehicleWidth: 2 } }))
    const eff = resolveEffectiveParams(layers)
    expect(eff.vehicleWidth!.value).toBe(2)
    expect(eff.vehicleWidth!.source.kind).toBe('stage')
    expect(eff.vehicleWidth!.overridden).toBe(false)
  })

  it('pipe binding beats the stage value (the reported bug: stage 2, binding 4)', () => {
    const { layers } = layersFor(
      makeWorld({ stageParams: { vehicleWidth: 2, budget: 'full' }, binding: { vehicleWidth: 4, budget: 'eco' } }),
    )
    const eff = resolveEffectiveParams(layers)
    expect(eff.vehicleWidth).toMatchObject({ value: 4, overridden: true })
    expect(eff.vehicleWidth!.source.kind).toBe('binding')
    expect(eff.budget!.value).toBe('eco')
    expect(eff.vehicleWidth!.chain.map((c) => c.value)).toEqual([2, 4])
    expect(layerChainTooltip(eff.vehicleWidth!)).toContain('> ')
  })

  it('nested scope beats the binding, the stage member scope beats both', () => {
    const world = makeWorld({
      stageParams: { a: 1, b: 1, c: 1 },
      binding: { a: 2, b: 2, c: 2 },
      scopeParams: { [INNER_SCOPE]: { b: 3, c: 3 }, [S1_SCOPE]: { c: 4, tickEvery: 3 } },
    })
    const eff = resolveEffectiveParams(layersFor(world).layers)
    expect(eff.a!.source.kind).toBe('binding')
    expect(eff.b!.source).toMatchObject({ kind: 'scope', label: 'Inner', scopeKey: INNER_SCOPE })
    expect(eff.c!.source).toMatchObject({ kind: 'member', scopeKey: S1_SCOPE })
    expect(eff.tickEvery!.source.kind).toBe('member')
    expect(eff.c!.chain.map((x) => x.layer.kind)).toEqual(['stage', 'binding', 'scope', 'member'])
  })

  it('a stage member scope applies to that stage only', () => {
    const world = makeWorld({ scopeParams: { [S1_SCOPE]: { tickEvery: 3 } } })
    expect(resolveEffectiveParams(layersFor(world, 's1').layers).tickEvery!.value).toBe(3)
    expect(resolveEffectiveParams(layersFor(world, 's2').layers).tickEvery).toBeUndefined()
  })

  it('preset is the lowest layer, any other layer beats it', () => {
    const world = makeWorld({ stageParams: { x: 'stage' } })
    const eff = resolveEffectiveParams(layersFor(world).layers, { x: 'preset', y: 'preset' })
    expect(eff.x!.source.kind).toBe('stage')
    expect(eff.y!.source.kind).toBe('preset')
    expect(eff.y!.overridden).toBe(false)
  })

  it('reset (deleting the key at the winning layer) reveals the next layer down', () => {
    const world = makeWorld({ stageParams: { vehicleWidth: 2 }, binding: { vehicleWidth: 4 } })
    const layers = layersFor(world).layers
    const binding = layers.find((l) => l.kind === 'binding')!
    const reset = layers.map((l) => (l === binding ? { ...l, params: setParamValue(l.params, 'vehicleWidth', undefined) } : l))
    expect(resolveEffectiveParams(reset).vehicleWidth).toMatchObject({ value: 2, overridden: false })
  })

  it('equals the runtime merge exactly (shared layering, not a copy)', () => {
    const world = makeWorld({
      stageParams: { a: 1, k: 'stage' },
      binding: { a: 2 },
      scopeParams: { [INNER_SCOPE]: { b: 3 }, [S1_SCOPE]: { c: 4 } },
    })
    const { runtime, layers } = layersFor(world)
    expect(effectiveValues(resolveEffectiveParams(layers))).toEqual(runtime.mergedParamsAt(0))
    expect(
      runtime.paramLayersForMember([
        { kind: 'stack', index: 0 },
        { kind: 'member', pipeId: 'outer', memberIndex: 0 },
        { kind: 'member', pipeId: 'inner', memberIndex: 0 },
      ]),
    ).toBe(layers)
  })
})
