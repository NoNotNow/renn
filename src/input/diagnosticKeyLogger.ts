/**
 * Diagnostic key logger to debug input issues.
 * Call attachDiagnosticKeyLogger() from React component to enable.
 */

interface KeyEventLog {
  timestamp: number
  type: 'keydown' | 'keyup' | 'blur'
  code: string
  state: Record<string, boolean>
}

const logs: KeyEventLog[] = []
let isLogging = false

export function attachDiagnosticKeyLogger(keysRef: React.RefObject<any>) {
  if (isLogging) return
  isLogging = true

  const onKeyDown = (e: KeyboardEvent) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      logs.push({
        timestamp: Date.now(),
        type: 'keydown',
        code: e.code,
        state: { ...keysRef.current },
      })
      if (logs.length > 100) logs.shift()
      console.log('[KEY DOWN]', e.code, keysRef.current)
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      logs.push({
        timestamp: Date.now(),
        type: 'keyup',
        code: e.code,
        state: { ...keysRef.current },
      })
      if (logs.length > 100) logs.shift()
      console.log('[KEY UP]', e.code, keysRef.current)
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  // Expose logs globally for debugging
  ;(window as any).__keyLogs = logs
  ;(window as any).__dumpKeyLogs = () => {
    console.table(logs)
  }
}

export function getKeyLogs() {
  return logs
}
