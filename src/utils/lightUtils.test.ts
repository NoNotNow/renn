import { describe, it, expect } from 'vitest'
import { directionToSpherical, sphericalToDirection } from './lightUtils'

describe('lightUtils', () => {
  describe('directionToSpherical', () => {
    it('converts +Z direction to azimuth 0, elevation 0', () => {
      const dir: [number, number, number] = [0, 0, 1]
      const { azimuth, elevation } = directionToSpherical(dir)
      expect(azimuth).toBeCloseTo(0, 5)
      expect(elevation).toBeCloseTo(0, 5)
    })

    it('converts +X direction to azimuth 90, elevation 0', () => {
      const dir: [number, number, number] = [1, 0, 0]
      const { azimuth, elevation } = directionToSpherical(dir)
      expect(azimuth).toBeCloseTo(90, 5)
      expect(elevation).toBeCloseTo(0, 5)
    })

    it('converts overhead to elevation 90', () => {
      const dir: [number, number, number] = [0, 1, 0]
      const { azimuth, elevation } = directionToSpherical(dir)
      expect(elevation).toBeCloseTo(90, 5)
    })

    it('handles default direction [1, 2, 1]', () => {
      const dir: [number, number, number] = [1, 2, 1]
      const { azimuth, elevation } = directionToSpherical(dir)
      expect(azimuth).toBeCloseTo(45, 5)
      expect(elevation).toBeGreaterThan(0)
      expect(elevation).toBeLessThan(90)
    })
  })

  describe('sphericalToDirection', () => {
    it('produces +Z for azimuth 0, elevation 0', () => {
      const dir = sphericalToDirection(0, 0)
      expect(dir[0]).toBeCloseTo(0, 5)
      expect(dir[1]).toBeCloseTo(0, 5)
      expect(dir[2]).toBeCloseTo(1, 5)
    })

    it('produces +X for azimuth 90, elevation 0', () => {
      const dir = sphericalToDirection(90, 0)
      expect(dir[0]).toBeCloseTo(1, 5)
      expect(dir[1]).toBeCloseTo(0, 5)
      expect(dir[2]).toBeCloseTo(0, 5)
    })

    it('produces overhead for elevation 90', () => {
      const dir = sphericalToDirection(45, 90)
      expect(dir[0]).toBeCloseTo(0, 5)
      expect(dir[1]).toBeCloseTo(1, 5)
      expect(dir[2]).toBeCloseTo(0, 5)
    })
  })

  describe('round-trip', () => {
    it('preserves direction through spherical conversion', () => {
      const orig: [number, number, number] = [1, 2, 1]
      const { azimuth, elevation } = directionToSpherical(orig)
      const back = sphericalToDirection(azimuth, elevation)
      const lenOrig = Math.sqrt(orig[0] ** 2 + orig[1] ** 2 + orig[2] ** 2)
      const lenBack = Math.sqrt(back[0] ** 2 + back[1] ** 2 + back[2] ** 2)
      expect(back[0] / lenBack).toBeCloseTo(orig[0] / lenOrig, 5)
      expect(back[1] / lenBack).toBeCloseTo(orig[1] / lenOrig, 5)
      expect(back[2] / lenBack).toBeCloseTo(orig[2] / lenOrig, 5)
    })

    it('preserves azimuth/elevation through direction conversion', () => {
      const azimuth = 135
      const elevation = 35
      const dir = sphericalToDirection(azimuth, elevation)
      const { azimuth: a2, elevation: e2 } = directionToSpherical(dir)
      expect(a2).toBeCloseTo(azimuth, 5)
      expect(e2).toBeCloseTo(elevation, 5)
    })
  })
})
