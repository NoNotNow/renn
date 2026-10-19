import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import WorkspaceFloatingDrawer from './WorkspaceFloatingDrawer'

const STORAGE_KEY = 'rennTestDrawerLayout'

/** Map-backed localStorage stub (jsdom in this setup lacks a complete Storage). */
function stubLocalStorage(): Map<string, string> {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  })
  return storage
}

let storage: Map<string, string>

function renderDrawer(props: Partial<React.ComponentProps<typeof WorkspaceFloatingDrawer>> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const utils = render(
    <WorkspaceFloatingDrawer
      title="Watch"
      onClose={vi.fn()}
      portalTarget={host}
      testId="drawer"
      positionStorageKey={STORAGE_KEY}
      {...props}
    >
      <div />
    </WorkspaceFloatingDrawer>,
  )
  return { ...utils, host, drawer: screen.getByTestId('drawer') as HTMLElement }
}

function getHeader(drawer: HTMLElement): HTMLElement {
  return drawer.firstElementChild as HTMLElement
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WorkspaceFloatingDrawer header drag', () => {
  it('mouse drag moves the drawer and persists the layout', () => {
    storage = stubLocalStorage()
    const { drawer } = renderDrawer()
    const header = getHeader(drawer)
    expect(header.style.touchAction).toBe('none')

    fireEvent.pointerDown(header, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientX: 140, clientY: 140 })
    fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'mouse' })

    expect(drawer.style.left).toBe('40px')
    expect(drawer.style.top).toBe('52px')
    expect(JSON.parse(storage.get(STORAGE_KEY) ?? '{}')).toEqual({ x: 40, y: 52 })
  })

  it('touch drag moves the drawer like a mouse drag', () => {
    storage = stubLocalStorage()
    const { drawer } = renderDrawer()
    const header = getHeader(drawer)

    fireEvent.pointerDown(header, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'touch', clientX: 160, clientY: 120 })
    fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'touch' })

    expect(drawer.style.left).toBe('60px')
    expect(drawer.style.top).toBe('32px')
  })

  it('pointerdown on the close button does not start a drag', () => {
    storage = stubLocalStorage()
    const { drawer } = renderDrawer()
    const closeButton = getHeader(drawer).querySelector('button') as HTMLElement

    fireEvent.pointerDown(closeButton, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 })
    fireEvent.pointerMove(getHeader(drawer), { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 200 })
    fireEvent.pointerUp(getHeader(drawer), { pointerId: 1, pointerType: 'mouse' })

    expect(drawer.style.left).toBe('0px')
  })

  it('pointercancel ends the drag and ignores later moves', () => {
    storage = stubLocalStorage()
    const { drawer } = renderDrawer()
    const header = getHeader(drawer)

    fireEvent.pointerDown(header, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'touch', clientX: 140, clientY: 140 })
    fireEvent.pointerCancel(header, { pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 300 })

    expect(drawer.style.left).toBe('40px')
  })
})

describe('WorkspaceFloatingDrawer resize handles', () => {
  it('handles have touch-action none and a >=24px hit target', () => {
    storage = stubLocalStorage()
    const { drawer } = renderDrawer({ resizable: true, maxWidth: 600 })
    for (const edge of ['left', 'right', 'bottom', 'left-corner', 'corner']) {
      const handle = drawer.querySelector(`[data-testid="resize-handle-${edge}"]`) as HTMLElement
      expect(handle).not.toBeNull()
      expect(handle.style.touchAction).toBe('none')
      const hit = edge === 'bottom' ? handle.style.height : handle.style.width
      expect(parseFloat(hit)).toBeGreaterThanOrEqual(24)
    }
  })

  it('mouse drag on the right edge widens the drawer', () => {
    storage = stubLocalStorage()
    const { drawer } = renderDrawer({ resizable: true, maxWidth: 600 })
    const handle = drawer.querySelector('[data-testid="resize-handle-right"]') as HTMLElement

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'mouse', clientX: 150 })
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'mouse' })

    expect(drawer.style.width).toBe('410px')
    const stored = JSON.parse(storage.get(STORAGE_KEY) ?? '{}')
    expect(stored.width).toBe(410)
  })

  it('touch drag on the right edge widens the drawer', () => {
    storage = stubLocalStorage()
    const { drawer } = renderDrawer({ resizable: true, maxWidth: 600 })
    const handle = drawer.querySelector('[data-testid="resize-handle-right"]') as HTMLElement

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientX: 120 })
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'touch' })

    expect(drawer.style.width).toBe('380px')
  })
})
