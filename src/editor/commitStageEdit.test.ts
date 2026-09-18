import { describe, it, expect, vi } from 'vitest'
import {
  commitStageEdit,
  STAGE_EDIT_POLICY,
  type StageEditContext,
  type StageEditIntent,
} from './commitStageEdit'
import { stageWorldEditDescriptor } from './applyStageWorldWrite'
import type { ApplyWorldWrite } from './applyWorldEdit'
import type { TransformerConfig } from '@/types/transformer'
import type { RennWorld } from '@/types/world'

const sharedStageConfig: TransformerConfig = { type: 'car2', params: { power: 50 } }
const otherStageConfig: TransformerConfig = { type: 'input' }

function minimalWorld(overrides?: Partial<RennWorld>): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [
      {
        id: 'car',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
        transformers: ['shared_tf'],
      },
    ],
    transformers: {
      shared_tf: sharedStageConfig,
      s1: otherStageConfig,
      s2: { type: 'custom', name: 'Other', code: 'return {}' },
    },
    ...overrides,
  }
}

function makeCtx(overrides?: Partial<StageEditContext>): StageEditContext {
  const world = overrides?.world ?? minimalWorld()
  const syncWorld = { ...world, version: 'synced' }

  return {
    world,
    entityIds: ['car'],
    flushPendingCode: vi.fn(),
    undo: { pushBeforeEdit: vi.fn() },
    onWorldChange: vi.fn(),
    writeStack: vi.fn(() => syncWorld),
    onMergedParamSync: vi.fn(),
    ...overrides,
  }
}

function intentForKind(kind: StageEditIntent['kind']): StageEditIntent {
  switch (kind) {
    case 'patch':
      return { kind: 'patch', stageId: 's1', config: { type: 'input', enabled: false } }
    case 'commitStages':
      return {
        kind: 'commitStages',
        configs: [{ type: 'input' }],
        orderedRegistryIds: ['s1'],
      }
    case 'reorder':
      return {
        kind: 'reorder',
        configs: [{ type: 'input' }],
        orderedRegistryIds: ['s1'],
      }
    case 'loadTemplate':
      return {
        kind: 'loadTemplate',
        configs: [{ type: 'car2', params: { power: 99 } }],
        orderedRegistryIds: ['s2'],
      }
    case 'makeUnique':
      return { kind: 'makeUnique', entityId: 'car', stageId: 'shared_tf' }
    case 'codeEdit':
      return {
        kind: 'codeEdit',
        configs: [{ type: 'custom', name: 'Draft', code: 'return {}' }],
        orderedRegistryIds: ['s2'],
      }
  }
}

