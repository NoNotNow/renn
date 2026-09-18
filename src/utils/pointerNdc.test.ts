import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { pointerClientToNdc } from './pointerNdc'

describe('pointerClientToNdc', () => {
  it('maps center of element to origin', () => {
    const el = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: 200,
        height: 100,
        right: 300,
        bottom: 150,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }),
    } as HTMLElement
    const out = new THREE.Vector2()
    pointerClientToNdc(out, 200, 100, el)
    expect(out.x).toBeCloseTo(0, 10)
    expect(out.y).toBeCloseTo(0, 10)
  })

  it('maps top-left to (−1, 1)', () => {
    const el = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLElement
    const out = new THREE.Vector2()
    pointerClientToNdc(out, 0, 0, el)
    expect(out.x).toBeCloseTo(-1, 10)
    expect(out.y).toBeCloseTo(1, 10)
  })
})
