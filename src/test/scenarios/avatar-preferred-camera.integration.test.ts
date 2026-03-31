/**
 * Integration: persisted avatar preferred camera orbit is validated and applied when focusing an avatar
 * without an in-memory session snapshot (e.g. first visit after load, or cleared session).
 */

import { describe, it, expect } from 'vitest'
import type { AvatarFocusSnapshot, RennWorld } from '@/types/world'
import { validateEntityAvatarConfig } from '@/utils/entityAvatarValidation'
import { buildAvatarFocusSnapshotFromPreferred } from '@/utils/avatarUtils'
import { AvatarSession } from '@/runtime/avatarSession'
import type { CameraController } from '@/camera/cameraController'

describe('avatar preferred camera defaults (integration)', () => {
  it('accepts orbit fields in entity avatar JSON (schema)', () => {
    const avatar = {
      enabled: true,
      preferredCamera: {
        mode: 'follow' as const,
        control: 'follow' as const,
        distance: 10,
        height: 2,
        orbitYaw: 0.25,
        orbitPitch: -0.1,
        orbitDistance: 9,
      },
    }
    const v = validateEntityAvatarConfig(avatar)
    expect(v.valid).toBe(true)
    const snap = buildAvatarFocusSnapshotFromPreferred(undefined, avatar.preferredCamera, 'hero')
    expect(snap.orbitYaw).toBeCloseTo(0.25)
    expect(snap.orbitPitch).toBeCloseTo(-0.1)
    expect(snap.orbitDistance).toBeCloseTo(9)
  })

  it('Builder-style: syncWorld then setCurrentAvatar applies that entity’s mode, control, distance, and orbit from JSON', () => {
    const applyCalls: AvatarFocusSnapshot[] = []
    const cam = {
      captureAvatarFocusState: () => ({
        control: 'follow' as const,
        mode: 'follow' as const,
        target: 'a',
        distance: 10,
        height: 2,
        fov: 50,
        orbitYaw: 0,
        orbitPitch: 0,
        orbitDistance: 10,
        effectiveFovDegrees: 50,
      }),
      applyAvatarFocusState: (s: AvatarFocusSnapshot) => {
        applyCalls.push({ ...s })
      },
    }
    const world: RennWorld = {
      version: '1.0',
      world: {
        camera: { mode: 'follow', target: 'a', control: 'follow', distance: 10, height: 2 },
      },
      entities: [
        { id: 'a', avatar: {} },
        {
          id: 'b',
          avatar: {
            preferredCamera: {
              mode: 'thirdPerson',
              control: 'follow',
              distance: 14,
              height: 1.25,
              orbitYaw: 0.31,
              orbitPitch: -0.08,
              orbitDistance: 6.5,
            },
          },
        },
      ],
    }
    const session = new AvatarSession({
      entities: world.entities,
      worldCamera: world.world.camera,
      getCameraController: () => cam as unknown as import('@/camera/cameraController').CameraController,
      controlledEntityIdRef: { current: null },
    })
    session.syncWorld(world)
    session.setCurrentAvatar('b')
    const last = applyCalls[applyCalls.length - 1]
    expect(last?.target).toBe('b')
    expect(last?.mode).toBe('thirdPerson')
    expect(last?.control).toBe('follow')
    expect(last?.distance).toBe(14)
    expect(last?.height).toBe(1.25)
    expect(last?.orbitYaw).toBeCloseTo(0.31)
    expect(last?.orbitPitch).toBeCloseTo(-0.08)
    expect(last?.orbitDistance).toBeCloseTo(6.5)
  })

  it('AvatarSession applies preferred orbit when switching to an avatar without a stored snapshot', () => {
    const ref = { current: null as string | null }
    const applyCalls: AvatarFocusSnapshot[] = []
    const cam = {
      captureAvatarFocusState: () => ({
        control: 'follow' as const,
        mode: 'follow' as const,
        target: 'a',
        distance: 10,
        height: 2,
        fov: 50,
        orbitYaw: 0,
        orbitPitch: 0,
        orbitDistance: 10,
        effectiveFovDegrees: 50,
      }),
      applyAvatarFocusState: (s: AvatarFocusSnapshot) => {
        applyCalls.push({ ...s })
      },
    }
    const session = new AvatarSession({
      entities: [
        { id: 'a', avatar: {} },
        {
          id: 'b',
          avatar: {
            preferredCamera: {
              mode: 'follow',
              control: 'follow',
              orbitYaw: 0.5,
              orbitPitch: -0.05,
              orbitDistance: 7,
            },
          },
        },
      ],
      worldCamera: { mode: 'follow', target: 'a', control: 'follow' },
      getCameraController: () => cam as unknown as CameraController,
      controlledEntityIdRef: ref,
    })
    expect(ref.current).toBe('a')
    session.setCurrentAvatar('b')
    const last = applyCalls[applyCalls.length - 1]
    expect(last?.target).toBe('b')
    expect(last?.orbitYaw).toBeCloseTo(0.5)
    expect(last?.orbitPitch).toBeCloseTo(-0.05)
    expect(last?.orbitDistance).toBeCloseTo(7)
  })
})
