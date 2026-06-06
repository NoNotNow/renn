import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCornerBrResize } from './useCornerBrResize'

describe('useCornerBrResize', () => {
  it('grows size from bottom-right drag', () => {
    const onSizeChange = vi.fn()
    const { result } = renderHook(() =>
      useCornerBrResize({
        enabled: true,
        minWidth: 200,
        minHeight: 160,
        size: { width: 400, height: 300 },
        onSizeChange,
      }),
    )

    const target = document.createElement('div')
    target.setPointerCapture = vi.fn()
    target.releasePointerCapture = vi.fn()

    act(() => {
      result.current.onPointerDown({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 200,
        currentTarget: target,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    act(() => {
      result.current.onPointerMove({
        clientX: 130,
        clientY: 240,
        currentTarget: target,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(onSizeChange).toHaveBeenCalledWith({ width: 430, height: 340 })
  })

  it('clamps to minimum size', () => {
    const onSizeChange = vi.fn()
    const { result } = renderHook(() =>
      useCornerBrResize({
        enabled: true,
        minWidth: 200,
        minHeight: 160,
        size: { width: 220, height: 180 },
        onSizeChange,
      }),
    )

    const target = document.createElement('div')
    target.setPointerCapture = vi.fn()
    target.releasePointerCapture = vi.fn()

    act(() => {
      result.current.onPointerDown({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 50,
        clientY: 50,
        currentTarget: target,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    act(() => {
      result.current.onPointerMove({
        clientX: 0,
        clientY: 0,
        currentTarget: target,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(onSizeChange).toHaveBeenCalledWith({ width: 200, height: 160 })
  })
})
