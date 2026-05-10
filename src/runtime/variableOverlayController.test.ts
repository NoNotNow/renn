import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import {
  VariableOverlayController,
  variableOverlayColumnX,
  variableOverlaySignedBarLength,
} from './variableOverlayController'

describe('VariableOverlayController sync', () => {
  test('orients overlay root to camera world quaternion when camera is passed', () => {
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    cam.position.set(0, 0, 5)
    cam.rotation.order = 'XYZ'
    cam.rotation.x = Math.PI / 6
    cam.updateMatrixWorld()

    const ctrl = new VariableOverlayController(scene, 2)
    const slots = [
      {
        index: 1,
        value: 1,
        color: '#ffffff',
        name: 'a',
        observedMin: -1,
        observedMax: 1,
      },
    ]
    ctrl.sync('e', [0, 0, 0], slots, cam)

    const expected = new THREE.Quaternion()
    cam.getWorldQuaternion(expected)
    expect(ctrl.root.quaternion.x).toBeCloseTo(expected.x, 6)
    expect(ctrl.root.quaternion.y).toBeCloseTo(expected.y, 6)
    expect(ctrl.root.quaternion.z).toBeCloseTo(expected.z, 6)
    expect(ctrl.root.quaternion.w).toBeCloseTo(expected.w, 6)

    ctrl.dispose()
  })
})

describe('variableOverlay layout helpers', () => {
  test('one slot is centered on the group (col 1 of n=1)', () => {
    const w = 3
    expect(variableOverlayColumnX(1, 1, w)).toBeCloseTo(0, 6)
  })

  test('two slots divide width into thirds at ⅓ and ⅔', () => {
    const w = 3
    const half = w / 2
    expect(variableOverlayColumnX(1, 2, w)).toBeCloseTo(-half + (1 / 3) * w, 6)
    expect(variableOverlayColumnX(2, 2, w)).toBeCloseTo(-half + (2 / 3) * w, 6)
  })

  test('signed bar length scales by observed range and group width', () => {
    const w = 2
    expect(variableOverlaySignedBarLength(1, -1, 1, w)).toBeCloseTo(2, 6)
    expect(variableOverlaySignedBarLength(-0.5, -1, 1, w)).toBeCloseTo(-1, 6)
  })

  test('zero observed range uses denominator 1', () => {
    expect(variableOverlaySignedBarLength(0.7, 0, 0, 1)).toBeCloseTo(0.7, 6)
  })
})
