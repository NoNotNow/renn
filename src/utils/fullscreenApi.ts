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
