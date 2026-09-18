import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  clearCustomTransformerRuntimeError,
  clearCustomTransformerRuntimeErrorForTarget,
  publishCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'
import {
  STAGE_RUNTIME_ERROR_KEEP_MS,
  useStageRuntimeErrorDisplay,
} from './useStageRuntimeErrorDisplay'

const ENTITY_A = 'entity-a'
const ENTITY_B = 'entity-b'
const FLAT_INDEX = 2

function publishFor(
  entityId: string,
  configStackIndex: number,
  overrides: Partial<{
    message: string
    stack: string
    code: string
    lineNumber: number
  }> = {},
) {
  publishCustomTransformerRuntimeError({
    entityId,
    configStackIndex,
    message: 'runtime failed',
    code: 'throw new Error("x")',
    lineNumber: 3,
    ...overrides,
  })
}

describe('useStageRuntimeErrorDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    clearCustomTransformerRuntimeError()
    vi.useRealTimers()
  })

  it('returns null error and displayed when nothing is published', () => {
    const { result } = renderHook(() => useStageRuntimeErrorDisplay([ENTITY_A], FLAT_INDEX))

    expect(result.current.error).toBeNull()
    expect(result.current.displayed).toBeNull()
    expect(result.current.active).toBe(false)
  })

  it('surfaces error for selected entity at flat stack index', () => {
    const { result } = renderHook(() => useStageRuntimeErrorDisplay([ENTITY_A], FLAT_INDEX))

    act(() => {
      publishFor(ENTITY_A, FLAT_INDEX, { message: 'boom', code: 'bad()', lineNumber: 7 })
    })

    expect(result.current.error).toMatchObject({
      message: 'boom',
      code: 'bad()',
      lineNumber: 7,
    })
    expect(result.current.displayed).toEqual(result.current.error)
    expect(result.current.active).toBe(true)
  })

  it('ignores errors for other entities or stack indices', () => {
    const { result } = renderHook(() => useStageRuntimeErrorDisplay([ENTITY_A], FLAT_INDEX))

    act(() => {
      publishFor(ENTITY_B, FLAT_INDEX)
    })
    expect(result.current.error).toBeNull()

    act(() => {
      clearCustomTransformerRuntimeError()
      publishFor(ENTITY_A, FLAT_INDEX + 1)
    })
    expect(result.current.error).toBeNull()
  })

  it('prefers the first selected entity that has an error', () => {
    const entityIds = [ENTITY_A, ENTITY_B]
    const { result } = renderHook(() => useStageRuntimeErrorDisplay(entityIds, FLAT_INDEX))

    act(() => {
      publishFor(ENTITY_B, FLAT_INDEX, { message: 'from B' })
    })
    expect(result.current.error?.message).toBe('from B')

    act(() => {
      publishFor(ENTITY_A, FLAT_INDEX, { message: 'from A' })
    })
    expect(result.current.error?.message).toBe('from A')
  })

  it('stays active for as long as the runtime keeps reporting the error', () => {
    const { result } = renderHook(() => useStageRuntimeErrorDisplay([ENTITY_A], FLAT_INDEX))

    act(() => {
      publishFor(ENTITY_A, FLAT_INDEX, { message: 'still failing' })
    })

    act(() => {
      vi.advanceTimersByTime(STAGE_RUNTIME_ERROR_KEEP_MS * 2)
    })

    expect(result.current.active).toBe(true)
    expect(result.current.displayed?.message).toBe('still failing')
  })

  it('keeps displayed error dimmed after runtime clears until keep window ends', () => {
    const { result } = renderHook(() => useStageRuntimeErrorDisplay([ENTITY_A], FLAT_INDEX))

    act(() => {
      publishFor(ENTITY_A, FLAT_INDEX, { message: 'linger' })
    })
    const kept = result.current.displayed

    act(() => {
      clearCustomTransformerRuntimeErrorForTarget(ENTITY_A, FLAT_INDEX)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.displayed).toBe(kept)
    expect(result.current.active).toBe(false)

    act(() => {
      vi.advanceTimersByTime(STAGE_RUNTIME_ERROR_KEEP_MS - 1)
    })
    expect(result.current.displayed).toBe(kept)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.displayed).toBeNull()
  })

  it('re-publishing within the keep window cancels drop and re-activates', () => {
    const { result } = renderHook(() => useStageRuntimeErrorDisplay([ENTITY_A], FLAT_INDEX))

    act(() => {
      publishFor(ENTITY_A, FLAT_INDEX, { message: 'revive' })
    })

    act(() => {
      clearCustomTransformerRuntimeErrorForTarget(ENTITY_A, FLAT_INDEX)
    })
    expect(result.current.active).toBe(false)

    act(() => {
      vi.advanceTimersByTime(STAGE_RUNTIME_ERROR_KEEP_MS - 100)
    })

    act(() => {
      publishFor(ENTITY_A, FLAT_INDEX, { message: 'revive' })
    })
    expect(result.current.active).toBe(true)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.displayed).not.toBeNull()
  })

  it('keeps error object identity when snapshot fields are unchanged', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useStageRuntimeErrorDisplay(ids, FLAT_INDEX),
      { initialProps: { ids: [ENTITY_A] } },
    )

    act(() => {
      publishFor(ENTITY_A, FLAT_INDEX, { message: 'stable', code: 'x', lineNumber: 1 })
    })
    const first = result.current.error

    act(() => {
      clearCustomTransformerRuntimeErrorForTarget(ENTITY_A, FLAT_INDEX)
      publishFor(ENTITY_A, FLAT_INDEX, { message: 'stable', code: 'x', lineNumber: 1 })
    })
    const second = result.current.error

    expect(second).toBe(first)

    rerender({ ids: [ENTITY_A] })
    expect(result.current.error).toBe(first)
  })

  it('hasErrorAt reflects runtime errors on any selected entity at an index', () => {
    const { result } = renderHook(() => useStageRuntimeErrorDisplay([ENTITY_A, ENTITY_B], FLAT_INDEX))

    expect(result.current.hasErrorAt(FLAT_INDEX)).toBe(false)
    expect(result.current.hasErrorAt(FLAT_INDEX + 1)).toBe(false)

    act(() => {
      publishFor(ENTITY_B, FLAT_INDEX)
    })

    expect(result.current.hasErrorAt(FLAT_INDEX)).toBe(true)
    expect(result.current.hasErrorAt(FLAT_INDEX + 1)).toBe(false)
  })
})
