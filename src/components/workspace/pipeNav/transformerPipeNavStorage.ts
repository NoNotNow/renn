const SIDEBAR_MIN_PX = 200
const SIDEBAR_DEFAULT_PX = 240
const OPEN_KEY = 'rennTransformerPipeNavOpen'
const WIDTH_KEY = 'rennTransformerPipeNavWidthPx'

export function readPipeNavOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

export function writePipeNavOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    /* ignore */
  }
}

export function readPipeNavWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(n) && n >= SIDEBAR_MIN_PX ? n : SIDEBAR_DEFAULT_PX
  } catch {
    return SIDEBAR_DEFAULT_PX
  }
}
