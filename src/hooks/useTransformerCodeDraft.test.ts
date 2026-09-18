import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { TransformerConfig } from '@/types/transformer'
import {
  TRANSFORMER_CODE_DEBOUNCE_MS,
  useTransformerCodeDraft,
  type TransformerCodeDraftFlushContext,
} from './useTransformerCodeDraft'

function customConfig(code?: string): TransformerConfig {
  return { type: 'custom', priority: 10, code }
}

describe('useTransformerCodeDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('syncs draft from world when selection changes', () => {
    const onCommit = vi.fn()
    const ctx = (): TransformerCodeDraftFlushContext => ({
      selectedId: 'a',
      pipeScoped: false,
      registryIds: ['a'],
      configs: [customConfig('world')],
    })

    const { result, rerender } = renderHook(
      (props) =>
        useTransformerCodeDraft({
          ...props,
          getFlushContext: ctx,
          onCommit,
        }),
      {
        initialProps: {
          syncCodeKey: 'a:world',
          selectedConfig: customConfig('world'),
          selectedId: 'a',
        },
      },
    )

    expect(result.current.codeDraft).toBe('world')

    rerender({
      syncCodeKey: 'b:other',
      selectedConfig: customConfig('other'),
      selectedId: 'b',
    })
    expect(result.current.codeDraft).toBe('other')
  })

  it('debounces commit until the quiet window elapses', () => {
    const onCommit = vi.fn()
    const ctx = (): TransformerCodeDraftFlushContext => ({
      selectedId: 'a',
      pipeScoped: false,
      registryIds: ['a'],
      configs: [customConfig('')],
    })

    const { result } = renderHook(() =>
      useTransformerCodeDraft({
        syncCodeKey: 'a:',
        selectedConfig: customConfig(''),
        selectedId: 'a',
        getFlushContext: ctx,
        onCommit,
      }),
    )

    act(() => result.current.handleCodeChange('edited'))
    expect(onCommit).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(TRANSFORMER_CODE_DEBOUNCE_MS - 1)
    })
    expect(onCommit).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onCommit).toHaveBeenCalledWith('edited')
  })

  it('flushPendingCode commits immediately and cancels debounce', () => {
    const onCommit = vi.fn()
    const ctx = (): TransformerCodeDraftFlushContext => ({
      selectedId: 'a',
      pipeScoped: false,
      registryIds: ['a'],
      configs: [customConfig('start')],
    })

    const { result } = renderHook(() =>
      useTransformerCodeDraft({
        syncCodeKey: 'a:start',
        selectedConfig: customConfig('start'),
        selectedId: 'a',
        getFlushContext: ctx,
        onCommit,
      }),
    )

    act(() => result.current.handleCodeChange('pending'))
    act(() => result.current.flushPendingCode())
    expect(onCommit).toHaveBeenCalledWith('pending')

    act(() => {
      vi.advanceTimersByTime(TRANSFORMER_CODE_DEBOUNCE_MS)
    })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
