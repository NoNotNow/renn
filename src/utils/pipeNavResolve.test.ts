import { describe, it, expect } from 'vitest'
import type { RennWorld } from '@/types/world'
import {
  resolveFocusedPipeId,
  resolvePipeNavView,
  resolveSelectedFlatStackIndex,
  drillIntoPipePath,
  isPipeNavLeafLevel,
  stackSiblingInsertIndexFromPath,
} from './pipeNavResolve'

describe('pipeNavResolve', () => {
  const world: RennWorld = {
    version: '1',
    world: {},
    entities: [
      {
        id: 'e1',
        name: 'Car',
        transformers: ['s1', 's2'],
        transformerPipeStack: [{ pipeId: 'p1' }, { pipeId: 'p2' }],
      },
    ],
    transformers: {
      s1: { type: 'input' },
      s2: { type: 'car2' },
    },
    transformerPipes: {
      p1: {
        id: 'p1',
        name: 'Pipe One',
        stageIds: ['s1', 's2'],
        stages: [{ type: 'input' }, { type: 'car2' }],
        members: [
          { kind: 'stage', stageId: 's1' },
          { kind: 'stage', stageId: 's2' },
        ],
      },
      p2: {
        id: 'p2',
        name: 'Pipe Two',
        stageIds: ['s2'],
        stages: [{ type: 'car2' }],
      },
    },
  }

  it('shows pipe siblings at entity root when stack exists', () => {
    const view = resolvePipeNavView(world, world.entities[0]!, { path: [], selectedSiblingIndex: 0 })
    expect(view.mode).toBe('pipe_siblings')
    expect(view.items).toHaveLength(2)
  })

  it('shows stages inside focused pipe', () => {
    const view = resolvePipeNavView(world, world.entities[0]!, {
      path: [{ kind: 'stack', index: 0 }],
      selectedSiblingIndex: 0,
    })
    expect(view.mode).toBe('pipe_members')
    expect(view.items[0]?.kind).toBe('stage')
    expect(view.items[0]?.kind === 'stage' ? view.items[0].stageId : '').toBe('s1')
  })

  it('drills into stack pipe', () => {
    const path = drillIntoPipePath(world, world.entities[0]!, [], 0, 'pipe', 'p1')
    expect(path).toEqual([{ kind: 'stack', index: 0 }])
  })

  it('stage leaf path focuses parent pipe and shows all members', () => {
    const stageLeafPath = [
      { kind: 'stack' as const, index: 0 },
      { kind: 'member' as const, pipeId: 'p1', memberIndex: 1 },
    ]
    expect(resolveFocusedPipeId(world, world.entities[0]!, stageLeafPath)).toBe('p1')
    const view = resolvePipeNavView(world, world.entities[0]!, {
      path: stageLeafPath,
      selectedSiblingIndex: 1,
    })
    expect(view.mode).toBe('pipe_members')
    expect(view.items).toHaveLength(2)
    expect(view.items[1]?.kind).toBe('stage')
    expect(view.items[1]?.kind === 'stage' ? view.items[1].stageId : '').toBe('s2')
  })

  it('detects leaf level inside a stage-only pipe', () => {
    const view = resolvePipeNavView(world, world.entities[0]!, {
      path: [{ kind: 'stack', index: 0 }],
      selectedSiblingIndex: 0,
    })
    expect(isPipeNavLeafLevel(view)).toBe(true)
  })

  it('computes stack sibling insert index from nav path', () => {
    expect(stackSiblingInsertIndexFromPath([{ kind: 'stack', index: 0 }])).toBe(1)
    expect(stackSiblingInsertIndexFromPath([])).toBeUndefined()
  })

  it('resolves distinct flat stack indices for duplicate linked pipes with the same stage id', () => {
    const dupWorld: RennWorld = {
      version: '1',
      world: {},
      entities: [
        {
          id: 'e1',
          transformers: ['s1', 's1'],
          transformerPipeStack: [{ pipeId: 'root' }, { pipeId: 'root' }],
        },
      ],
      transformers: {
        s1: { type: 'custom', code: 'api.watch(params)' },
      },
      transformerPipes: {
        root: {
          id: 'root',
          name: 'Pipe1',
          stageIds: ['s1'],
          stages: [],
          members: [{ kind: 'stage', stageId: 's1' }],
        },
      },
    }
    const entity = dupWorld.entities[0]!
    const focus0 = { path: [{ kind: 'stack' as const, index: 0 }], selectedSiblingIndex: 0 }
    const focus1 = { path: [{ kind: 'stack' as const, index: 1 }], selectedSiblingIndex: 0 }
    const view0 = resolvePipeNavView(dupWorld, entity, focus0)
    const view1 = resolvePipeNavView(dupWorld, entity, focus1)

    expect(resolveSelectedFlatStackIndex(dupWorld, entity, focus0, view0, 's1')).toBe(0)
    expect(resolveSelectedFlatStackIndex(dupWorld, entity, focus1, view1, 's1')).toBe(1)
  })
})
