import { useEffect } from 'react'
import { isKeyboardEventInEditableContext } from '@/input/rawInput'
import { cycleCameraMode, type CameraMode } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'

export interface BuilderKeyboardShortcutsApi {
  /** Cmd/Ctrl + Z */
  onUndo: () => void
  /** Cmd/Ctrl + Shift + Z, Cmd/Ctrl + Y */
  onRedo: () => void
  /** Escape (without Shift) — clear selection */
  onClearSelection: () => void
  /** Cmd/Ctrl + E — toggle edit-navigation mode */
  onToggleEditNavigationMode: () => void
  /** Digit1 / Numpad1 — cycle active avatar; returns true when an avatar was cycled */
  onCycleActiveAvatar: () => boolean
  /** Digit0 / Numpad0 — cycle camera mode (returns next mode for logging) */
  onChangeCameraMode: (next: (prev: CameraMode) => CameraMode) => void
  /** Cmd/Ctrl + G — group current selection (entities + groups) */
  onGroupSelection: () => void
  /** Cmd/Ctrl + Shift + G — ungroup currently selected single group */
  onUngroupSelection: () => void
  /** Cmd/Ctrl + C — copy selected entities (skipped when user text is selected) */
  onCopy: () => void
  /** Cmd/Ctrl + V — paste entities in front of camera */
  onPaste: () => void
  /** Cmd/Ctrl + S — save project */
  onSave: () => void
  /** Cmd/Ctrl + Shift + S — save project as */
  onSaveAs: () => void
  /** Cmd/Ctrl + N — new project */
  onNew: () => void
  /** Cmd/Ctrl + P — play */
  onPlay: () => void
  /** Shift + Escape — open workspace */
  onOpenWorkspace: () => void
}

/**
 * Wires Builder-level keyboard shortcuts:
 *   Cmd/Ctrl+Z      undo
 *   Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y  redo
 *   Escape          clear selection
 *   Shift+Escape    open workspace
 *   Cmd/Ctrl+E      toggle edit-navigation mode
 *   1 (Digit1)      cycle active avatar
 *   0 (Digit0)      cycle camera mode
 *   Cmd/Ctrl+G      group current selection
 *   Cmd/Ctrl+Shift+G  ungroup currently selected group
 *   Cmd/Ctrl+C      copy selected entities (no-op if UI text is selected)
 *   Cmd/Ctrl+V      paste in front of camera
 *   Cmd/Ctrl+S      save
 *   Cmd/Ctrl+Shift+S  save as
 *   Cmd/Ctrl+N      new project
 *   Cmd/Ctrl+P      play
 *
 * All shortcuts are no-ops while typing in a text field, select, contentEditable, or code editor.
 */
export function useBuilderKeyboardShortcuts(api: BuilderKeyboardShortcutsApi): void {
  const {
    onUndo,
    onRedo,
    onClearSelection,
    onToggleEditNavigationMode,
    onCycleActiveAvatar,
    onChangeCameraMode,
    onGroupSelection,
    onUngroupSelection,
    onCopy,
    onPaste,
    onSave,
    onSaveAs,
    onNew,
    onPlay,
    onOpenWorkspace,
  } = api

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isKeyboardEventInEditableContext(e)) return

      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && e.key === 'c') {
        if (typeof window !== 'undefined' && (window.getSelection()?.toString().length ?? 0) > 0) return
        e.preventDefault()
        onCopy()
        return
      }
      if (mod && !e.shiftKey && e.key === 'v') {
        e.preventDefault()
        onPaste()
        return
      }
      if (mod && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault()
        onSaveAs()
        return
      }
      if (mod && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        onSave()
        return
      }
      if (mod && !e.shiftKey && e.code === 'KeyN') {
        e.preventDefault()
        onNew()
        return
      }
      if (mod && !e.shiftKey && e.code === 'KeyP') {
        e.preventDefault()
        onPlay()
        return
      }
      if (mod && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) onRedo()
        else onUndo()
        return
      }
      if (mod && e.key === 'y') {
        e.preventDefault()
        onRedo()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (e.shiftKey) {
          onOpenWorkspace()
        } else {
          onClearSelection()
        }
        return
      }
      if (mod && !e.shiftKey && e.code === 'KeyE') {
        e.preventDefault()
        onToggleEditNavigationMode()
        return
      }
      if (mod && e.code === 'KeyG') {
        e.preventDefault()
        if (e.shiftKey) onUngroupSelection()
        else onGroupSelection()
        return
      }
      if (e.code === 'Digit1' || e.code === 'Numpad1') {
        e.preventDefault()
        if (onCycleActiveAvatar()) {
          uiLogger.change('Builder', 'Cycle active avatar', {})
        }
        return
      }
      if (e.code !== 'Digit0' && e.code !== 'Numpad0') return
      e.preventDefault()
      onChangeCameraMode((prev) => {
        const next = cycleCameraMode(prev)
        uiLogger.change('Builder', 'Change camera mode', { mode: next })
        return next
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    onUndo,
    onRedo,
    onClearSelection,
    onToggleEditNavigationMode,
    onCycleActiveAvatar,
    onChangeCameraMode,
    onGroupSelection,
    onUngroupSelection,
    onCopy,
    onPaste,
    onSave,
    onSaveAs,
    onNew,
    onPlay,
    onOpenWorkspace,
  ])
}
