import { useEffect } from 'react'

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener?: (type: 'release', cb: () => void) => void
}

/**
 * Holds a Screen Wake Lock while `active` and the page is visible, so the OS does not
 * dim/sleep the display or start the screensaver during play. No-ops when unsupported.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    const wakeLock = typeof navigator !== 'undefined' ? navigator.wakeLock : undefined
    if (!active || !wakeLock || typeof wakeLock.request !== 'function') return

    let sentinel: WakeLockSentinelLike | null = null
    let disposed = false
    let pending = false
    let logged = false

    const release = () => {
      const s = sentinel
      sentinel = null
      if (s) void Promise.resolve(s.release()).catch(() => {})
    }

    const acquire = async () => {
      if (disposed || sentinel || pending || document.visibilityState !== 'visible') return
      pending = true
      try {
        const s = (await wakeLock.request('screen')) as WakeLockSentinelLike
        if (disposed || document.visibilityState !== 'visible') {
          void Promise.resolve(s.release()).catch(() => {})
          return
        }
        sentinel = s
        s.addEventListener?.('release', () => {
          if (sentinel === s) sentinel = null
        })
      } catch (err) {
        if (!logged) {
          logged = true
          console.debug('[wakeLock] request failed', err)
        }
      } finally {
        pending = false
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
      else release()
    }
    const onFocus = () => void acquire()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    void acquire()

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      release()
    }
  }, [active])
}
