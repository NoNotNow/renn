import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExplorerSelection } from '@/hooks/useExplorerSelection'
import type { RennWorld } from '@/types/world'

function setup(recordEntityWorkHistory = vi.fn()) {
  return renderHook(() => useExplorerSelection({ recordEntityWorkHistory }))
}

function worldWith(
  entityIds: string[],
  groupIds: string[] = [],
): Pick<RennWorld, 'entities' | 'groups'> {
  return {
    entities: entityIds.map((id) => ({ id, name: id })) as RennWorld['entities'],
    groups: groupIds.map((id) => ({ id, name: id, memberIds: [] })),
  }
}

describe('useExplorerSelection', () => {
  it('starts with empty entity and group selection', () => {
    const { result } = setup()
    expect(result.current.selectedEntityIds).toEqual([])
    expect(result.current.selectedGroupIds).toEqual([])
  })

  it('selects a single entity and records work history', () => {
    const record = vi.fn()
    const { result } = setup(record)

    act(() => {
      result.current.handleSelectEntity('a')
    })

    expect(result.current.selectedEntityIds).toEqual(['a'])
    expect(result.current.selectedGroupIds).toEqual([])
    expect(record).toHaveBeenCalledWith('a')
    expect(result.current.selectionAnchorEntityIdRef.current).toBe('a')
  })

  it('clears selection on null id', () => {
    const { result } = setup()

    act(() => {
      result.current.handleSelectEntity('a')
      result.current.setSelectedGroupIds(['g1'])
    })
    act(() => {
      result.current.handleSelectEntity(null)
    })

    expect(result.current.selectedEntityIds).toEqual([])
    expect(result.current.selectedGroupIds).toEqual([])
    expect(result.current.selectionAnchorEntityIdRef.current).toBeNull()
  })

  it('clearSelection matches keyboard shortcut behavior', () => {
    const { result } = setup()

    act(() => {
      result.current.handleSelectEntity('a')
      result.current.setSelectedGroupIds(['g1'])
    })
    act(() => {
      result.current.clearSelection()
    })

    expect(result.current.selectedEntityIds).toEqual([])
    expect(result.current.selectedGroupIds).toEqual([])
    expect(result.current.selectionAnchorEntityIdRef.current).toBeNull()
  })

  it('toggles entities in additive mode', () => {
    const { result } = setup()

    act(() => {
      result.current.handleSelectEntity('a')
    })
    act(() => {
      result.current.handleSelectEntity('b', { additive: true })
    })
    expect(result.current.selectedEntityIds).toEqual(['a', 'b'])

    act(() => {
      result.current.handleSelectEntity('a', { additive: true })
    })
    expect(result.current.selectedEntityIds).toEqual(['b'])
  })

  it('selects a visible range anchored on the prior selection', () => {
    const { result } = setup()
    const order = ['e1', 'e2', 'e3', 'e4'] as const

    act(() => {
      result.current.handleSelectEntity('e2')
    })
    act(() => {
      result.current.handleSelectEntity('e4', { range: true, orderedVisibleEntityIds: order })
    })

    expect(result.current.selectedEntityIds).toEqual(['e2', 'e3', 'e4'])
    expect(result.current.selectedGroupIds).toEqual([])
  })

  it('reconcileAfterSnapshot drops missing entity and group ids', () => {
    const { result } = setup()

    act(() => {
      result.current.setSelectedEntityIds(['keep', 'gone'])
      result.current.setSelectedGroupIds(['g-keep', 'g-gone'])
    })
    act(() => {
      result.current.reconcileAfterSnapshot(worldWith(['keep'], ['g-keep']))
    })

    expect(result.current.selectedEntityIds).toEqual(['keep'])
    expect(result.current.selectedGroupIds).toEqual(['g-keep'])
  })
})
