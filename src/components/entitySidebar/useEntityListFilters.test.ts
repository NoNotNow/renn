import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEntityListFilters } from './useEntityListFilters'
import type { Entity } from '@/types/world'

function makeEntity(id: string, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    name: id,
    shape: { type: 'box', width: 1, height: 1, depth: 1 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    bodyType: 'static',
    ...overrides,
  } as unknown as Entity
}

describe('useEntityListFilters', () => {
  it('returns the input list and empty messages when no filters are active', () => {
    const entities = [makeEntity('a'), makeEntity('b')]
    const { result } = renderHook(() => useEntityListFilters(entities))
    expect(result.current.filteredEntities).toEqual(entities)
    expect(result.current.entityListEmptyMessage).toBe('')
    expect(result.current.hasActiveEntityFilters).toBe(false)
  })

  it('reports "No entities" when input is empty', () => {
    const { result } = renderHook(() => useEntityListFilters([]))
    expect(result.current.entityListEmptyMessage).toBe('No entities')
  })

  it('search filter narrows by name (case-insensitive substring on name ?? id)', () => {
    const entities = [
      makeEntity('alpha', { name: 'Alpha' }),
      makeEntity('beta', { name: 'BETA' }),
      makeEntity('gamma', { name: undefined }),
    ]
    const { result } = renderHook(() => useEntityListFilters(entities))
    act(() => result.current.setSearchQuery('eta'))
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['beta'])
    act(() => result.current.setSearchQuery('GAMMA'))
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['gamma'])
  })

  it('hasModel "yes" / "no" splits on a non-empty model string', () => {
    const entities = [
      makeEntity('a', { model: 'asset:model1' }),
      makeEntity('b', { model: '' }),
      makeEntity('c'),
    ]
    const { result } = renderHook(() => useEntityListFilters(entities))
    act(() => result.current.setFilterHasModel('yes'))
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['a'])
    act(() => result.current.setFilterHasModel('no'))
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['b', 'c'])
  })

  it('shape filter restricts to a single primitive type', () => {
    const entities = [
      makeEntity('box1', { shape: { type: 'box', width: 1, height: 1, depth: 1 } as Entity['shape'] }),
      makeEntity('sph1', { shape: { type: 'sphere', radius: 0.5 } as Entity['shape'] }),
    ]
    const { result } = renderHook(() => useEntityListFilters(entities))
    act(() => result.current.setFilterShape('sphere'))
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['sph1'])
  })

  it('transformers filter splits on transformers length', () => {
    const entities = [
      makeEntity('with', { transformers: ['noop_tf0'] }),
      makeEntity('without'),
    ]
    const { result } = renderHook(() => useEntityListFilters(entities))
    act(() => result.current.setFilterHasTransformers('yes'))
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['with'])
    act(() => result.current.setFilterHasTransformers('no'))
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['without'])
  })

  it('size min/max filter uses approximate entity size (largest axis × scale)', () => {
    const small = makeEntity('small', { scale: [0.5, 0.5, 0.5] })
    const big = makeEntity('big', { scale: [10, 10, 10] })
    const { result } = renderHook(() => useEntityListFilters([small, big]))
    act(() => result.current.setFilterSizeMin('2'))
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['big'])
    act(() => {
      result.current.setFilterSizeMin('')
      result.current.setFilterSizeMax('1')
    })
    expect(result.current.filteredEntities.map((e) => e.id)).toEqual(['small'])
  })

  it('clearEntityFilters resets every dropdown / size input', () => {
    const { result } = renderHook(() => useEntityListFilters([makeEntity('a')]))
    act(() => {
      result.current.setFilterHasModel('yes')
      result.current.setFilterShape('sphere')
      result.current.setFilterHasTransformers('yes')
      result.current.setFilterSizeMin('1')
      result.current.setFilterSizeMax('10')
    })
    expect(result.current.hasActiveEntityFilters).toBe(true)
    act(() => result.current.clearEntityFilters())
    expect(result.current.hasActiveEntityFilters).toBe(false)
    expect(result.current.filterHasModel).toBe('any')
    expect(result.current.filterShape).toBe('any')
    expect(result.current.filterHasTransformers).toBe('any')
    expect(result.current.filterSizeMin).toBe('')
    expect(result.current.filterSizeMax).toBe('')
  })

  it('emptyMessage variants reflect search vs filters vs both', () => {
    const entities = [makeEntity('a', { name: 'Alpha' })]
    const { result } = renderHook(() => useEntityListFilters(entities))
    act(() => result.current.setSearchQuery('zzz'))
    expect(result.current.entityListEmptyMessage).toBe('No entities match "zzz"')
    act(() => {
      result.current.setSearchQuery('')
      result.current.setFilterHasModel('yes')
    })
    expect(result.current.entityListEmptyMessage).toBe('No entities match the current filters')
    act(() => {
      result.current.setSearchQuery('zzz')
    })
    expect(result.current.entityListEmptyMessage).toBe(
      'No entities match "zzz" or the current filters',
    )
  })

  it('blank/whitespace size inputs are ignored (no NaN-induced filtering)', () => {
    const entities = [makeEntity('a'), makeEntity('b')]
    const { result } = renderHook(() => useEntityListFilters(entities))
    act(() => {
      result.current.setFilterSizeMin('   ')
      result.current.setFilterSizeMax('not-a-number')
    })
    expect(result.current.filteredEntities).toHaveLength(2)
  })
})
