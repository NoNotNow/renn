import { useEffect } from 'react'

const BUILDER_HREF = `${import.meta.env.BASE_URL || '/'}`

/**
 * Play page: Cmd/Ctrl+P returns to Builder (mirrors Builder's play shortcut).
 */
export function usePlayModeKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && e.code === 'KeyP') {
        e.preventDefault()
        window.location.href = BUILDER_HREF
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
