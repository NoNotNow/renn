import { useEffect } from 'react'
import { cycleCameraMode, type CameraMode } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'

/**
 * Returns true when the focused element is a text input / textarea / select / contentEditable.
 * Keyboard shortcuts that would collide with normal typing are suppressed in those cases.
 */
function isEditableElement(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  )
}

export interface BuilderKeyboardShortcutsApi {
  /** Cmd/Ctrl + Z */
  onUndo: () => void
  /** Cmd/Ctrl + Shift + Z, Cmd/Ctrl + Y */
  onRedo: () => void
  /** Escape — clear selection */
  onClearSelection: () => void
  /** Cmd/Ctrl + E — toggle edit-navigation mode */
  onToggleEditNavigationMode: () => void
  /** Digit1 / Numpad1 — cycle active avatar; returns true when an avatar was cycled */
  onCycleActiveAvatar: () => boolean
  /** Digit0 / Numpad0 — cycle camera mode (returns next mode for logging) */
  onChangeCameraMode: (next: (prev: CameraMode) => CameraMode) => void
}

/**
 * Wires Builder-level keyboard shortcuts:
 *   Cmd/Ctrl+Z      undo
 *   Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y  redo
 *   Escape          clear selection
 *   Cmd/Ctrl+E      toggle edit-navigation mode
 *   1 (Digit1)      cycle active avatar
 *   0 (Digit0)      cycle camera mode
 *
 * All shortcuts are no-ops while the focus is on an editable element.
 */
export function useBuilderKeyboardShortcuts(api: BuilderKeyboardShortcutsApi): void {
  const {
    onUndo,
    onRedo,
    onClearSelection,
    onToggleEditNavigationMode,
    onCycleActiveAvatar,
    onChangeCameraMode,
  } = api

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z') {
        if (isEditableElement()) return
        e.preventDefault()
        if (e.shiftKey) onRedo()
        else onUndo()
        return
      }
      if (mod && e.key === 'y') {
        if (isEditableElement()) return
        e.preventDefault()
        onRedo()
        return
      }
      if (e.key === 'Escape') {
        if (isEditableElement()) return
        e.preventDefault()
        onClearSelection()
        return
      }
      if (mod && !e.shiftKey && e.code === 'KeyE') {
        if (isEditableElement()) return
        e.preventDefault()
        onToggleEditNavigationMode()
        return
      }
      if (e.code === 'Digit1' || e.code === 'Numpad1') {
        if (isEditableElement()) return
        e.preventDefault()
        if (onCycleActiveAvatar()) {
          uiLogger.change('Builder', 'Cycle active avatar', {})
        }
        return
      }
      if (e.code !== 'Digit0' && e.code !== 'Numpad0') return
      if (isEditableElement()) return
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
  ])
}
