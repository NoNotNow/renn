import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEntityWorkHistory } from '@/hooks/useEntityWorkHistory'
import { ENTITY_WORK_HISTORY_CAP } from '@/utils/entityWorkHistory'

describe('useEntityWorkHistory', () => {
  it('starts empty with ref in sync', () => {
    const { result } = renderHook(() => useEntityWorkHistory())
    expect(result.current.entityWorkHistory).toEqual([])
    expect(result.current.entityWorkHistoryRef.current).toEqual([])
  })

  it('recordEntityWorkHistory updates state and ref; calls onDirty when changed', () => {
    const onDirty = vi.fn()
    const { result } = renderHook(() => useEntityWorkHistory({ onDirty }))

    act(() => {
      result.current.recordEntityWorkHistory('car')
    })
    expect(result.current.entityWorkHistory).toEqual(['car'])
    expect(result.current.entityWorkHistoryRef.current).toEqual(['car'])
    expect(onDirty).toHaveBeenCalledOnce()

    act(() => {
      result.current.recordEntityWorkHistory('car')
    })
    expect(onDirty).toHaveBeenCalledOnce()
  })

  it('recordEntityWorkHistory dedupes and caps', () => {
    const { result } = renderHook(() => useEntityWorkHistory())

    act(() => {
      for (let i = 0; i < ENTITY_WORK_HISTORY_CAP + 2; i++) {
        result.current.recordEntityWorkHistory(`e${i}`)
      }
    })
    expect(result.current.entityWorkHistory).toHaveLength(ENTITY_WORK_HISTORY_CAP)
    expect(result.current.entityWorkHistory[0]).toBe(`e${ENTITY_WORK_HISTORY_CAP + 1}`)
  })

  it('reset clears history without onDirty', () => {
    const onDirty = vi.fn()
    const { result } = renderHook(() => useEntityWorkHistory({ onDirty }))

    act(() => {
      result.current.recordEntityWorkHistory('a')
    })
    onDirty.mockClear()

    act(() => {
      result.current.reset()
    })
    expect(result.current.entityWorkHistory).toEqual([])
    expect(result.current.entityWorkHistoryRef.current).toEqual([])
    expect(onDirty).not.toHaveBeenCalled()
  })

  it('replaceFromLoaded prunes missing entity ids', () => {
    const { result } = renderHook(() => useEntityWorkHistory())
    const valid = new Set(['a', 'c'])

    act(() => {
      result.current.replaceFromLoaded(['a', 'b', 'c'], valid)
    })
    expect(result.current.entityWorkHistory).toEqual(['a', 'c'])
    expect(result.current.entityWorkHistoryRef.current).toEqual(['a', 'c'])
  })

  it('pruneToValidEntities drops deleted ids without onDirty', () => {
    const onDirty = vi.fn()
    const { result } = renderHook(() => useEntityWorkHistory({ onDirty }))

    act(() => {
      result.current.replaceFromLoaded(['a', 'b'], new Set(['a', 'b']))
    })
    onDirty.mockClear()

    act(() => {
      result.current.pruneToValidEntities(new Set(['a']))
    })
    expect(result.current.entityWorkHistory).toEqual(['a'])
    expect(onDirty).not.toHaveBeenCalled()
  })

  it('pruneToValidEntities is a no-op when nothing removed', () => {
    const { result } = renderHook(() => useEntityWorkHistory())

    act(() => {
      result.current.replaceFromLoaded(['a'], new Set(['a']))
    })
    const refBefore = result.current.entityWorkHistoryRef.current

    act(() => {
      result.current.pruneToValidEntities(new Set(['a']))
    })
    expect(result.current.entityWorkHistoryRef.current).toBe(refBefore)
  })
})
