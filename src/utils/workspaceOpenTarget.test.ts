import { describe, expect, it } from 'vitest'
import {
  buildDefaultWorkspaceTargetForEntity,
  isWorkspaceTargetItemValid,
  resolveWorkspaceOpenTarget,
  resolveWorkspaceTargetForEntity,
  tryReusePrevWorkspaceEntry,
} from '@/utils/workspaceOpenTarget'
import type { Entity } from '@/types/world'

const entity = (id: string, transformers?: string[], scripts?: string[]): Entity =>
  ({
    id,
    transformers,
    scripts,
  }) as Entity

describe('isWorkspaceTargetItemValid', () => {
  it('accepts missing itemId on any tab', () => {
    expect(isWorkspaceTargetItemValid({ tab: 'transformers' }, [], [])).toBe(true)
    expect(isWorkspaceTargetItemValid({ tab: 'scripts' }, [], [])).toBe(true)
  })

  it('validates script and transformer item ids', () => {
    expect(isWorkspaceTargetItemValid({ tab: 'scripts', itemId: 's1' }, [], ['s1'])).toBe(true)
    expect(isWorkspaceTargetItemValid({ tab: 'scripts', itemId: 's2' }, [], ['s1'])).toBe(false)
    expect(isWorkspaceTargetItemValid({ tab: 'transformers', itemId: 't1' }, ['t1'], [])).toBe(true)
    expect(isWorkspaceTargetItemValid({ tab: 'transformers', itemId: 't2' }, ['t1'], [])).toBe(false)
  })
})

describe('buildDefaultWorkspaceTargetForEntity', () => {
  it('prefers scripts when no transformers', () => {
    expect(
      buildDefaultWorkspaceTargetForEntity('e1', [], ['s1', 's2'], {}),
    ).toEqual({ entityId: 'e1', tab: 'scripts', itemId: 's1' })
  })

  it('prefers custom transformer when present', () => {
    expect(
      buildDefaultWorkspaceTargetForEntity('e1', ['t1', 't2'], [], {
        t1: { type: 'builtin' },
        t2: { type: 'custom' },
      }),
    ).toEqual({ entityId: 'e1', tab: 'transformers', itemId: 't2' })
  })
})

describe('tryReusePrevWorkspaceEntry', () => {
  it('reuses organize tab for same entity', () => {
    const prev = { entityId: 'e1', tab: 'organize' as const }
    expect(tryReusePrevWorkspaceEntry(prev, 'e1', [], [])).toEqual(prev)
  })

  it('rejects stale transformer item', () => {
    const prev = { entityId: 'e1', tab: 'transformers' as const, itemId: 'gone' }
    expect(tryReusePrevWorkspaceEntry(prev, 'e1', ['t1'], [])).toBeNull()
  })
})

describe('resolveWorkspaceTargetForEntity', () => {
  it('restores memory when item still valid', () => {
    const next = resolveWorkspaceTargetForEntity(
      'e1',
      ['t1'],
      [],
      {},
      { tab: 'transformers', itemId: 't1', pipeNavPath: [{ kind: 'member', pipeId: 'p1', memberIndex: 0 }] },
    )
    expect(next.tab).toBe('transformers')
    expect(next.itemId).toBe('t1')
    expect(next.pipeNavPath).toEqual([{ kind: 'member', pipeId: 'p1', memberIndex: 0 }])
  })

  it('falls back when memory item is invalid', () => {
    const next = resolveWorkspaceTargetForEntity(
      'e1',
      ['t1'],
      [],
      {},
      { tab: 'scripts', itemId: 'missing' },
    )
    expect(next).toEqual({ entityId: 'e1', tab: 'transformers', itemId: 't1' })
  })
})

describe('resolveWorkspaceOpenTarget', () => {
  it('opens organize when nothing selected', () => {
    expect(
      resolveWorkspaceOpenTarget({
        selectedEntityIds: [],
        entities: [],
        worldTransformers: {},
        prevEntry: null,
        loadMemory: () => undefined,
      }),
    ).toEqual({ tab: 'organize' })
  })

  it('reuses prev entry for same primary entity', () => {
    const prev = { entityId: 'e1', tab: 'scripts' as const, itemId: 's1' }
    expect(
      resolveWorkspaceOpenTarget({
        selectedEntityIds: ['e1'],
        entities: [entity('e1', [], ['s1'])],
        worldTransformers: {},
        prevEntry: prev,
        loadMemory: () => undefined,
      }),
    ).toEqual(prev)
  })

  it('defaults from intersection across multi-select', () => {
    expect(
      resolveWorkspaceOpenTarget({
        selectedEntityIds: ['e1', 'e2'],
        entities: [
          entity('e1', ['t1', 't2']),
          entity('e2', ['t2', 't3']),
        ],
        worldTransformers: { t2: { type: 'custom' } },
        prevEntry: null,
        loadMemory: () => undefined,
      }),
    ).toEqual({ entityId: 'e1', tab: 'transformers', itemId: 't2' })
  })
})
