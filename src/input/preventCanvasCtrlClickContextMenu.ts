/**
 * macOS maps Ctrl+primary-click to a synthetic right-click, which opens the browser
 * context menu on WebGL canvases ("Save Image As…"). Builder uses Ctrl+click for the same
 * additive selection as Cmd+click, so suppress that menu without blocking normal right-click.
 */

export function shouldSuppressCanvasContextMenu(
  ev: { ctrlKey: boolean },
  pendingCtrlPrimaryClick: boolean,
): boolean {
  return pendingCtrlPrimaryClick || ev.ctrlKey
}

/** Attach listeners on the scene canvas; returns dispose. */
export function attachPreventCanvasCtrlClickContextMenu(domElement: HTMLElement): () => void {
  let pendingCtrlPrimaryClick = false

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !e.ctrlKey) return
    e.preventDefault()
    pendingCtrlPrimaryClick = true
  }

  const onContextMenu = (e: MouseEvent): void => {
    if (!shouldSuppressCanvasContextMenu(e, pendingCtrlPrimaryClick)) return
    e.preventDefault()
    pendingCtrlPrimaryClick = false
  }

  const clearPending = (): void => {
    pendingCtrlPrimaryClick = false
  }

  domElement.addEventListener('pointerdown', onPointerDown, { capture: true })
  domElement.addEventListener('contextmenu', onContextMenu)
  domElement.addEventListener('pointerup', clearPending)
  domElement.addEventListener('pointercancel', clearPending)

  return () => {
    domElement.removeEventListener('pointerdown', onPointerDown, { capture: true })
    domElement.removeEventListener('contextmenu', onContextMenu)
    domElement.removeEventListener('pointerup', clearPending)
    domElement.removeEventListener('pointercancel', clearPending)
  }
}
