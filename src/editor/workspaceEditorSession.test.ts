import { describe, it, expect, beforeEach } from 'vitest'
import type { WorkspaceEditorViewState } from '@/utils/workspaceEditorViewState'
import {
  createWorkspaceEditorSession,
  WORKSPACE_EDITOR_RESTORE_RETRY_MS,
  WORKSPACE_EDITOR_SUPPRESS_SAVE_MS,
  WORKSPACE_EDITOR_TYPING_QUIET_MS,
  type WorkspaceEditorAdapter,
  type WorkspaceEditorSession,
  type WorkspaceEditorViewStateStore,
} from './workspaceEditorSession'

function viewState(scrollTop: number, lineNumber = 1): WorkspaceEditorViewState {
  return { scrollTop, lineNumber } as unknown as WorkspaceEditorViewState
}

function scrollTopOf(state: WorkspaceEditorViewState | undefined): number | undefined {
  return (state as { scrollTop?: number } | undefined)?.scrollTop
}

/** Stand-in for Monaco: records what the session asked it to do. */
function createFakeEditor() {
  let scrollTop = 0
  let lineNumber = 1
  let focused = false
  const cursorListeners: (() => void)[] = []
  const scrollListeners: (() => void)[] = []
  const disposeListeners: (() => void)[] = []
  const restored: WorkspaceEditorViewState[] = []
  let disposedListenerCount = 0

  const adapter: WorkspaceEditorAdapter = {
    saveViewState: () => viewState(scrollTop, lineNumber),
    restoreViewState: (state) => {
      restored.push(state)
      scrollTop = scrollTopOf(state) ?? 0
      lineNumber = (state as { lineNumber?: number }).lineNumber ?? 1
    },
    getScrollTop: () => scrollTop,
    setScrollTop: (top) => {
      scrollTop = top
    },
    hasTextFocus: () => focused,
    onDidChangeCursorPosition: (listener) => {
      cursorListeners.push(listener)
      return {
        dispose: () => {
          disposedListenerCount += 1
        },
      }
    },
    onDidScrollChange: (listener) => {
      scrollListeners.push(listener)
      return {
        dispose: () => {
          disposedListenerCount += 1
        },
      }
    },
    onDidDispose: (listener) => {
      disposeListeners.push(listener)
    },
  }

  return {
    adapter,
    restored,
    get scrollTop() {
      return scrollTop
    },
    set scrollTop(next: number) {
      scrollTop = next
    },
    set lineNumber(next: number) {
      lineNumber = next
    },
    focus: (next: boolean) => {
      focused = next
    },
    emitCursorMove: () => cursorListeners.forEach((l) => l()),
    emitScroll: () => scrollListeners.forEach((l) => l()),
    emitDispose: () => disposeListeners.forEach((l) => l()),
    get disposedListenerCount() {
      return disposedListenerCount
    },
  }
}

/** Manual clock so the timing policy is asserted without faking globals. */
function createTestClock() {
  let now = 0
  let nextId = 1
  let timers: { id: number; at: number; fn: () => void }[] = []

  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++
      timers.push({ id, at: now + ms, fn })
      return id
    },
    clearTimer: (id: number) => {
      timers = timers.filter((t) => t.id !== id)
    },
    advance: (ms: number) => {
      now += ms
      const due = timers.filter((t) => t.at <= now)
      timers = timers.filter((t) => t.at > now)
      due.forEach((t) => t.fn())
    },
    get pendingCount() {
      return timers.length
    },
  }
}

function createStore(): WorkspaceEditorViewStateStore & { map: Map<string, WorkspaceEditorViewState> } {
  const map = new Map<string, WorkspaceEditorViewState>()
  return {
    map,
    save: (key, state) => {
      map.set(key, state)
    },
    load: (key) => map.get(key),
  }
}

