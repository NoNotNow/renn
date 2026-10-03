import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import { assignLibraryPipeToEntity } from './assignLibraryPipe'

const world: RennWorld = {
  version: '1',
  world: {},
  entities: [{ id: 'e1', name: 'Buggy', transformers: [] }],
}
const lib = {
  transformers: { a: { type: 'custom', name: 'A', code: '' }, b: { type: 'custom', name: 'B', code: '' } },
  transformerPipes: {
    outer: { id: 'outer', name: 'Outer', stageIds: [], stages: [], members: [{ kind: 'pipe', pipeId: 'inner' }, { kind: 'stage', stageId: 'b' }] },
    inner: { id: 'inner', name: 'Inner', stageIds: ['a'], stages: [], members: [{ kind: 'stage', stageId: 'a' }] },
  },
} as unknown as GlobalBehaviorLibrary

describe('assignLibraryPipeToEntity', () => {
  it('copies a global pipe tree into the project and links it', () => {
    const res = assignLibraryPipeToEntity(world, 'e1', 'global', 'outer', 'linked', lib)!
    expect(Object.keys(res.world.transformerPipes!).sort()).toEqual(['inner', 'outer'])
    const e = res.world.entities[0]!
    expect(e.transformerPipeStack?.[0]?.pipeId).toBe('outer')
    expect([...(e.transformers ?? [])].sort()).toEqual(['a', 'b'])
    expect(res.focusPath).toEqual([{ kind: 'stack', index: 0 }])
  })

  it('appends to an existing stack and rejects unknown pipes', () => {
    const first = assignLibraryPipeToEntity(world, 'e1', 'global', 'inner', 'linked', lib)!
    const second = assignLibraryPipeToEntity(first.world, 'e1', 'global', 'outer', 'linked', lib)!
    expect(second.world.entities[0]!.transformerPipeStack).toHaveLength(2)
    expect(assignLibraryPipeToEntity(world, 'e1', 'global', 'nope', 'linked', lib)).toBeNull()
    expect(assignLibraryPipeToEntity(world, 'e1', 'project', 'nope', 'linked')).toBeNull()
  })
})
