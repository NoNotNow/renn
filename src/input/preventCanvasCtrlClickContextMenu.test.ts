import { describe, expect, it, vi } from 'vitest'
import {
  attachPreventCanvasCtrlClickContextMenu,
  shouldSuppressCanvasContextMenu,
} from './preventCanvasCtrlClickContextMenu'

describe('shouldSuppressCanvasContextMenu', () => {
  it('suppresses when a ctrl+primary click is pending', () => {
    expect(shouldSuppressCanvasContextMenu({ ctrlKey: false }, true)).toBe(true)
  })

  it('suppresses when contextmenu still reports ctrlKey', () => {
    expect(shouldSuppressCanvasContextMenu({ ctrlKey: true }, false)).toBe(true)
  })

  it('does not suppress a normal right-click', () => {
    expect(shouldSuppressCanvasContextMenu({ ctrlKey: false }, false)).toBe(false)
  })
})

describe('attachPreventCanvasCtrlClickContextMenu', () => {
  it('prevents default on ctrl+primary pointerdown and the following contextmenu', () => {
    const canvas = document.createElement('canvas')
    const dispose = attachPreventCanvasCtrlClickContextMenu(canvas)

    const down = new PointerEvent('pointerdown', { button: 0, ctrlKey: true, bubbles: true })
    const downPrevent = vi.spyOn(down, 'preventDefault')
    canvas.dispatchEvent(down)
    expect(downPrevent).toHaveBeenCalled()

    const menu = new MouseEvent('contextmenu', { bubbles: true, ctrlKey: true })
    const menuPrevent = vi.spyOn(menu, 'preventDefault')
    canvas.dispatchEvent(menu)
    expect(menuPrevent).toHaveBeenCalled()

    dispose()
  })

  it('leaves a normal right-click contextmenu alone', () => {
    const canvas = document.createElement('canvas')
    const dispose = attachPreventCanvasCtrlClickContextMenu(canvas)

    const menu = new MouseEvent('contextmenu', { bubbles: true, ctrlKey: false })
    const menuPrevent = vi.spyOn(menu, 'preventDefault')
    canvas.dispatchEvent(menu)
    expect(menuPrevent).not.toHaveBeenCalled()

    dispose()
  })
})
