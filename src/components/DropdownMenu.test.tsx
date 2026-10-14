import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DropdownMenu, { type MenuItemConfig } from './DropdownMenu'
import { theme } from '@/config/theme'

const items: MenuItemConfig[] = [
  { type: 'item', label: 'Open training', onClick: vi.fn() },
  { type: 'separator' },
  { type: 'item', label: 'Disabled one', disabled: true },
  { type: 'submenu', label: 'More', items: [{ type: 'item', label: 'Nested one', onClick: vi.fn() }] },
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DropdownMenu', () => {
  it('opens the menu portaled to document.body (escapes the header stacking context) above every dialog', () => {
    render(<DropdownMenu label="File" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    const panel = screen.getByRole('menu')
    // portaled: the panel's parent is the body, so it layers independently of the top menu
    expect(panel.parentElement).toBe(document.body)
    expect(panel.style.position).toBe('fixed')
    // above the top menu bar and above every dialog layer (menus stay usable while a dialog is open)
    expect(Number(panel.style.zIndex)).toBeGreaterThan(theme.zIndex.header)
    expect(Number(panel.style.zIndex)).toBeGreaterThan(theme.zIndex.floatingDialog)
    expect(Number(panel.style.zIndex)).toBeGreaterThan(theme.zIndex.modal)
  })

  it('runs the item handler and closes the menu on item click', () => {
    const onClick = vi.fn()
    render(<DropdownMenu label="File" items={[{ type: 'item', label: 'Open training', onClick }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Open training/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on outside mousedown (the portaled panel counts as inside)', () => {
    render(<DropdownMenu label="File" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // mousedown inside the portaled panel does NOT close the menu
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: /Open training/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // mousedown outside does
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<DropdownMenu label="File" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
