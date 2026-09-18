import type * as THREE from 'three'

/** Normalized device coordinates (−1…1) from a pointer event over a DOM element. */
export function pointerClientToNdc(
  out: THREE.Vector2,
  clientX: number,
  clientY: number,
  element: HTMLElement,
): void {
  const rect = element.getBoundingClientRect()
  out.x = ((clientX - rect.left) / rect.width) * 2 - 1
  out.y = -((clientY - rect.top) / rect.height) * 2 + 1
}

export function setNdcFromPointerEvent(out: THREE.Vector2, e: PointerEvent, element: HTMLElement): void {
  pointerClientToNdc(out, e.clientX, e.clientY, element)
}