describe('workspaceEditorSession', () => {
  let editor: ReturnType<typeof createFakeEditor>
  let clock: ReturnType<typeof createTestClock>
  let store: ReturnType<typeof createStore>
  let session: WorkspaceEditorSession

  beforeEach(() => {
    editor = createFakeEditor()
    clock = createTestClock()
    store = createStore()
    session = createWorkspaceEditorSession({
      store,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    })
    session.attachEditor(editor.adapter)
  })

  it('saves the outgoing item view state when navigating to another item', () => {
    session.beginNavigation('a')
    editor.scrollTop = 240
    editor.lineNumber = 12

    session.beginNavigation('b')

    expect(scrollTopOf(store.load('a'))).toBe(240)
    expect(store.load('b')).toBeUndefined()
  })

  it('restores the saved view state for the incoming item', () => {
    store.save('a', viewState(240, 12))
    session.beginNavigation('a')

    session.requestRestore()

    expect(scrollTopOf(editor.restored[0])).toBe(240)
    expect(editor.scrollTop).toBe(240)
  })

  it('does not restore while the user is typing', () => {
    store.save('a', viewState(240))
    session.beginNavigation('a')
    session.noteUserEdit()

    session.requestRestore()

    expect(editor.restored).toHaveLength(0)
  })

  it('does not restore while the editor holds text focus', () => {
    store.save('a', viewState(240))
    session.beginNavigation('a')
    editor.focus(true)

    session.requestRestore()

    expect(editor.restored).toHaveLength(0)
  })

  it('restores again once the typing quiet window has elapsed', () => {
    store.save('a', viewState(240))
    session.beginNavigation('a')
    session.noteUserEdit()
    session.requestRestore()
    expect(editor.restored).toHaveLength(0)

    clock.advance(WORKSPACE_EDITOR_TYPING_QUIET_MS)
    session.requestRestore()

    expect(scrollTopOf(editor.restored[0])).toBe(240)
  })

  it('retries a blocked restore after the retry delay', () => {
    store.save('a', viewState(240))
    session.beginNavigation('a')
    editor.focus(true)
    const cleanup = session.requestRestore()
    expect(editor.restored).toHaveLength(0)

    editor.focus(false)
    clock.advance(WORKSPACE_EDITOR_RESTORE_RETRY_MS)

    expect(scrollTopOf(editor.restored[0])).toBe(240)
    cleanup()
  })

  it('ignores cursor and scroll saves inside the suppress window after a restore', () => {
    store.save('a', viewState(240))
    session.beginNavigation('a')
    session.requestRestore()

    editor.scrollTop = 0
    editor.emitScroll()
    editor.emitCursorMove()

    expect(scrollTopOf(store.load('a'))).toBe(240)
  })

  it('saves on cursor move and scroll once the suppress window has passed', () => {
    session.beginNavigation('a')
    session.requestRestore()
    clock.advance(WORKSPACE_EDITOR_SUPPRESS_SAVE_MS)

    editor.scrollTop = 96
    editor.emitScroll()

    expect(scrollTopOf(store.load('a'))).toBe(96)
  })

  it('persistNow saves even inside the suppress window', () => {
    store.save('a', viewState(240))
    session.beginNavigation('a')
    session.requestRestore()

    editor.scrollTop = 512
    session.persistNow()

    expect(scrollTopOf(store.load('a'))).toBe(512)
  })

  it('repairs a scroll jump to the top after a delayed layout', () => {
    store.save('a', viewState(320))
    session.beginNavigation('a')
    session.requestRestore()
    clock.advance(WORKSPACE_EDITOR_SUPPRESS_SAVE_MS)
    editor.scrollTop = 0

    session.repairAfterLayout()

    expect(editor.scrollTop).toBe(320)
  })

  it('leaves a deliberate scroll near the top alone after a delayed layout', () => {
    store.save('a', viewState(320))
    session.beginNavigation('a')
    session.requestRestore()
    clock.advance(WORKSPACE_EDITOR_SUPPRESS_SAVE_MS)
    editor.scrollTop = 64

    session.repairAfterLayout()

    expect(editor.scrollTop).toBe(64)
  })

  it('never saves or restores without an item key', () => {
    session.beginNavigation(null)
    editor.scrollTop = 120

    session.requestRestore()
    session.persistNow()
    editor.emitScroll()

    expect(store.map.size).toBe(0)
    expect(editor.restored).toHaveLength(0)
  })

  it('disposes editor listeners and pending timers', () => {
    session.beginNavigation('a')
    session.noteUserEdit()
    expect(clock.pendingCount).toBe(1)

    session.dispose()

    expect(clock.pendingCount).toBe(0)
    editor.emitDispose()
    expect(editor.disposedListenerCount).toBe(2)
  })
})
