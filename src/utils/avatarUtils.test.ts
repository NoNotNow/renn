import { describe, it, expect } from 'vitest'
import { buildAvatarFocusSnapshotFromPreferred } from '@/utils/avatarUtils'

describe('buildAvatarFocusSnapshotFromPreferred', () => {
  it('uses persisted orbit yaw, pitch, and distance when present on preferred camera', () => {
    const snap = buildAvatarFocusSnapshotFromPreferred(
      { mode: 'follow', target: 'a', control: 'follow', distance: 10, height: 2 },
      {
        mode: 'follow',
        distance: 10,
        height: 2,
        orbitYaw: 0.42,
        orbitPitch: -0.15,
        orbitDistance: 9.25,
      },
      'e2',
    )
    expect(snap.target).toBe('e2')
    expect(snap.orbitYaw).toBeCloseTo(0.42)
    expect(snap.orbitPitch).toBeCloseTo(-0.15)
    expect(snap.orbitDistance).toBeCloseTo(9.25)
  })

  it('falls back to zero orbit and distance when preferred omits orbit fields', () => {
    const snap = buildAvatarFocusSnapshotFromPreferred(
      undefined,
      { mode: 'thirdPerson', distance: 12, height: 1.5 },
      'x',
    )
    expect(snap.orbitYaw).toBe(0)
    expect(snap.orbitPitch).toBe(0)
    expect(snap.orbitDistance).toBe(12)
  })
})
