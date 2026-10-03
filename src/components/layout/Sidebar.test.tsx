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
  it('drags the left sidebar wider from the edge strip without toggling', () => {
    const onWidthChange = vi.fn()
    const onToggle = vi.fn()
    renderSidebar('left', onWidthChange, onToggle)
    fireEvent.mouseDown(screen.getByTestId('sidebar-edge-resize-left'), { clientX: 300 })
    fireEvent.mouseMove(document, { clientX: 360 })
    fireEvent.mouseUp(document)
    expect(onWidthChange).toHaveBeenLastCalledWith(360)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('drags the right sidebar wider by moving left, and a click does not collapse it', () => {
    const onWidthChange = vi.fn()
    const onToggle = vi.fn()
    renderSidebar('right', onWidthChange, onToggle)
    const edge = screen.getByTestId('sidebar-edge-resize-right')
    fireEvent.mouseDown(edge, { clientX: 700 })
    fireEvent.mouseMove(document, { clientX: 640 })
    fireEvent.mouseUp(document)
    expect(onWidthChange).toHaveBeenLastCalledWith(360)
    fireEvent.mouseDown(edge, { clientX: 700 })
    fireEvent.mouseUp(document)
    expect(onToggle).not.toHaveBeenCalled()
  })
})
