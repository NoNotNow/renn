import { useCallback, useLayoutEffect, useRef } from 'react'
import type { TextureLayerDest } from '@/utils/textureCompositor'
import {
  type TransformHandle,
  clientToDocPoint,
  roundDest,
  transformDestWithDrag,
} from '@/utils/layerTransformHandles'

export interface LayerTransformOverlayProps {
  docWidth: number
  docHeight: number
  dest: TextureLayerDest
  frameRef: React.RefObject<HTMLElement | null>
  onDestLiveChange: (next: TextureLayerDest) => void
  onDestCommit: (next: TextureLayerDest) => void
}

export default function LayerTransformOverlay({
  docWidth,
  docHeight,
  dest,
  frameRef,
  onDestLiveChange,
  onDestCommit,
}: LayerTransformOverlayProps) {
  const dragRef = useRef<{
    handle: TransformHandle
    startDest: TextureLayerDest
    startDocX: number
    startDocY: number
    pointerId: number
  } | null>(null)
  const lastLiveDestRef = useRef(dest)
  lastLiveDestRef.current = dest

  const propsRef = useRef({
    frameRef,
    docWidth,
    docHeight,
    onDestLiveChange,
    onDestCommit,
  })
  propsRef.current = { frameRef, docWidth, docHeight, onDestLiveChange, onDestCommit }

  const moveRef = useRef<(e: PointerEvent) => void>(() => {})
  const upRef = useRef<(e: PointerEvent) => void>(() => {})

  const wrapMove = useCallback((e: PointerEvent) => {
    moveRef.current(e)
  }, [])
  const wrapUp = useCallback((e: PointerEvent) => {
    upRef.current(e)
  }, [])

  useLayoutEffect(() => {
    moveRef.current = (e: PointerEvent) => {
      const d = dragRef.current
      const { frameRef: fr, docWidth: dw, docHeight: dh, onDestLiveChange: live } = propsRef.current
      const el = fr.current
      if (!d || !el) return
      const rect = el.getBoundingClientRect()
      const cur = clientToDocPoint(e.clientX, e.clientY, rect, dw, dh)
      const dx = cur.x - d.startDocX
      const dy = cur.y - d.startDocY
      const next = transformDestWithDrag(d.handle, d.startDest, dx, dy)
      lastLiveDestRef.current = next
      live(next)
    }
    upRef.current = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      dragRef.current = null
      window.removeEventListener('pointermove', wrapMove)
      window.removeEventListener('pointerup', wrapUp)
      window.removeEventListener('pointercancel', wrapUp)
      propsRef.current.onDestCommit(roundDest(lastLiveDestRef.current))
    }
  }, [wrapMove, wrapUp])

  const startDrag = useCallback(
    (handle: TransformHandle, e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = frameRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const p = clientToDocPoint(e.clientX, e.clientY, rect, docWidth, docHeight)
      const startDest = { ...dest }
      lastLiveDestRef.current = startDest
      dragRef.current = {
        handle,
        startDest,
        startDocX: p.x,
        startDocY: p.y,
        pointerId: e.pointerId,
      }
      window.addEventListener('pointermove', wrapMove)
      window.addEventListener('pointerup', wrapUp)
      window.addEventListener('pointercancel', wrapUp)
    },
    [dest, docWidth, docHeight, frameRef, wrapMove, wrapUp],
  )

  const pct = (v: number, dim: number) => `${(v / dim) * 100}%`

  const handleStyle = (left: string, top: string, cursor: string): React.CSSProperties => ({
    position: 'absolute',
    left,
    top,
    width: 12,
    height: 12,
    pointerEvents: 'auto',
    cursor,
    border: '2px solid #e6e9f2',
    borderRadius: 2,
    background: '#2563eb',
    padding: 0,
    boxSizing: 'border-box',
    zIndex: 2,
    transform: 'translate(-50%, -50%)',
  })

  return (
    <div
      className="texture-maker-transform-overlay"
      data-testid="texture-maker-transform-overlay"
      style={{
        position: 'absolute',
        left: pct(dest.x, docWidth),
        top: pct(dest.y, docHeight),
        width: pct(dest.w, docWidth),
        height: pct(dest.h, docHeight),
        boxSizing: 'border-box',
        border: '2px solid #7dd3fc',
        pointerEvents: 'none',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
      }}
    >
      <button
        type="button"
        className="texture-maker-transform-overlay__body"
        data-testid="texture-maker-transform-move"
        aria-label="Move layer placement"
        title="Drag to move (non-destructive)"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'auto',
          cursor: 'move',
          border: 'none',
          padding: 0,
          margin: 0,
          background: 'rgba(125, 211, 252, 0.12)',
          zIndex: 1,
        }}
        onPointerDown={(e) => startDrag('move', e)}
      />
      <button
        type="button"
        data-testid="texture-maker-handle-nw"
        aria-label="Resize nw"
        style={handleStyle('0%', '0%', 'nwse-resize')}
        onPointerDown={(e) => startDrag('nw', e)}
      />
      <button
        type="button"
        data-testid="texture-maker-handle-n"
        aria-label="Resize n"
        style={handleStyle('50%', '0%', 'ns-resize')}
        onPointerDown={(e) => startDrag('n', e)}
      />
      <button
        type="button"
        data-testid="texture-maker-handle-ne"
        aria-label="Resize ne"
        style={handleStyle('100%', '0%', 'nesw-resize')}
        onPointerDown={(e) => startDrag('ne', e)}
      />
      <button
        type="button"
        data-testid="texture-maker-handle-e"
        aria-label="Resize e"
        style={handleStyle('100%', '50%', 'ew-resize')}
        onPointerDown={(e) => startDrag('e', e)}
      />
      <button
        type="button"
        data-testid="texture-maker-handle-se"
        aria-label="Resize se"
        style={handleStyle('100%', '100%', 'nwse-resize')}
        onPointerDown={(e) => startDrag('se', e)}
      />
      <button
        type="button"
        data-testid="texture-maker-handle-s"
        aria-label="Resize s"
        style={handleStyle('50%', '100%', 'ns-resize')}
        onPointerDown={(e) => startDrag('s', e)}
      />
      <button
        type="button"
        data-testid="texture-maker-handle-sw"
        aria-label="Resize sw"
        style={handleStyle('0%', '100%', 'nesw-resize')}
        onPointerDown={(e) => startDrag('sw', e)}
      />
      <button
        type="button"
        data-testid="texture-maker-handle-w"
        aria-label="Resize w"
        style={handleStyle('0%', '50%', 'ew-resize')}
        onPointerDown={(e) => startDrag('w', e)}
      />
    </div>
  )
}
