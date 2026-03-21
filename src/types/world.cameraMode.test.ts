import { describe, it, expect } from 'vitest'
import { cycleCameraMode, CAMERA_MODE_CYCLE_ORDER, type CameraMode } from '@/types/world'

describe('cycleCameraMode', () => {
  it('advances to the next mode in CAMERA_MODE_CYCLE_ORDER', () => {
    expect(cycleCameraMode('follow')).toBe('thirdPerson')
    expect(cycleCameraMode('thirdPerson')).toBe('tracking')
    expect(cycleCameraMode('tracking')).toBe('firstPerson')
  })

  it('wraps from last mode to the first', () => {
    const last = CAMERA_MODE_CYCLE_ORDER[CAMERA_MODE_CYCLE_ORDER.length - 1]!
    expect(cycleCameraMode(last)).toBe(CAMERA_MODE_CYCLE_ORDER[0])
  })

  it('treats an unknown mode like the last slot and returns the first mode', () => {
    expect(cycleCameraMode('notAMode' as CameraMode)).toBe(CAMERA_MODE_CYCLE_ORDER[0])
  })
})
