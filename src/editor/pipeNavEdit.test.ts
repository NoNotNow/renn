import { describe, it, expect } from 'vitest'
import type { PipeNavEditContext, PipeNavEditIntent } from './pipeNavEdit'
import { PIPE_NAV_EDIT_POLICY, resolvePipeNavEdit } from './pipeNavEdit'
import type { PipeTreeNode } from '@/types/pipeNav'
import type { RennWorld } from '@/types/world'

const INTENT_KINDS: PipeNavEditIntent['kind'][] = [
  'createPipe',
  'createChildPipe',
  'addExistingPipe',
  'renamePipe',
  'togglePipeEnabled',
  'editPipeParams',
  'decouplePipeBinding',
  'treeDelete',
  'treeInsert',
  'treeDrop',
  'ensurePipeStack',
]

function makePrompts(options?: { confirmResult?: boolean }) {
  const confirmed: string[] = []
  const warned: string[] = []
  const confirmResult = options?.confirmResult ?? true
  const prompts = {
    confirm: (message: string) => {
      confirmed.push(message)
      return confirmResult
    },
    warn: (message: string) => {
      warned.push(message)
    },
  }
  return { prompts, confirmed, warned }
}

function twoPipeStackWorld(): RennWorld {
  return {
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
}

function sharedPipeWorld(): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [
      {
        id: 'e1',
        name: 'Car A',
        transformers: ['s1'],
        transformerPipeStack: [{ pipeId: 'p1' }],
      },
      {
        id: 'e2',
        name: 'Car B',
        transformers: ['s1'],
        transformerPipeStack: [{ pipeId: 'p1' }],
      },
    ],
    transformers: {
      s1: { type: 'input' },
    },
    transformerPipes: {
      p1: {
        id: 'p1',
        name: 'Shared',
        stageIds: ['s1'],
        stages: [{ type: 'input' }],
        paramDefs: [{ key: 'speed', type: 'number', default: 1 }],
      },
    },
  }
}

function nestedPipeWorld(): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [
      {
        id: 'e1',
        transformers: ['s1', 's2'],
        transformerPipeStack: [{ pipeId: 'outer' }],
      },
    ],
    transformers: {
      s1: { type: 'input' },
      s2: { type: 'car2' },
    },
    transformerPipes: {
      outer: {
        id: 'outer',
        name: 'Outer',
        stageIds: ['s1'],
        stages: [{ type: 'input' }],
        members: [
          { kind: 'stage', stageId: 's1' },
          { kind: 'pipe', pipeId: 'inner' },
        ],
      },
      inner: {
        id: 'inner',
        name: 'Inner',
        stageIds: ['s2'],
        stages: [{ type: 'car2' }],
        members: [{ kind: 'stage', stageId: 's2' }],
      },
      donor: {
        id: 'donor',
        name: 'Donor',
        stageIds: ['s2'],
        stages: [{ type: 'car2' }],
        members: [{ kind: 'stage', stageId: 's2' }],
      },
    },
  }
}

function makeCtx(overrides?: Partial<PipeNavEditContext>): PipeNavEditContext {
  const { prompts } = makePrompts()
  return {
    world: twoPipeStackWorld(),
    entityId: 'e1',
    focus: { path: [], selectedSiblingIndex: 0 },
    prompts,
    ...overrides,
  }
}

