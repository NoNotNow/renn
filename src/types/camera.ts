/**
 * Key states for free-fly camera controls
 */
export interface FreeFlyKeys {
  w: boolean
  a: boolean
  s: boolean
  d: boolean
  shift: boolean
  /** Alt / Option: W/S move along world up instead of forward. */
  alt: boolean
  arrowLeft: boolean
  arrowRight: boolean
  arrowUp: boolean
  arrowDown: boolean
}

/** Initial key state; shared by `CameraController` and `useKeyboardInput`. */
export const DEFAULT_FREE_FLY_KEYS: FreeFlyKeys = {
  w: false,
  a: false,
  s: false,
  d: false,
  shift: false,
  alt: false,
  arrowLeft: false,
  arrowRight: false,
  arrowUp: false,
  arrowDown: false,
}
