import { describe, it, expect } from 'vitest'
import {
  clampDest,
  clientToDocPoint,
  clientToDocPointFromImageRect,
  docPointToLayerTexel,
  roundDest,
  transformDestWithDrag,
} from '@/utils/layerTransformHandles'

const start = { x: 10, y: 20, w: 30, h: 40 }

describe('layerTransformHandles', () => {
  it('move adds delta to x and y only', () => {
    expect(transformDestWithDrag('move', start, 5, -3)).toEqual({ x: 15, y: 17, w: 30, h: 40 })
  })

  it('e handle grows width', () => {
    expect(transformDestWithDrag('e', start, 7, 0)).toEqual({ x: 10, y: 20, w: 37, h: 40 })
  })

  it('w handle shifts x and shrinks width', () => {
    expect(transformDestWithDrag('w', start, 5, 0)).toEqual({ x: 15, y: 20, w: 25, h: 40 })
  })

  it('s handle grows height', () => {
    expect(transformDestWithDrag('s', start, 0, 8)).toEqual({ x: 10, y: 20, w: 30, h: 48 })
  })

  it('n handle shifts y and shrinks height', () => {
    expect(transformDestWithDrag('n', start, 0, 6)).toEqual({ x: 10, y: 26, w: 30, h: 34 })
  })

  it('se corner distorts both dimensions', () => {
    expect(transformDestWithDrag('se', start, 4, 5)).toEqual({ x: 10, y: 20, w: 34, h: 45 })
  })

  it('nw corner moves origin and size', () => {
    expect(transformDestWithDrag('nw', start, 3, 4)).toEqual({ x: 13, y: 24, w: 27, h: 36 })
  })

  it('ne corner', () => {
    expect(transformDestWithDrag('ne', start, -2, 5)).toEqual({ x: 10, y: 25, w: 28, h: 35 })
  })

  it('sw corner', () => {
    expect(transformDestWithDrag('sw', start, 4, -6)).toEqual({ x: 14, y: 20, w: 26, h: 34 })
  })

  it('clampDest enforces minimum size', () => {
    expect(clampDest({ x: 0, y: 0, w: 0, h: -2 })).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('clientToDocPoint maps frame 0–1 to doc', () => {
    const rect = { left: 10, top: 20, width: 100, height: 50 } as DOMRectReadOnly
    expect(clientToDocPoint(10, 20, rect, 200, 80)).toEqual({ x: 0, y: 0 })
    expect(clientToDocPoint(110, 70, rect, 200, 80)).toEqual({ x: 200, y: 80 })
    expect(clientToDocPoint(60, 45, rect, 200, 80)).toEqual({ x: 100, y: 40 })
  })

  it('roundDest rounds and clamps', () => {
    expect(roundDest({ x: 1.4, y: 2.6, w: 3.2, h: 0.1 })).toEqual({ x: 1, y: 3, w: 3, h: 1 })
  })

  it('w handle clamps to min width', () => {
    expect(transformDestWithDrag('w', start, 29, 0)).toEqual({ x: 39, y: 20, w: 1, h: 40 })
  })

  it('e handle can grow width substantially', () => {
    expect(transformDestWithDrag('e', start, 100, 0)).toEqual({ x: 10, y: 20, w: 130, h: 40 })
  })

  it('clientToDocPointFromImageRect returns null outside image', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 } as DOMRectReadOnly
    expect(clientToDocPointFromImageRect(-1, 50, rect, 200, 200)).toBeNull()
    expect(clientToDocPointFromImageRect(50, 50, rect, 200, 200)).toEqual({ x: 100, y: 100 })
  })

  it('docPointToLayerTexel maps doc into layer pixels', () => {
    const dest = { x: 0, y: 0, w: 100, h: 100 }
    expect(docPointToLayerTexel(50, 50, dest, 32, 32)).toEqual({ x: 16, y: 16 })
    expect(docPointToLayerTexel(-1, 50, dest, 32, 32)).toBeNull()
  })
})
