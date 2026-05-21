/**
 * Builder coordinate overlay: collects `api.visualizeLine()` calls when wired from SceneView.
 * No-op when `_coordinateFn` is null (Play, tests, or non-visualize gizmo mode).
 * Entries are cleared at the start of each physics step in `executeTransformers` (so render-only
 * rAF frames keep the last published lines and do not flicker), and when the visualize display
 * entity id changes in `SceneView` `onFrameStart`.
 */
import type { Vec3 } from '@/types/world'

/** Maximum coordinate entries rendered per frame (higher indices are ignored). */
export const COORDINATE_OVERLAY_MAX_COUNT = 16

export type CoordinateOverlayWireFn = () => void

export interface CoordinateOverlayEntry {
  from: Vec3
  to: Vec3
  color: string
}

let _coordinateFn: CoordinateOverlayWireFn | null = null
let _displayEntityId: string | null = null
const _entries: CoordinateOverlayEntry[] = []

export function setCoordinateOverlayDisplayEntityId(id: string | null): void {
  _displayEntityId = id
}

export function setCoordinateOverlayFn(fn: CoordinateOverlayWireFn | null): void {
  _coordinateFn = fn
  if (fn == null) {
    clearCoordinateEntries()
  }
}

export function clearCoordinateEntries(): void {
  _entries.length = 0
}

export function getCoordinateOverlayEntries(): CoordinateOverlayEntry[] {
  return _entries.slice()
}

export function publishLineValue(entityId: string, from: Vec3, to: Vec3, color: string): void {
  if (_coordinateFn == null) return
  if (_displayEntityId == null || entityId !== _displayEntityId) return
  if (_entries.length >= COORDINATE_OVERLAY_MAX_COUNT) return
  if (
    !Number.isFinite(from[0]) ||
    !Number.isFinite(from[1]) ||
    !Number.isFinite(from[2]) ||
    !Number.isFinite(to[0]) ||
    !Number.isFinite(to[1]) ||
    !Number.isFinite(to[2])
  )
    return
  _entries.push({
    from: [from[0], from[1], from[2]],
    to: [to[0], to[1], to[2]],
    color: String(color),
  })
}
