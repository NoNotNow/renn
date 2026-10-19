import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import WorkspaceDocsSplit from './WorkspaceDocsSplit'

vi.mock('@/components/TransformerDocs', () => ({
  TransformerDocsContent: () => null,
}))

const DOCS_WIDTH_STORAGE_KEY = 'rennWorkspaceTransformerDocsWidthPx'

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

const ROW_CLIENT_WIDTH_PX = 800
const DOCS_MEASURED_WIDTH_PX = 400

let storage: Map<string, string>

function renderSplit(open = true) {
  const utils = render(
    <WorkspaceDocsSplit open={open} onClose={vi.fn()}>
      <div />
    </WorkspaceDocsSplit>,
  )
  const handle = screen.getByTestId('workspace-docs-split-handle') as HTMLElement
  const row = handle.parentElement as HTMLElement
  const docs = screen.getByTestId('workspace-docs-panel') as HTMLElement
  // jsdom has no layout; give the split row and the docs panel real boxes.
  Object.defineProperty(row, 'clientWidth', { get: () => ROW_CLIENT_WIDTH_PX, configurable: true })
  vi.spyOn(docs, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: DOCS_MEASURED_WIDTH_PX,
    bottom: 100,
    width: DOCS_MEASURED_WIDTH_PX,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  return { ...utils, handle }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WorkspaceDocsSplit drag', () => {
  it('mouse drag on the splitter shrinks the docs column and persists the width', () => {
    storage = stubLocalStorage()
    const { handle } = renderSplit()
    expect(handle.style.touchAction).toBe('none')

    // Docs sits on the right: dragging the splitter right (positive dx) narrows it.
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'mouse', clientX: 150 })
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'mouse', clientX: 150 })

    const docs = screen.getByTestId('workspace-docs-panel') as HTMLElement
    expect(docs.style.width).toBe('350px')
    expect(storage.get(DOCS_WIDTH_STORAGE_KEY)).toBe('350')
  })

  it('touch drag widens the docs column', () => {
    storage = stubLocalStorage()
    const { handle } = renderSplit()

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientX: 50 })
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'touch', clientX: 50 })

    const docs = screen.getByTestId('workspace-docs-panel') as HTMLElement
    expect(docs.style.width).toBe('450px')
    expect(storage.get(DOCS_WIDTH_STORAGE_KEY)).toBe('450')
  })

  it('pointercancel clears the drag and does not persist', () => {
    storage = stubLocalStorage()
    const { handle } = renderSplit()

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientX: 150 })
    fireEvent.pointerCancel(handle, { pointerId: 1, pointerType: 'touch', clientX: 150 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientX: 400 })

    expect(storage.get(DOCS_WIDTH_STORAGE_KEY)).toBeUndefined()
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  it('lostpointercapture mid-drag ends as cancelled (body cursor/user-select cleaned, no persist)', () => {
    storage = stubLocalStorage()
    const { handle } = renderSplit()

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientX: 150 })
    expect(document.body.style.cursor).toBe('ew-resize')

    // Capture lost without a pointerup/pointercancel (element removed mid-drag, browser edge case).
    fireEvent(
      handle,
      new PointerEvent('lostpointercapture', { pointerId: 1, pointerType: 'touch', bubbles: true }),
    )
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientX: 400 })

    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    expect(storage.get(DOCS_WIDTH_STORAGE_KEY)).toBeUndefined()
  })
})

