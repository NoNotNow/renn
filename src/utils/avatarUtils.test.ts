import { describe, it, expect } from 'vitest'
import { avatarEntityIconLetter, buildAvatarFocusSnapshotFromPreferred } from '@/utils/avatarUtils'
import type { Entity } from '@/types/world'

describe('avatarEntityIconLetter', () => {
  it('uses first letter of trimmed name', () => {
    const e = { id: 'x', name: '  alpha  ' } as Entity
    expect(avatarEntityIconLetter(e)).toBe('A')
  })

  it('falls back to first id char when name empty', () => {
    expect(avatarEntityIconLetter({ id: 'beta', name: '' } as Entity)).toBe('B')
    expect(avatarEntityIconLetter({ id: 'gamma' } as Entity)).toBe('G')
  })

  it('returns ? for empty id and no name', () => {
    expect(avatarEntityIconLetter({ id: '', name: '   ' } as Entity)).toBe('?')
  })
})

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

  it('uses preferred targetVerticalAngle when set', () => {
    const snap = buildAvatarFocusSnapshotFromPreferred(
      { mode: 'follow', target: 'a', control: 'follow', targetVerticalAngle: 5 },
      { mode: 'follow', targetVerticalAngle: -12 },
      'e2',
    )
    expect(snap.targetVerticalAngle).toBe(-12)
  })

  it('falls back to world camera targetVerticalAngle when preferred omits it', () => {
    const snap = buildAvatarFocusSnapshotFromPreferred(
      { mode: 'follow', target: 'a', control: 'follow', targetVerticalAngle: 20 },
      { mode: 'follow' },
      'e2',
    )
    expect(snap.targetVerticalAngle).toBe(20)
  })

  it('clamps targetVerticalAngle to ±45 degrees', () => {
    const snap = buildAvatarFocusSnapshotFromPreferred(undefined, { mode: 'follow', targetVerticalAngle: 99 }, 'x')
    expect(snap.targetVerticalAngle).toBe(45)
  })
})
