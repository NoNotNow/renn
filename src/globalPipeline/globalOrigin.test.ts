import { describe, expect, it } from 'vitest'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { RennWorld } from '@/types/world'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { updateWorldFromGlobalLibrary } from '@/globalPipeline/globalOrigin'
import { resolveEntityStageRuntime } from '@/utils/pipeStageResolve'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'

const lib = (code: string, members = ['a', 'b']): GlobalBehaviorLibrary =>
  ({
    transformers: {
      a: { type: 'custom', name: 'A', code },
      b: { type: 'custom', name: 'B', code: 'b1' },
      c: { type: 'custom', name: 'C', code: 'c1' },
    },
    scripts: {},
    transformerPipes: {
      p: { id: 'p', name: 'P', stageIds: members, stages: [], members: members.map((m) => ({ kind: 'stage', stageId: m })) },
    },
  }) as unknown as GlobalBehaviorLibrary

const project = (): RennWorld => ({ version: '1', world: {}, entities: [{ id: 'e1', name: 'E', transformers: [] }, { id: 'e2', name: 'E2', transformers: [] }] }) as RennWorld

function consumer(library: GlobalBehaviorLibrary): RennWorld {
  let w = copyGlobalPipeIntoWorld(project(), library, 'p')
  w = assignPipeToEntity(w, 'e1', w.transformerPipes!.p!, 'linked')
  return assignPipeToEntity(w, 'e2', w.transformerPipes!.p!, 'linked')
}

describe('library fixes reach project copies', () => {
  it('copies remember their origin', () => {
    const w = consumer(lib('a1'))
    expect(w.transformers!.a!.origin?.globalId).toBe('a')
    expect(w.transformerPipes!.p!.origin?.globalId).toBe('p')
  })

  it('updates the code of an unmodified stage in every consumer (params stay local)', () => {
    let w = consumer(lib('a1'))
    w = { ...w, transformers: { ...w.transformers, a: { ...w.transformers!.a!, params: { gain: 3 } } } }
    const { world, report } = updateWorldFromGlobalLibrary(w, lib('a2 FIXED'))
    expect(report.updatedStages).toEqual(['a'])
    expect(world.transformers!.a!.code).toBe('a2 FIXED')
    expect(world.transformers!.a!.params).toEqual({ gain: 3 })
    // both entities run the fixed code (they share the registry stage)
    for (const id of ['e1', 'e2']) {
      const e = world.entities.find((x) => x.id === id)!
      expect(resolveEntityStageRuntime(world, e).runtimeConfigs()!.map((c) => c.code)).toEqual(['a2 FIXED', 'b1'])
    }
    // idempotent
    expect(updateWorldFromGlobalLibrary(world, lib('a2 FIXED')).world).toBe(world)
  })

  it('leaves a locally edited stage alone and reports it', () => {
    let w = consumer(lib('a1'))
    w = { ...w, transformers: { ...w.transformers, a: { ...w.transformers!.a!, code: 'my local tweak' } } }
    const { world, report } = updateWorldFromGlobalLibrary(w, lib('a2'))
    expect(report.updatedStages).toEqual([])
    expect(report.divergedStages).toEqual(['a'])
    expect(world.transformers!.a!.code).toBe('my local tweak')
  })

  it('applies a restructured pipe: new stage arrives, removed stage leaves the consumers', () => {
    const w = consumer(lib('a1'))
    const { world, report } = updateWorldFromGlobalLibrary(w, lib('a1', ['a', 'c']))
    expect(report.updatedPipes).toEqual(['p'])
    expect(world.transformers!.c).toBeDefined()
    for (const id of ['e1', 'e2']) {
      expect(world.entities.find((x) => x.id === id)!.transformers).toEqual(['a', 'c'])
    }
  })

  it('adopts old copies (same id and code as the library) so later fixes reach them', () => {
    const l = lib('a1')
    const old: RennWorld = {
      ...project(),
      transformers: { a: { type: 'custom', name: 'A', code: 'a1' }, b: { type: 'custom', name: 'B', code: 'b1' } },
      transformerPipes: { p: { id: 'p', name: 'P', stageIds: ['a', 'b'], stages: [], members: [{ kind: 'stage', stageId: 'a' }, { kind: 'stage', stageId: 'b' }] } },
    } as RennWorld
    const adopted = updateWorldFromGlobalLibrary(old, l).world
    expect(adopted.transformers!.a!.origin).toBeDefined()
    expect(updateWorldFromGlobalLibrary(adopted, lib('a2')).world.transformers!.a!.code).toBe('a2')
  })
})
