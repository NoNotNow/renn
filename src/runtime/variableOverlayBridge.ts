/**
 * Builder variable overlay: collects `api.visualize()` samples when wired from SceneView.
 * No-op when `_visualizeFn` is null (Play, tests, or non-visualize gizmo mode).
 */

/** Indices above this are ignored (keeps slot map bounded). */
export const VARIABLE_OVERLAY_MAX_INDEX = 16

export type VariableOverlayWireFn = (
  value: number,
  color: string,
  name: string,
  index: number,
) => void

export interface VariableOverlaySlotSnapshot {
  index: number
  value: number
  color: string
  name: string
  observedMin: number
  observedMax: number
}

type SlotEntry = {
  min: number
  max: number
  value: number
  color: string
  name: string
}

let _visualizeFn: VariableOverlayWireFn | null = null
let _displayEntityId: string | null = null
const slots = new Map<number, SlotEntry>()

export function setVariableOverlayDisplayEntityId(id: string | null): void {
  _displayEntityId = id
}

export function setVariableOverlayFn(fn: VariableOverlayWireFn | null): void {
  if (fn == null) {
    _visualizeFn = null
    clearSlots()
    return
  }
  clearSlots()
  _visualizeFn = fn
}

export function clearSlots(): void {
  slots.clear()
}

export function getVariableOverlaySlots(): VariableOverlaySlotSnapshot[] {
  return Array.from(slots.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, e]) => ({
      index,
      value: e.value,
      color: e.color,
      name: e.name,
      observedMin: e.min,
      observedMax: e.max,
    }))
}

export function publishVariableValue(
  entityId: string,
  value: number,
  color: string,
  name: string,
  index: number,
): void {
  if (_visualizeFn == null) return
  if (_displayEntityId == null || entityId !== _displayEntityId) return
  if (!Number.isFinite(value)) return
  const idx = Math.trunc(Number(index))
  if (!Number.isFinite(idx) || idx < 1 || idx > VARIABLE_OVERLAY_MAX_INDEX) return

  const prev = slots.get(idx)
  const next: SlotEntry = prev
    ? {
        min: Math.min(prev.min, value),
        max: Math.max(prev.max, value),
        value,
        color: String(color),
        name: String(name),
      }
    : {
        min: value,
        max: value,
        value,
        color: String(color),
        name: String(name),
      }
  slots.set(idx, next)
  _visualizeFn(value, next.color, next.name, idx)
}