describe('resolvePipeNavEdit', () => {
  describe('PIPE_NAV_EDIT_POLICY', () => {
    it.each(INTENT_KINDS.map((kind) => ({ kind })))(
      'declares pushUndo policy for $kind',
      ({ kind }) => {
        expect(PIPE_NAV_EDIT_POLICY[kind]).toBeDefined()
        expect(typeof PIPE_NAV_EDIT_POLICY[kind].pushUndo).toBe('boolean')
      },
    )

    it('covers exactly the intent kinds in the union', () => {
      expect(Object.keys(PIPE_NAV_EDIT_POLICY).sort()).toEqual([...INTENT_KINDS].sort())
    })

    it('only ensurePipeStack opts out of undo', () => {
      const noUndo = INTENT_KINDS.filter((kind) => !PIPE_NAV_EDIT_POLICY[kind].pushUndo)
      expect(noUndo).toEqual(['ensurePipeStack'])
    })
  })

  describe('no-op contract', () => {
    it.each([
      {
        name: 'unknown entityId',
        ctx: () => makeCtx({ entityId: 'missing' }),
        intent: (): PipeNavEditIntent => ({ kind: 'renamePipe', name: 'X' }),
      },
      {
        name: 'togglePipeEnabled without address',
        ctx: () => makeCtx(),
        intent: (): PipeNavEditIntent => ({ kind: 'togglePipeEnabled' }),
      },
      {
        name: 'togglePipeEnabled with negative stackIndex',
        ctx: () => makeCtx(),
        intent: (): PipeNavEditIntent => ({ kind: 'togglePipeEnabled', stackIndex: -1 }),
      },
      {
        name: 'editPipeParams without stackIndex or scopePath',
        ctx: () => makeCtx(),
        intent: (): PipeNavEditIntent => ({
          kind: 'editPipeParams',
          mode: 'merge',
          key: 'speed',
          value: 9,
        }),
      },
      {
        name: 'renamePipe when focus path resolves to no pipe',
        ctx: () => makeCtx({ focus: { path: [], selectedSiblingIndex: 0 } }),
        intent: (): PipeNavEditIntent => ({ kind: 'renamePipe', name: 'Renamed' }),
      },
      {
        name: 'ensurePipeStack when entity already has a pipe stack',
        ctx: () => makeCtx(),
        intent: (): PipeNavEditIntent => ({ kind: 'ensurePipeStack' }),
      },
    ])('$name returns null', ({ ctx, intent }) => {
      expect(resolvePipeNavEdit(intent(), ctx())).toBeNull()
    })

    it('treeDelete returns null and does not mutate world when confirm is declined', () => {
      const world = twoPipeStackWorld()
      const worldBefore = structuredClone(world)
      const { prompts } = makePrompts({ confirmResult: false })
      const ctx = makeCtx({
        world,
        focus: { path: [{ kind: 'stack', index: 0 }], selectedSiblingIndex: 0 },
        prompts,
      })
      const node: PipeTreeNode = {
        kind: 'stack_pipe',
        pipeId: 'p1',
        stackIndex: 0,
        label: 'Pipe One',
      }

      expect(resolvePipeNavEdit({ kind: 'treeDelete', node }, ctx)).toBeNull()
      expect(ctx.world).toEqual(worldBefore)
    })

    it('decouplePipeBinding returns null when confirm is declined', () => {
      const { prompts } = makePrompts({ confirmResult: false })
      const ctx = makeCtx({ world: sharedPipeWorld(), prompts })

      expect(
        resolvePipeNavEdit({ kind: 'decouplePipeBinding', stackIndex: 0 }, ctx),
      ).toBeNull()
    })

    it('treeDrop of member_stage onto entity warns and returns null', () => {
      const { prompts, warned } = makePrompts()
      const world = twoPipeStackWorld()
      const ctx = makeCtx({ world, prompts })
      const drag: PipeTreeNode = {
        kind: 'member_stage',
        pipeId: 'p1',
        parentPipeId: 'p1',
        memberIndex: 0,
        stageId: 's1',
        label: 'Input',
      }
      const drop: PipeTreeNode = { kind: 'entity', entityId: 'e1', label: 'Car' }

      expect(resolvePipeNavEdit({ kind: 'treeDrop', drag, drop }, ctx)).toBeNull()
      expect(warned).toEqual(['Stages must live inside a pipe.'])
    })

    it('treeDrop nesting a pipe into its own descendant warns and returns null', () => {
      const { prompts, warned } = makePrompts()
      const ctx = makeCtx({ world: nestedPipeWorld(), prompts })
      const drag: PipeTreeNode = {
        kind: 'stack_pipe',
        pipeId: 'outer',
        stackIndex: 0,
        label: 'Outer',
      }
      const drop: PipeTreeNode = {
        kind: 'member_pipe',
        pipeId: 'inner',
        parentPipeId: 'outer',
        memberIndex: 1,
        label: 'Inner',
      }

      expect(resolvePipeNavEdit({ kind: 'treeDrop', drag, drop }, ctx)).toBeNull()
      expect(warned).toEqual(['Cannot nest a pipe inside its own descendant.'])
    })

    it.each([
      {
        name: 'member_pipe same parent and memberIndex',
        world: () => nestedPipeWorld(),
        drag: (): PipeTreeNode => ({
          kind: 'member_pipe',
          pipeId: 'inner',
          parentPipeId: 'outer',
          memberIndex: 1,
          label: 'Inner',
        }),
        drop: (): PipeTreeNode => ({
          kind: 'member_pipe',
          pipeId: 'inner',
          parentPipeId: 'outer',
          memberIndex: 1,
          label: 'Inner',
        }),
      },
      {
        name: 'stack_pipe same stackIndex',
        world: () => twoPipeStackWorld(),
        drag: (): PipeTreeNode => ({
          kind: 'stack_pipe',
          pipeId: 'p1',
          stackIndex: 0,
          label: 'Pipe One',
        }),
        drop: (): PipeTreeNode => ({
          kind: 'stack_pipe',
          pipeId: 'p1',
          stackIndex: 0,
          label: 'Pipe One',
        }),
      },
    ])('treeDrop at same position ($name) returns null', ({ world, drag, drop }) => {
      const ctx = makeCtx({ world: world() })
      expect(resolvePipeNavEdit({ kind: 'treeDrop', drag: drag(), drop: drop() }, ctx)).toBeNull()
    })
  })

  describe('nav reconciliation', () => {
    it.each([
      {
        name: 'focus on the now-dangling last index falls back to the entity root',
        focusPath: [{ kind: 'stack' as const, index: 1 }],
        deleteStackIndex: 0,
        expectedPath: [],
      },
      {
        name: 'focus on a still-valid index is kept',
        focusPath: [{ kind: 'stack' as const, index: 0 }],
        deleteStackIndex: 1,
        expectedPath: [{ kind: 'stack' as const, index: 0 }],
      },
    ])('treeDelete of a stack pipe: $name', ({ focusPath, deleteStackIndex, expectedPath }) => {
      const { prompts } = makePrompts()
      const ctx = makeCtx({ focus: { path: focusPath, selectedSiblingIndex: 0 }, prompts })
      const node: PipeTreeNode = {
        kind: 'stack_pipe',
        pipeId: deleteStackIndex === 0 ? 'p1' : 'p2',
        stackIndex: deleteStackIndex,
        label: 'Doomed',
      }

      const result = resolvePipeNavEdit({ kind: 'treeDelete', node }, ctx)
      expect(result).not.toBeNull()
      expect(result!.world.entities[0]?.transformerPipeStack).toHaveLength(1)
      expect(result!.nav!.path).toEqual(expectedPath)
    })

    it('treeInsert returns nav pointing at the newly inserted stack pipe', () => {
      const singleStackWorld: RennWorld = {
        version: '1',
        world: {},
        entities: [
          {
            id: 'e1',
            transformers: ['s1'],
            transformerPipeStack: [{ pipeId: 'p1', enabled: true }],
          },
        ],
        transformers: { s1: { type: 'input' } },
        transformerPipes: {
          p1: {
            id: 'p1',
            name: 'Pipe1',
            stageIds: ['s1'],
            stages: [{ type: 'input' }],
            members: [{ kind: 'stage', stageId: 's1' }],
          },
        },
      }
      const ctx = makeCtx({ world: singleStackWorld })

      const result = resolvePipeNavEdit(
        {
          kind: 'treeInsert',
          name: 'Pipe2',
          placement: { parentPath: [], placement: 'stack_sibling', insertIndex: 1 },
        },
        ctx,
      )

      expect(result).not.toBeNull()
      expect(result!.nav!.path).toEqual([{ kind: 'stack', index: 1 }])
      expect(result!.nav!.path).not.toEqual([])
    })

    it.each([
      {
        name: 'createPipe',
        intent: (): PipeNavEditIntent => ({ kind: 'createPipe', name: 'New Pipe' }),
        ctx: () => makeCtx({ focus: { path: [], selectedSiblingIndex: 0 } }),
      },
      {
        name: 'createChildPipe',
        intent: (): PipeNavEditIntent => ({ kind: 'createChildPipe', name: 'Child Pipe' }),
        ctx: () =>
          makeCtx({
            world: nestedPipeWorld(),
            focus: { path: [{ kind: 'stack', index: 0 }], selectedSiblingIndex: 0 },
          }),
      },
      {
        name: 'addExistingPipe',
        intent: (): PipeNavEditIntent => ({
          kind: 'addExistingPipe',
          pipe: nestedPipeWorld().transformerPipes!.donor!,
          mode: 'linked',
        }),
        ctx: () =>
          makeCtx({
            world: nestedPipeWorld(),
            focus: { path: [{ kind: 'stack', index: 0 }], selectedSiblingIndex: 0 },
          }),
      },
    ])('$name returns nav with selectedSiblingIndex 0', ({ intent, ctx }) => {
      const result = resolvePipeNavEdit(intent(), ctx())
      expect(result).not.toBeNull()
      expect(result!.nav!.selectedSiblingIndex).toBe(0)
    })
  })

  describe('writes happen', () => {
    it('renamePipe changes the pipe name in transformerPipes', () => {
      const ctx = makeCtx({
        focus: { path: [{ kind: 'stack', index: 0 }], selectedSiblingIndex: 0 },
      })

      const result = resolvePipeNavEdit({ kind: 'renamePipe', name: 'Renamed Pipe' }, ctx)
      expect(result).not.toBeNull()
      expect(result!.world.transformerPipes?.p1?.name).toBe('Renamed Pipe')
    })

    it('togglePipeEnabled flips a stack binding enabled flag', () => {
      const world: RennWorld = {
        ...twoPipeStackWorld(),
        entities: [
          {
            id: 'e1',
            transformers: ['s1', 's2'],
            transformerPipeStack: [
              { pipeId: 'p1', enabled: true },
              { pipeId: 'p2', enabled: true },
            ],
          },
        ],
      }
      const ctx = makeCtx({ world })

      const result = resolvePipeNavEdit({ kind: 'togglePipeEnabled', stackIndex: 0 }, ctx)
      expect(result).not.toBeNull()
      expect(result!.world.entities[0]?.transformerPipeStack?.[0]?.enabled).toBe(false)
    })

    it.each([
      {
        name: 'merge keeps sibling param keys',
        mode: 'merge' as const,
        expectParams: { speed: 9, boost: true },
      },
      {
        name: 'replace drops sibling param keys',
        mode: 'replace' as const,
        expectParams: { speed: 9 },
      },
    ])('editPipeParams $name', ({ mode, expectParams }) => {
      const world: RennWorld = {
        ...twoPipeStackWorld(),
        entities: [
          {
            id: 'e1',
            transformers: ['s1', 's2'],
            transformerPipeStack: [
              { pipeId: 'p1', params: { speed: 1, boost: true } },
              { pipeId: 'p2' },
            ],
          },
        ],
      }
      const ctx = makeCtx({ world })

      const result = resolvePipeNavEdit(
        { kind: 'editPipeParams', mode, stackIndex: 0, params: { speed: 9 } },
        ctx,
      )

      expect(result).not.toBeNull()
      expect(result!.world.entities[0]?.transformerPipeStack?.[0]?.params).toEqual(expectParams)
      expect(result!.syncEntityIds).toEqual(['e1'])
    })
  })

  describe('success paths', () => {
    it('ensurePipeStack wraps a bare transformer list into a first pipe', () => {
      const bareWorld: RennWorld = {
        version: '1',
        world: {},
        entities: [{ id: 'e1', name: 'Legacy', transformers: ['s1'] }],
        transformers: { s1: { type: 'input' } },
        transformerPipes: {},
      }
      const ctx = makeCtx({ world: bareWorld })

      const result = resolvePipeNavEdit({ kind: 'ensurePipeStack' }, ctx)
      expect(result).not.toBeNull()
      expect(result!.world.entities[0]?.transformerPipeStack).toHaveLength(1)
      expect(result!.nav).toBeDefined()
    })

    it('togglePipeEnabled disables a nested pipe member by member address', () => {
      const ctx = makeCtx({ world: nestedPipeWorld() })

      const result = resolvePipeNavEdit(
        { kind: 'togglePipeEnabled', memberParentPipeId: 'outer', memberIndex: 1 },
        ctx,
      )
      expect(result).not.toBeNull()
      expect(result!.world.transformerPipes?.outer?.members?.[1]?.enabled).toBe(false)
    })

    it('editPipeParams at a nested scopePath writes binding scopeParams, not binding params', () => {
      const ctx = makeCtx({ world: nestedPipeWorld() })
      const scopePath = [
        { kind: 'stack' as const, index: 0 },
        { kind: 'member' as const, pipeId: 'outer', memberIndex: 1 },
      ]

      const result = resolvePipeNavEdit(
        { kind: 'editPipeParams', mode: 'merge', scopePath, params: { speed: 9 } },
        ctx,
      )

      expect(result).not.toBeNull()
      const binding = result!.world.entities[0]?.transformerPipeStack?.[0]
      expect(binding?.params).toBeUndefined()
      expect(Object.values(binding?.scopeParams ?? {})).toContainEqual({ speed: 9 })
      expect(result!.syncEntityIds).toEqual(['e1'])
    })

    it('decouplePipeBinding copies a shared pipe for this entity only', () => {
      const { prompts, confirmed } = makePrompts()
      const ctx = makeCtx({ world: sharedPipeWorld(), prompts })

      const result = resolvePipeNavEdit({ kind: 'decouplePipeBinding', stackIndex: 0 }, ctx)
      expect(result).not.toBeNull()
      expect(result!.world.entities[0]?.transformerPipeStack?.[0]?.mode).toBe('copy')
      // The other entity keeps the shared binding.
      expect(result!.world.entities[1]?.transformerPipeStack?.[0]?.mode).not.toBe('copy')
      expect(confirmed[0]).toContain('2 entities share this pipe')
    })

    it('treeDrop reorders the entity pipe stack', () => {
      const ctx = makeCtx()
      const drag: PipeTreeNode = { kind: 'stack_pipe', pipeId: 'p1', stackIndex: 0, label: 'One' }
      const drop: PipeTreeNode = { kind: 'stack_pipe', pipeId: 'p2', stackIndex: 1, label: 'Two' }

      const result = resolvePipeNavEdit({ kind: 'treeDrop', drag, drop }, ctx)
      expect(result).not.toBeNull()
      expect(result!.world.entities[0]?.transformerPipeStack?.map((b) => b.pipeId)).toEqual([
        'p2',
        'p1',
      ])
    })

    it('treeDrop reorders stages within one pipe', () => {
      const ctx = makeCtx()
      const stage = (memberIndex: number, stageId: string): PipeTreeNode => ({
        kind: 'member_stage',
        pipeId: 'p1',
        parentPipeId: 'p1',
        memberIndex,
        stageId,
        label: stageId,
      })

      const result = resolvePipeNavEdit(
        { kind: 'treeDrop', drag: stage(0, 's1'), drop: stage(1, 's2') },
        ctx,
      )
      expect(result).not.toBeNull()
      expect(
        result!.world.transformerPipes?.p1?.members?.flatMap((m) =>
          m.kind === 'stage' ? [m.stageId] : [],
        ),
      ).toEqual(['s2', 's1'])
    })

    it('treeDrop moves a stage from a nested pipe into its parent', () => {
      const ctx = makeCtx({ world: nestedPipeWorld() })
      const drag: PipeTreeNode = {
        kind: 'member_stage',
        pipeId: 'inner',
        parentPipeId: 'inner',
        memberIndex: 0,
        stageId: 's2',
        label: 'Car2',
      }
      const drop: PipeTreeNode = {
        kind: 'member_stage',
        pipeId: 'outer',
        parentPipeId: 'outer',
        memberIndex: 0,
        stageId: 's1',
        label: 'Input',
      }

      const result = resolvePipeNavEdit({ kind: 'treeDrop', drag, drop }, ctx)
      expect(result).not.toBeNull()
      expect(result!.world.transformerPipes?.inner?.members).toHaveLength(0)
      expect(
        result!.world.transformerPipes?.outer?.members?.filter((m) => m.kind === 'stage'),
      ).toHaveLength(2)
    })

    it('treeDrop promotes a nested pipe onto the entity stack', () => {
      const ctx = makeCtx({ world: nestedPipeWorld() })
      const drag: PipeTreeNode = {
        kind: 'member_pipe',
        pipeId: 'inner',
        parentPipeId: 'outer',
        memberIndex: 1,
        label: 'Inner',
      }
      const drop: PipeTreeNode = { kind: 'entity', entityId: 'e1', label: 'Car' }

      const result = resolvePipeNavEdit({ kind: 'treeDrop', drag, drop }, ctx)
      expect(result).not.toBeNull()
      expect(result!.world.entities[0]?.transformerPipeStack?.map((b) => b.pipeId)).toContain(
        'inner',
      )
      expect(
        result!.world.transformerPipes?.outer?.members?.some(
          (m) => m.kind === 'pipe' && m.pipeId === 'inner',
        ),
      ).toBe(false)
    })

    it('treeDrop nests a stack pipe into an unrelated nested pipe', () => {
      const world = nestedPipeWorld()
      world.entities[0]!.transformerPipeStack = [{ pipeId: 'outer' }, { pipeId: 'donor' }]
      const { prompts, warned } = makePrompts()
      const ctx = makeCtx({ world, prompts })
      const drag: PipeTreeNode = {
        kind: 'stack_pipe',
        pipeId: 'donor',
        stackIndex: 1,
        label: 'Donor',
      }
      const drop: PipeTreeNode = {
        kind: 'member_pipe',
        pipeId: 'inner',
        parentPipeId: 'outer',
        memberIndex: 1,
        label: 'Inner',
      }

      const result = resolvePipeNavEdit({ kind: 'treeDrop', drag, drop }, ctx)
      expect(result).not.toBeNull()
      expect(warned).toEqual([])
      expect(result!.world.entities[0]?.transformerPipeStack?.map((b) => b.pipeId)).toEqual([
        'outer',
      ])
      expect(
        result!.world.transformerPipes?.inner?.members?.some(
          (m) => m.kind === 'pipe' && m.pipeId === 'donor',
        ),
      ).toBe(true)
    })
  })

  describe('purity', () => {
    it('does not mutate ctx.world', () => {
      const world = nestedPipeWorld()
      const worldSnapshot = structuredClone(world)
      const { prompts } = makePrompts()
      const ctx: PipeNavEditContext = {
        world,
        entityId: 'e1',
        focus: { path: [{ kind: 'stack', index: 0 }], selectedSiblingIndex: 0 },
        prompts,
      }

      resolvePipeNavEdit({ kind: 'renamePipe', name: 'Renamed' }, ctx)
      resolvePipeNavEdit({ kind: 'togglePipeEnabled', stackIndex: 0 }, ctx)
      resolvePipeNavEdit({ kind: 'createChildPipe', name: 'Child' }, ctx)

      expect(ctx.world).toEqual(worldSnapshot)
    })
  })
})
