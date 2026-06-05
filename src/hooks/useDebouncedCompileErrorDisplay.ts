import { useEffect, useRef, useState, type RefObject } from 'react'

/** Delay before showing compile errors while the user is still typing. */
export const COMPILE_ERROR_DISPLAY_DEBOUNCE_MS = 500

/**
 * Debounces compile-error UI so incomplete syntax while typing does not flash errors.
 * Flushes immediately when focus leaves the Monaco editor inside `editorContainerRef`.
 */
export function useDebouncedCompileErrorDisplay(
  compileError: string | null,
  editorContainerRef: RefObject<HTMLElement | null>,
): string | null {
  const [displayed, setDisplayed] = useState<string | null>(null)
  const debounceTimerRef = useRef<number | null>(null)
  const compileErrorRef = useRef(compileError)
  compileErrorRef.current = compileError

  const clearDebounceTimer = (): void => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }

  const flushDisplayed = (): void => {
    clearDebounceTimer()
    setDisplayed(compileErrorRef.current)
  }

  useEffect(() => {
    clearDebounceTimer()

    if (compileError == null) {
      setDisplayed(null)
      return
    }

    setDisplayed(null)
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null
      setDisplayed(compileErrorRef.current)
    }, COMPILE_ERROR_DISPLAY_DEBOUNCE_MS)

    return clearDebounceTimer
  }, [compileError])

  useEffect(() => {
    const root = editorContainerRef.current
    if (!root) return

    const isFocusInsideMonaco = (): boolean => {
      const monacoRoot = root.querySelector('.monaco-editor')
      const active = document.activeElement
      return Boolean(monacoRoot && active instanceof Node && monacoRoot.contains(active))
    }

    const onFocusOut = (): void => {
      window.requestAnimationFrame(() => {
        if (isFocusInsideMonaco()) return
        if (compileErrorRef.current) flushDisplayed()
      })
    }

    root.addEventListener('focusout', onFocusOut)
    return () => root.removeEventListener('focusout', onFocusOut)
  }, [editorContainerRef])

  return displayed
}
