import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_DURATION_SEC = 3

/**
 * Short-lived status message (e.g. Builder save acknowledgment).
 * Returns the current message and `showSnackbar` to display it with an auto-dismiss timer.
 */
export function useTransientSnackbar(defaultDurationSec = DEFAULT_DURATION_SEC): {
  message: string | null
  showSnackbar: (text: string, durationSec?: number) => void
} {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const showSnackbar = useCallback(
    (text: string, durationSec = defaultDurationSec) => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current)
      }
      setMessage(text)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined
        setMessage(null)
      }, durationSec * 1000)
    },
    [defaultDurationSec],
  )

  useEffect(
    () => () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    },
    [],
  )

  return { message, showSnackbar }
}
