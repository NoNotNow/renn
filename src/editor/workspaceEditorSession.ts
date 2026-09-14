import type { editor } from 'monaco-editor'
import {
  loadWorkspaceEditorViewState,
  saveWorkspaceEditorViewState,
  type WorkspaceEditorViewState,
} from '@/utils/workspaceEditorViewState'

/** Ignore scroll/cursor saves briefly after a programmatic restore (Monaco emits scroll=0). */
export const WORKSPACE_EDITOR_SUPPRESS_SAVE_MS = 400
/** How long after the last keystroke the user still counts as actively editing. */
export const WORKSPACE_EDITOR_TYPING_QUIET_MS = 600
/** Second restore attempt, for when the editor was not ready on the first. */
export const WORKSPACE_EDITOR_RESTORE_RETRY_MS = 250
/** Below this scroll offset, a non-zero saved position means Monaco jumped to the top. */
const SCROLL_JUMPED_TO_TOP_PX = 8

/** The slice of Monaco the session drives. Real editor in the app, fake one in tests. */
export interface WorkspaceEditorAdapter {
  saveViewState(): WorkspaceEditorViewState | null
  restoreViewState(state: WorkspaceEditorViewState): void
  getScrollTop(): number
  setScrollTop(top: number): void
  hasTextFocus(): boolean
  onDidChangeCursorPosition(listener: () => void): { dispose(): void }
  onDidScrollChange(listener: () => void): { dispose(): void }
  onDidDispose(listener: () => void): void
}

export interface WorkspaceEditorViewStateStore {
  save(key: string, state: WorkspaceEditorViewState): void
  load(key: string): WorkspaceEditorViewState | undefined
}

export interface WorkspaceEditorSessionDeps {
  store?: WorkspaceEditorViewStateStore
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => number
  clearTimer?: (id: number) => void
}

/**
 * Scroll/cursor save-and-restore policy for the shared Workspace Monaco instance.
 *
 * Owns the whole interaction between three competing forces: the user's live edits, Monaco's
 * own scroll resets during layout, and programmatic restores on item switch. Each method is
 * one moment in that interaction — call them from the matching React phase and nothing else.
 */
export interface WorkspaceEditorSession {
  /** Monaco is ready: start saving view state on its cursor/scroll events. */
  attachEditor(editor: WorkspaceEditorAdapter): void
  /** Layout phase: save the outgoing item, then arm a restore for `key`. */
  beginNavigation(key: string | null): void
  /** Effect phase: try the armed restore now, and once more after the retry delay. */
  requestRestore(): () => void
  /** The user typed — blocks programmatic restores until the quiet window elapses. */
  noteUserEdit(): void
  /** Force-save the current item, ignoring the suppress window (closing, unmounting). */
  persistNow(): void
  /** Monaco settled after a delayed layout: undo a scroll jump, retry a pending restore. */
  repairAfterLayout(): void
  dispose(): void
}

const defaultStore: WorkspaceEditorViewStateStore = {
  save: saveWorkspaceEditorViewState,
  load: loadWorkspaceEditorViewState,
}

export function createWorkspaceEditorSession(
  deps: WorkspaceEditorSessionDeps = {},
): WorkspaceEditorSession {
  const store = deps.store ?? defaultStore
  const now = deps.now ?? (() => performance.now())
  const setTimer = deps.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((id) => window.clearTimeout(id))

  let adapter: WorkspaceEditorAdapter | null = null
  let currentKey: string | null = null
  let suppressSaveUntil = 0
  let userTyping = false
  let restoreArmed = false
  let typingTimer: number | null = null
  let retryTimer: number | null = null

  const saveFor = (key: string | null, opts?: { force?: boolean }): void => {
    if (!adapter || !key) return
    if (!opts?.force && now() < suppressSaveUntil) return
    const state = adapter.saveViewState()
    if (state) store.save(key, state)
  }

  const savedScrollTopFor = (key: string): number => {
    const saved = store.load(key)
    return (saved as { scrollTop?: number } | undefined)?.scrollTop ?? 0
  }

  const tryRestore = (): void => {
    if (!restoreArmed || !adapter || !currentKey) return
    if (userTyping || adapter.hasTextFocus()) return

    const saved = store.load(currentKey)
    if (!saved) {
      restoreArmed = false
      return
    }

    suppressSaveUntil = now() + WORKSPACE_EDITOR_SUPPRESS_SAVE_MS
    adapter.restoreViewState(saved)
    const savedScrollTop = savedScrollTopFor(currentKey)
    if (savedScrollTop > 0) adapter.setScrollTop(savedScrollTop)
    restoreArmed = false
  }

  return {
    attachEditor(next) {
      adapter = next
      const onViewStateEvent = () => saveFor(currentKey)
      const disposeCursor = next.onDidChangeCursorPosition(onViewStateEvent)
      const disposeScroll = next.onDidScrollChange(onViewStateEvent)
      next.onDidDispose(() => {
        disposeCursor.dispose()
        disposeScroll.dispose()
      })
      tryRestore()
    },

    beginNavigation(key) {
      if (currentKey && currentKey !== key) {
        saveFor(currentKey, { force: true })
        restoreArmed = true
      }
      currentKey = key
    },

    requestRestore() {
      if (!currentKey) return () => {}
      restoreArmed = true
      tryRestore()
      retryTimer = setTimer(() => {
        retryTimer = null
        tryRestore()
      }, WORKSPACE_EDITOR_RESTORE_RETRY_MS)
      return () => {
        if (retryTimer != null) {
          clearTimer(retryTimer)
          retryTimer = null
        }
      }
    },

    noteUserEdit() {
      userTyping = true
      restoreArmed = false
      if (typingTimer != null) clearTimer(typingTimer)
      typingTimer = setTimer(() => {
        userTyping = false
        typingTimer = null
      }, WORKSPACE_EDITOR_TYPING_QUIET_MS)
    },

    persistNow() {
      saveFor(currentKey, { force: true })
    },

    repairAfterLayout() {
      if (adapter && currentKey && !userTyping) {
        const savedScrollTop = savedScrollTopFor(currentKey)
        if (savedScrollTop > 0 && adapter.getScrollTop() < SCROLL_JUMPED_TO_TOP_PX) {
          suppressSaveUntil = now() + WORKSPACE_EDITOR_SUPPRESS_SAVE_MS
          adapter.setScrollTop(savedScrollTop)
        }
      }
      tryRestore()
    },

    dispose() {
      if (typingTimer != null) {
        clearTimer(typingTimer)
        typingTimer = null
      }
      if (retryTimer != null) {
        clearTimer(retryTimer)
        retryTimer = null
      }
    },
  }
}

/** Adapt a real Monaco editor to the slice the session drives. */
export function monacoWorkspaceEditorAdapter(
  ed: editor.IStandaloneCodeEditor,
): WorkspaceEditorAdapter {
  return {
    saveViewState: () => ed.saveViewState(),
    restoreViewState: (state) => ed.restoreViewState(state),
    getScrollTop: () => ed.getScrollTop(),
    setScrollTop: (top) => ed.setScrollTop(top),
    hasTextFocus: () => ed.hasTextFocus?.() ?? false,
    onDidChangeCursorPosition: (listener) => ed.onDidChangeCursorPosition(() => listener()),
    onDidScrollChange: (listener) => ed.onDidScrollChange(() => listener()),
    onDidDispose: (listener) => {
      ed.onDidDispose(() => listener())
    },
  }
}