describe('commitStageEdit', () => {
  describe('undo / flush policy per intent', () => {
    /**
     * Spelled out independently of `STAGE_EDIT_POLICY` on purpose: asserting against the source
     * table would only prove `commitStageEdit` reads its own table, and would stay green if a
     * policy value were flipped. These are the decisions, and changing one must fail here.
     */
    const expected: Record<StageEditIntent['kind'], { flushPendingCode: boolean; pushUndo: boolean }> = {
      patch: { flushPendingCode: true, pushUndo: true },
      commitStages: { flushPendingCode: true, pushUndo: true },
      reorder: { flushPendingCode: true, pushUndo: true },
      loadTemplate: { flushPendingCode: true, pushUndo: true },
      makeUnique: { flushPendingCode: true, pushUndo: true },
      codeEdit: { flushPendingCode: false, pushUndo: false },
    }

    it('declares a policy for exactly the intent kinds this table covers', () => {
      expect(Object.keys(STAGE_EDIT_POLICY).sort()).toEqual(Object.keys(expected).sort())
    })

    for (const [kind, { flushPendingCode, pushUndo }] of Object.entries(expected) as [
      StageEditIntent['kind'],
      { flushPendingCode: boolean; pushUndo: boolean },
    ][]) {
      it(`${kind}: ${flushPendingCode ? 'flushes' : 'does not flush'} and ${pushUndo ? 'pushes undo' : 'does not push undo'}`, () => {
        const ctx = makeCtx()
        const outcome = commitStageEdit(intentForKind(kind), ctx)

        // Pinned so a row that starts resolving to a no-op fails here rather than silently
        // reporting the wrong undo policy — an aborted write never reaches the undo push.
        expect(outcome.written, `${kind} should produce a write with these fixtures`).toBe(true)
        expect(ctx.flushPendingCode).toHaveBeenCalledTimes(flushPendingCode ? 1 : 0)
        expect(ctx.undo!.pushBeforeEdit).toHaveBeenCalledTimes(pushUndo ? 1 : 0)
      })
    }
  })

  describe('operation ordering', () => {
    it('runs flush → undo → writeStack → onMergedParamSync for commitStages', () => {
      const ctx = makeCtx()
      commitStageEdit(intentForKind('commitStages'), ctx)

      expect(ctx.flushPendingCode).toHaveBeenCalledBefore(
        ctx.undo!.pushBeforeEdit as ReturnType<typeof vi.fn>,
      )
      expect(ctx.undo!.pushBeforeEdit).toHaveBeenCalledBefore(
        ctx.writeStack as ReturnType<typeof vi.fn>,
      )
      expect(ctx.writeStack).toHaveBeenCalledBefore(
        ctx.onMergedParamSync as ReturnType<typeof vi.fn>,
      )
    })
  })

  describe('no-op abort before undo push', () => {
    it('returns written:false when makeUnique stageId is missing from registry', () => {
      const ctx = makeCtx()
      const outcome = commitStageEdit(
        { kind: 'makeUnique', entityId: 'car', stageId: 'missing_tf' },
        ctx,
      )

      expect(outcome).toEqual({ written: false })
      expect(ctx.flushPendingCode).toHaveBeenCalledOnce()
      expect(ctx.undo!.pushBeforeEdit).not.toHaveBeenCalled()
      expect(ctx.onWorldChange).not.toHaveBeenCalled()
      expect(ctx.onMergedParamSync).not.toHaveBeenCalled()
    })

    it('returns written:false when entity does not reference the registry stage', () => {
      const ctx = makeCtx({
        world: minimalWorld({
          entities: [
            {
              id: 'car',
              bodyType: 'dynamic',
              shape: { type: 'box', width: 1, height: 1, depth: 1 },
              position: [0, 0, 0],
              transformers: ['other_tf'],
            },
          ],
          transformers: {
            shared_tf: sharedStageConfig,
            other_tf: otherStageConfig,
          },
        }),
      })

      const outcome = commitStageEdit(
        { kind: 'makeUnique', entityId: 'car', stageId: 'shared_tf' },
        ctx,
      )

      expect(outcome).toEqual({ written: false })
      expect(ctx.flushPendingCode).toHaveBeenCalledOnce()
      expect(ctx.undo!.pushBeforeEdit).not.toHaveBeenCalled()
      expect(ctx.onWorldChange).not.toHaveBeenCalled()
      expect(ctx.onMergedParamSync).not.toHaveBeenCalled()
    })
  })

  describe('makeUnique happy path', () => {
    it('copies the shared stage locally and clears pipe bindings without param sync', () => {
      const world = minimalWorld({
        entities: [
          {
            id: 'car',
            bodyType: 'dynamic',
            shape: { type: 'box', width: 1, height: 1, depth: 1 },
            position: [0, 0, 0],
            transformers: ['shared_tf'],
            transformerPipeStack: [{ pipeId: 'drive', params: { speed: 50 } }],
            transformerPipe: 'drive',
          },
        ],
      })
      const ctx = makeCtx({ world })

      const outcome = commitStageEdit(
        { kind: 'makeUnique', entityId: 'car', stageId: 'shared_tf' },
        ctx,
      )

      expect(outcome.written).toBe(true)
      expect(outcome.selectStageId).toBeDefined()
      expect(outcome.selectStageId).not.toBe('shared_tf')

      expect(ctx.onWorldChange).toHaveBeenCalledOnce()
      const next = (ctx.onWorldChange as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RennWorld

      expect(next.transformers![outcome.selectStageId!]).toEqual(sharedStageConfig)
      expect(next.transformers![outcome.selectStageId!]).not.toBe(sharedStageConfig)
      next.transformers![outcome.selectStageId!]!.params!.power = 999
      expect(sharedStageConfig.params!.power).toBe(50)

      const car = next.entities.find((e) => e.id === 'car')!
      expect(car.transformers).toEqual([outcome.selectStageId])
      expect(car.transformerPipeStack).toBeUndefined()
      expect(car.transformerPipe).toBeUndefined()

      expect(ctx.onMergedParamSync).not.toHaveBeenCalled()
      expect(ctx.writeStack).not.toHaveBeenCalled()
    })
  })

  describe('patch', () => {
    it('patches one registry entry, preserves others, and syncs merged params', () => {
      const world = minimalWorld()
      const ctx = makeCtx({ world })
      const patched: TransformerConfig = { type: 'input', enabled: false, params: { gain: 2 } }

      const outcome = commitStageEdit({ kind: 'patch', stageId: 's1', config: patched }, ctx)

      expect(outcome).toEqual({ written: true })
      expect(ctx.writeStack).not.toHaveBeenCalled()

      expect(ctx.onWorldChange).toHaveBeenCalledOnce()
      const next = (ctx.onWorldChange as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RennWorld
      expect(next.transformers!.s1).toEqual(patched)
      expect(next.transformers!.shared_tf).toEqual(sharedStageConfig)
      expect(next.transformers!.s2).toEqual(world.transformers!.s2)

      expect(ctx.onMergedParamSync).toHaveBeenCalledOnce()
      expect(ctx.onMergedParamSync).toHaveBeenCalledWith(next, ['car'])
    })
  })

  describe('stack intents delegate to writeStack', () => {
    it('calls writeStack with configs and ordered ids, not onWorldChange directly', () => {
      const ctx = makeCtx()
      const configs: TransformerConfig[] = [{ type: 'input' }, { type: 'car2' }]
      const orderedRegistryIds = ['s1', 's2']

      commitStageEdit({ kind: 'commitStages', configs, orderedRegistryIds }, ctx)

      expect(ctx.writeStack).toHaveBeenCalledOnce()
      expect(ctx.writeStack).toHaveBeenCalledWith(configs, orderedRegistryIds, 'commitStages')
      expect(ctx.onWorldChange).not.toHaveBeenCalled()
    })

    it('syncs merged params when writeStack returns a world', () => {
      const syncWorld = minimalWorld({ version: 'after-stack' })
      const ctx = makeCtx({ writeStack: vi.fn(() => syncWorld) })

      commitStageEdit(intentForKind('commitStages'), ctx)

      expect(ctx.onMergedParamSync).toHaveBeenCalledOnce()
      expect(ctx.onMergedParamSync).toHaveBeenCalledWith(syncWorld, ['car'])
    })

    it('skips merged param sync when writeStack returns null', () => {
      const ctx = makeCtx({ writeStack: vi.fn(() => null) })

      commitStageEdit(intentForKind('commitStages'), ctx)

      expect(ctx.onMergedParamSync).not.toHaveBeenCalled()
    })
  })

  describe('applyWorldWrite seam', () => {
    it('patch routes through ApplyWorldWrite and does not double-push undo', () => {
      const applyWorldWrite = vi.fn<ApplyWorldWrite>()
      const ctx = makeCtx({ applyWorldWrite })

      commitStageEdit(intentForKind('patch'), ctx)

      expect(applyWorldWrite).toHaveBeenCalledOnce()
      const [descriptor, produceNext] = applyWorldWrite.mock.calls[0]!
      expect(descriptor).toEqual(stageWorldEditDescriptor(STAGE_EDIT_POLICY.patch.pushUndo))
      expect(ctx.undo!.pushBeforeEdit).not.toHaveBeenCalled()
      expect(ctx.onWorldChange).not.toHaveBeenCalled()
      expect(produceNext(minimalWorld())).toMatchObject({
        transformers: expect.objectContaining({
          s1: { type: 'input', enabled: false },
        }),
      })
    })

    it('makeUnique routes through ApplyWorldWrite', () => {
      const applyWorldWrite = vi.fn<ApplyWorldWrite>()
      const ctx = makeCtx({ applyWorldWrite })

      commitStageEdit(intentForKind('makeUnique'), ctx)

      expect(applyWorldWrite).toHaveBeenCalledOnce()
      expect(ctx.onWorldChange).not.toHaveBeenCalled()
      expect(ctx.undo!.pushBeforeEdit).not.toHaveBeenCalled()
    })

    it('stack intents pass intent kind to writeStack for pipe-scoped seam writes', () => {
      const ctx = makeCtx()
      commitStageEdit(intentForKind('reorder'), ctx)
      expect(ctx.writeStack).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        'reorder',
      )
    })
  })

  describe('missing optional dependencies', () => {
    it('still writes when undo is null', () => {
      const ctx = makeCtx({ undo: null })

      const outcome = commitStageEdit(intentForKind('patch'), ctx)

      expect(outcome).toEqual({ written: true })
      expect(ctx.onWorldChange).toHaveBeenCalledOnce()
    })

    it('does not throw when onMergedParamSync is undefined', () => {
      const ctx = makeCtx({ onMergedParamSync: undefined })

      expect(() => commitStageEdit(intentForKind('commitStages'), ctx)).not.toThrow()
      expect(ctx.writeStack).toHaveBeenCalledOnce()
    })

    it('skips merged param sync when entityIds is empty even if writeStack returned a world', () => {
      const syncWorld = minimalWorld({ version: 'after-stack' })
      const ctx = makeCtx({ entityIds: [], writeStack: vi.fn(() => syncWorld) })

      commitStageEdit(intentForKind('commitStages'), ctx)

      expect(ctx.onMergedParamSync).not.toHaveBeenCalled()
    })
  })
})
