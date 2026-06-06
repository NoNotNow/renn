import { describe, expect, it, vi } from 'vitest'
import { computeDrawerResizeNext, clampDrawerPosition, drawerPositionRelativeToHost, readStoredDrawerLayout } from './floatingDrawerLayout'

describe('floatingDrawerLayout', () => {
  it('clampDrawerPosition keeps the drawer inside the host on all edges', () => {
    expect(
      clampDrawerPosition({ x: -20, y: -10 }, { width: 200, height: 100 }, { width: 800, height: 600 }),
    ).toEqual({ x: 0, y: 0 })

    expect(
      clampDrawerPosition({ x: 700, y: 550 }, { width: 200, height: 100 }, { width: 800, height: 600 }),
    ).toEqual({ x: 600, y: 500 })

    expect(
      clampDrawerPosition({ x: 100, y: 80 }, { width: 900, height: 700 }, { width: 800, height: 600 }),
    ).toEqual({ x: 0, y: 0 })
  })

  it('clampDrawerPosition leaves position unchanged when host size is not yet measurable', () => {
    expect(clampDrawerPosition({ x: 42, y: 17 }, { width: 300, height: 280 }, { width: 0, height: 0 })).toEqual({
      x: 42,
      y: 17,
    })
  })

  it('drawerPositionRelativeToHost maps viewport rects into host-local coordinates', () => {
    const host = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 600, right: 900, bottom: 650 }),
    } as Element
    const element = {
      getBoundingClientRect: () => ({ left: 180, top: 120, width: 120, height: 80, right: 300, bottom: 200 }),
    } as Element

    expect(drawerPositionRelativeToHost(element, host)).toEqual({ x: 80, y: 70 })
  })

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
