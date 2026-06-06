import { describe, expect, it, vi } from 'vitest'
import { computeDrawerResizeNext, readStoredDrawerLayout } from './floatingDrawerLayout'

describe('floatingDrawerLayout', () => {
  it('computeDrawerResizeNext grows from right and bottom', () => {
    expect(
      computeDrawerResizeNext({
        edge: 'corner',
        dx: 20,
        dy: 30,
        startWidth: 300,
        startHeight: 200,
        startPosX: 40,
        minWidth: 220,
        minHeight: 120,
        maxWidth: 600,
        maxHeight: 640,
      }),
    ).toEqual({ width: 320, height: 230 })
  })

  it('computeDrawerResizeNext adjusts x when resizing from left', () => {
    expect(
      computeDrawerResizeNext({
        edge: 'left',
        dx: -25,
        dy: 0,
        startWidth: 300,
        startHeight: 200,
        startPosX: 100,
        minWidth: 220,
        minHeight: 120,
        maxWidth: 600,
        maxHeight: 640,
      }),
    ).toEqual({ width: 325, height: 200, posX: 75 })
  })

  it('readStoredDrawerLayout accepts optional width and height', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    })
    storage.set('drawer-layout-test', JSON.stringify({ x: 12, y: 34, width: 310, height: 260 }))

    expect(readStoredDrawerLayout('drawer-layout-test')).toEqual({
      x: 12,
      y: 34,
      width: 310,
      height: 260,
    })
  })
})
