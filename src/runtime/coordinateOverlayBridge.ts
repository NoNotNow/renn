/**
 * Builder coordinate overlay: collects `api.visualizeCoordinate()` calls when wired from SceneView.
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
  coord: Vec3
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

export function publishCoordinateValue(entityId: string, coord: Vec3, color: string): void {
  if (_coordinateFn == null) return
  if (_displayEntityId == null || entityId !== _displayEntityId) return
  if (_entries.length >= COORDINATE_OVERLAY_MAX_COUNT) return
  if (
    !Number.isFinite(coord[0]) ||
    !Number.isFinite(coord[1]) ||
    !Number.isFinite(coord[2])
  )
    return
  _entries.push({ coord: [coord[0], coord[1], coord[2]], color: String(color) })
}
