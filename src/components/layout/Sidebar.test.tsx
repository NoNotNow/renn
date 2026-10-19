import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Sidebar from './Sidebar'

const tabs = [{ id: 'a', label: 'A' }] as never

const renderSidebar = (side: 'left' | 'right', onWidthChange = vi.fn(), onToggle = vi.fn()) =>
  render(
    <Sidebar
      side={side}
      isOpen
      onToggle={onToggle}
      tabConfig={tabs}
      activeTab="a"
      onTabChange={() => {}}
      width={300}
      toggleLogContext="t"
      onWidthChange={onWidthChange}
    >
      <div />
    </Sidebar>,
  )

describe('Sidebar full-height edge resize', () => {
  it('drags the left sidebar wider from the edge strip without toggling (mouse)', () => {
    const onWidthChange = vi.fn()
    const onToggle = vi.fn()
    renderSidebar('left', onWidthChange, onToggle)
    const edge = screen.getByTestId('sidebar-edge-resize-left')
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 300 })
    fireEvent.pointerMove(edge, { pointerId: 1, pointerType: 'mouse', clientX: 360 })
    fireEvent.pointerUp(edge, { pointerId: 1, pointerType: 'mouse' })
    expect(onWidthChange).toHaveBeenLastCalledWith(360)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('drag from the edge strip works with touch pointers', () => {
    const onWidthChange = vi.fn()
    renderSidebar('left', onWidthChange)
    const edge = screen.getByTestId('sidebar-edge-resize-left')
    expect(edge.style.touchAction).toBe('none')
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 300 })
    fireEvent.pointerMove(edge, { pointerId: 1, pointerType: 'touch', clientX: 360 })
    fireEvent.pointerUp(edge, { pointerId: 1, pointerType: 'touch' })
    expect(onWidthChange).toHaveBeenLastCalledWith(360)
  })

  it('drags the right sidebar wider by moving left, and a click does not collapse it', () => {
    const onWidthChange = vi.fn()
    const onToggle = vi.fn()
    renderSidebar('right', onWidthChange, onToggle)
    const edge = screen.getByTestId('sidebar-edge-resize-right')
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 700 })
    fireEvent.pointerMove(edge, { pointerId: 1, pointerType: 'mouse', clientX: 640 })
    fireEvent.pointerUp(edge, { pointerId: 1, pointerType: 'mouse' })
    expect(onWidthChange).toHaveBeenLastCalledWith(360)
    fireEvent.pointerDown(edge, { button: 0, pointerId: 2, pointerType: 'mouse', clientX: 700 })
    fireEvent.pointerUp(edge, { pointerId: 2, pointerType: 'mouse' })
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('pointercancel stops the resize without toggling', () => {
    const onWidthChange = vi.fn()
    const onToggle = vi.fn()
    renderSidebar('left', onWidthChange, onToggle)
    const edge = screen.getByTestId('sidebar-edge-resize-left')
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 300 })
    fireEvent.pointerMove(edge, { pointerId: 1, pointerType: 'touch', clientX: 360 })
    fireEvent.pointerCancel(edge, { pointerId: 1, pointerType: 'touch' })
    const calls = onWidthChange.mock.calls.length
    fireEvent.pointerMove(edge, { pointerId: 1, pointerType: 'touch', clientX: 500 })
    expect(onWidthChange).toHaveBeenCalledTimes(calls)
    expect(onToggle).not.toHaveBeenCalled()
  })
})

describe('Sidebar toggle button as resize handle', () => {
  const getToggle = () => screen.getByRole('button', { name: 'Collapse left sidebar' })

  it('a tap toggles, a drag resizes without toggling (mouse)', () => {
    const onWidthChange = vi.fn()
    const onToggle = vi.fn()
    renderSidebar('left', onWidthChange, onToggle)
    const toggle = getToggle()
    expect(toggle.style.touchAction).toBe('none')

    // Tap: pointerdown + pointerup without crossing the threshold.
    fireEvent.pointerDown(toggle, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 300 })
    fireEvent.pointerUp(toggle, { pointerId: 1, pointerType: 'mouse', clientX: 300 })
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onWidthChange).not.toHaveBeenCalled()

    // Drag: cross the threshold, no toggle.
    fireEvent.pointerDown(toggle, { button: 0, pointerId: 2, pointerType: 'mouse', clientX: 300 })
    fireEvent.pointerMove(toggle, { pointerId: 2, pointerType: 'mouse', clientX: 360 })
    fireEvent.pointerUp(toggle, { pointerId: 2, pointerType: 'mouse', clientX: 360 })
    expect(onWidthChange).toHaveBeenLastCalledWith(360)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('touch tap toggles and touch drag resizes', () => {
    const onWidthChange = vi.fn()
    const onToggle = vi.fn()
    renderSidebar('left', onWidthChange, onToggle)
    const toggle = getToggle()

    fireEvent.pointerDown(toggle, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 300 })
    fireEvent.pointerUp(toggle, { pointerId: 1, pointerType: 'touch', clientX: 300 })
    expect(onToggle).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(toggle, { button: 0, pointerId: 2, pointerType: 'touch', clientX: 300 })
    fireEvent.pointerMove(toggle, { pointerId: 2, pointerType: 'touch', clientX: 360 })
    fireEvent.pointerUp(toggle, { pointerId: 2, pointerType: 'touch', clientX: 360 })
    expect(onWidthChange).toHaveBeenLastCalledWith(360)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
