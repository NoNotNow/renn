import { describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import LayerTransformOverlay from './LayerTransformOverlay'
import type { TextureLayerDest } from '@/utils/textureCompositor'

const FRAME_PX = 200
const DOC_PX = 100

const DEST: TextureLayerDest = { x: 10, y: 10, w: 20, h: 20 }

function renderOverlay() {
  const frameRef = createRef<HTMLDivElement>()
  const onDestLiveChange = vi.fn()
  const onDestCommit = vi.fn()
  const utils = render(
    <div
      ref={frameRef}
      style={{ width: FRAME_PX, height: FRAME_PX, position: 'relative' }}
    >
      <LayerTransformOverlay
        docWidth={DOC_PX}
        docHeight={DOC_PX}
        dest={DEST}
        frameRef={frameRef}
        onDestLiveChange={onDestLiveChange}
        onDestCommit={onDestCommit}
      />
    </div>,
  )
  // jsdom rects are all-zero; give the frame a real rect so client → doc mapping is linear.
  vi.spyOn(frameRef.current!, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: FRAME_PX,
    bottom: FRAME_PX,
    width: FRAME_PX,
    height: FRAME_PX,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  return { ...utils, onDestLiveChange, onDestCommit }
}

const HANDLE_TESTIDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

describe('LayerTransformOverlay touch targets', () => {
  it.each(HANDLE_TESTIDS)('handle %s has a >=44px hit area with 12px visual and touch-action none', (handle) => {
    const { getByTestId } = renderOverlay()
    const el = getByTestId(`texture-maker-handle-${handle}`) as HTMLElement
    expect(el.style.touchAction).toBe('none')
    // jsdom has no layout; assert the inline hit-area size (>= 44px touch target).
    expect(parseFloat(el.style.width)).toBeGreaterThanOrEqual(44)
    expect(parseFloat(el.style.height)).toBeGreaterThanOrEqual(44)
    const visual = el.firstElementChild as HTMLElement
    expect(visual.style.width).toBe('12px')
    expect(visual.style.height).toBe('12px')
  })

  it('move body has touch-action none', () => {
    const { getByTestId } = renderOverlay()
    const el = getByTestId('texture-maker-transform-move') as HTMLElement
    expect(el.style.touchAction).toBe('none')
  })
})

describe('LayerTransformOverlay drag', () => {
  it('touch drag on the body moves the layer and commits on release', () => {
    const { getByTestId, onDestLiveChange, onDestCommit } = renderOverlay()
    const body = getByTestId('texture-maker-transform-move')

    // Frame is 2x doc size, so 40 client px = 20 doc px.
    fireEvent.pointerDown(body, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 60 })
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 80 })
    expect(onDestLiveChange).toHaveBeenLastCalledWith({ x: 30, y: 20, w: 20, h: 20 })

    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 80 })
    expect(onDestCommit).toHaveBeenCalledTimes(1)
    expect(onDestCommit).toHaveBeenLastCalledWith({ x: 30, y: 20, w: 20, h: 20 })
  })

  it('pointercancel clears drag state (later moves do not change dest)', () => {
    const { getByTestId, onDestLiveChange } = renderOverlay()
    const body = getByTestId('texture-maker-transform-move')

    fireEvent.pointerDown(body, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 60 })
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 80 })
    fireEvent.pointerCancel(window, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 80 })

    const calls = onDestLiveChange.mock.calls.length
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'touch', clientX: 140, clientY: 120 })
    expect(onDestLiveChange).toHaveBeenCalledTimes(calls)
  })
})
