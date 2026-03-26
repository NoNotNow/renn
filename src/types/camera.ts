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
