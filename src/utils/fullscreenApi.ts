type KeyboardLockNavigator = Navigator & {
  keyboard?: {
    lock: (keys: string[]) => Promise<void>
    unlock: () => void
  }
}

/** True when the Keyboard Lock API can capture Escape (Chrome/Edge). */
export function isEscapeKeyboardLockSupported(): boolean {
  return typeof (navigator as KeyboardLockNavigator).keyboard?.lock === 'function'
}

/**
 * Lock Escape while fullscreen so Chromium requires press-and-hold to exit instead of a
 * single keypress (Shift+Escape can then open Workspace without leaving fullscreen).
 */
export async function lockEscapeKeyIfSupported(): Promise<void> {
  const keyboard = (navigator as KeyboardLockNavigator).keyboard
  if (!keyboard?.lock) return
  try {
    await keyboard.lock(['Escape'])
  } catch {
    // Fullscreen not active yet, permission denied, or unsupported platform.
  }
}

export function unlockKeyboardIfSupported(): void {
  const keyboard = (navigator as KeyboardLockNavigator).keyboard
  keyboard?.unlock?.()
}

/**
 * Fallback when Keyboard Lock is unavailable: re-request fullscreen on the next microtask
 * while the Shift+Escape keydown user activation may still be valid.
 */
export function scheduleFullscreenRestoreOnShiftEscape(el: HTMLElement): void {
  queueMicrotask(() => {
    if (getFullscreenElement() === el) return
    void requestFullscreenElement(el).catch(() => {})
  })
}

/** Cross-browser fullscreen element (standard + legacy). */
export function getFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null
    mozFullScreenElement?: Element | null
  }
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? d.mozFullScreenElement ?? null
}

export function isFullscreenEnabled(): boolean {
  const d = document as Document & {
    webkitFullscreenEnabled?: boolean
    mozFullScreenEnabled?: boolean
  }
  return Boolean(document.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? d.mozFullScreenEnabled)
}

export async function requestFullscreenElement(el: HTMLElement): Promise<void> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => void
    mozRequestFullScreen?: () => void
  }
  if (typeof el.requestFullscreen === 'function') {
    await el.requestFullscreen()
    return
  }
  if (typeof anyEl.webkitRequestFullscreen === 'function') {
    anyEl.webkitRequestFullscreen()
    return
  }
  if (typeof anyEl.mozRequestFullScreen === 'function') {
    anyEl.mozRequestFullScreen()
    return
  }
  throw new Error('Fullscreen API unavailable')
}

export async function exitFullscreenDocument(): Promise<void> {
  const d = document as Document & {
    webkitExitFullscreen?: () => void
    mozCancelFullScreen?: () => void
  }
  if (typeof document.exitFullscreen === 'function') {
    await document.exitFullscreen()
    return
  }
  if (typeof d.webkitExitFullscreen === 'function') {
    d.webkitExitFullscreen()
    return
  }
  if (typeof d.mozCancelFullScreen === 'function') {
    d.mozCancelFullScreen()
    return
  }
  await Promise.resolve()
}

const FULLSCREEN_CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'] as const

export function addFullscreenChangeListener(handler: () => void): () => void {
  for (const ev of FULLSCREEN_CHANGE_EVENTS) {
    document.addEventListener(ev, handler)
  }
  return () => {
    for (const ev of FULLSCREEN_CHANGE_EVENTS) {
      document.removeEventListener(ev, handler)
    }
  }
}
