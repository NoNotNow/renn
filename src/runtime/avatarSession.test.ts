import { describe, it, expect, vi } from 'vitest'
import type { CameraController } from '@/camera/cameraController'
import type { AvatarFocusSnapshot, RennWorld } from '@/types/world'
import { AvatarSession } from './avatarSession'

function makeCameraMock() {
  let snap: AvatarFocusSnapshot = {
    control: 'follow',
    mode: 'follow',
    target: '',
    distance: 10,
    height: 2,
    orbitYaw: 0,
    orbitPitch: 0,
    orbitDistance: 10,
    effectiveFovDegrees: 50,
  }
  return {
    captureAvatarFocusState: vi.fn(() => ({ ...snap, target: snap.target })),
    applyAvatarFocusState: vi.fn((s: AvatarFocusSnapshot) => {
      snap = { ...s }
    }),
    getSnap: () => snap,
  }
}

describe('AvatarSession', () => {
  it('picks initial avatar from camera target when in roster', () => {
    const ref = { current: null as string | null }
    const cam = makeCameraMock()
    const getCam = () => cam as unknown as CameraController
    new AvatarSession({
      entities: [
        { id: 'a', avatar: {} },
        { id: 'b', avatar: {} },
      ],
      worldCamera: { mode: 'follow', target: 'b', control: 'follow' },
      getCameraController: getCam,
      controlledEntityIdRef: ref,
    })
    expect(ref.current).toBe('b')
  })

  it('cycles roster with wrap-around', () => {
    const ref = { current: null as string | null }
    const cam = makeCameraMock()
    const session = new AvatarSession({
      entities: [
        { id: 'a', avatar: {} },
        { id: 'b', avatar: {} },
      ],
      worldCamera: { mode: 'follow', target: 'a', control: 'follow' },
      getCameraController: () => cam as unknown as CameraController,
      controlledEntityIdRef: ref,
    })
    expect(ref.current).toBe('a')
    session.cycleAvatar(1)
    expect(ref.current).toBe('b')
    session.cycleAvatar(1)
    expect(ref.current).toBe('a')
    session.cycleAvatar(-1)
    expect(ref.current).toBe('b')
  })

  it('saves snapshot on blur when switching', () => {
    const ref = { current: null as string | null }
    const cam = makeCameraMock()
    const session = new AvatarSession({
      entities: [
        { id: 'a', avatar: {} },
        { id: 'b', avatar: {} },
      ],
      worldCamera: { mode: 'follow', target: 'a', control: 'follow' },
      getCameraController: () => cam as unknown as CameraController,
      controlledEntityIdRef: ref,
    })
    cam.captureAvatarFocusState.mockReturnValue({
      control: 'follow',
      mode: 'thirdPerson',
      target: 'a',
      distance: 12,
      height: 2,
      orbitYaw: 0.1,
      orbitPitch: 0.2,
      orbitDistance: 11,
      effectiveFovDegrees: 50,
    })
    session.setCurrentAvatar('b')
    expect(cam.captureAvatarFocusState).toHaveBeenCalled()
    session.setCurrentAvatar('a')
    expect(cam.applyAvatarFocusState).toHaveBeenCalled()
    const calls = cam.applyAvatarFocusState.mock.calls
    const lastApply = calls[calls.length - 1]?.[0] as AvatarFocusSnapshot
    expect(lastApply.target).toBe('a')
    expect(lastApply.orbitYaw).toBe(0.1)
  })

  it('excludes entity when avatar.enabled is false', () => {
    const ref = { current: null as string | null }
    const cam = makeCameraMock()
    new AvatarSession({
      entities: [{ id: 'x', avatar: { enabled: false } }],
      worldCamera: { mode: 'follow', target: 'x', control: 'follow' },
      getCameraController: () => cam as unknown as CameraController,
      controlledEntityIdRef: ref,
    })
    expect(ref.current).toBeNull()
  })

  it('applies preferred orbit when focusing an avatar with no session snapshot', () => {
    const ref = { current: null as string | null }
    const cam = makeCameraMock()
    const session = new AvatarSession({
      entities: [
        { id: 'a', avatar: {} },
        {
          id: 'b',
          avatar: {
            preferredCamera: {
              mode: 'follow',
              control: 'follow',
              distance: 10,
              height: 2,
              orbitYaw: 0.33,
              orbitPitch: -0.2,
              orbitDistance: 8.5,
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
    expect(cam.applyAvatarFocusState).toHaveBeenCalled()
    const calls = cam.applyAvatarFocusState.mock.calls
    const last = calls[calls.length - 1]?.[0] as AvatarFocusSnapshot
    expect(last?.target).toBe('b')
    expect(last?.orbitYaw).toBeCloseTo(0.33)
    expect(last?.orbitPitch).toBeCloseTo(-0.2)
    expect(last?.orbitDistance).toBeCloseTo(8.5)
  })

  it('setCurrentAvatar applies per-entity preferred mode, control, distance, and orbit (not shared)', () => {
    const cam = makeCameraMock()
    const world: RennWorld = {
      version: '1.0',
      world: {
        camera: { mode: 'follow', target: 'a', control: 'follow', distance: 10, height: 2 },
      },
      entities: [
        {
          id: 'a',
          avatar: {
            preferredCamera: {
              mode: 'follow',
              control: 'follow',
              distance: 10,
              height: 2,
              orbitYaw: 0.05,
              orbitPitch: 0,
              orbitDistance: 10,
            },
          },
        },
        {
          id: 'b',
          avatar: {
            preferredCamera: {
              mode: 'thirdPerson',
              control: 'follow',
              distance: 12,
              height: 1.5,
              orbitYaw: 0.66,
              orbitPitch: -0.12,
              orbitDistance: 7,
            },
          },
        },
      ],
    }
    const session = new AvatarSession({
      entities: world.entities,
      worldCamera: world.world.camera,
      getCameraController: () => cam as unknown as CameraController,
      controlledEntityIdRef: { current: null },
    })
    cam.applyAvatarFocusState.mockClear()
    session.setCurrentAvatar('b')
    const calls = cam.applyAvatarFocusState.mock.calls
    const applied = calls[calls.length - 1]?.[0] as AvatarFocusSnapshot
    expect(applied?.target).toBe('b')
    expect(applied?.mode).toBe('thirdPerson')
    expect(applied?.control).toBe('follow')
    expect(applied?.distance).toBe(12)
    expect(applied?.height).toBe(1.5)
    expect(applied?.orbitYaw).toBeCloseTo(0.66)
    expect(applied?.orbitPitch).toBeCloseTo(-0.12)
    expect(applied?.orbitDistance).toBeCloseTo(7)
  })

  it('syncWorld refreshes entities so setCurrentAvatar reads latest preferred from JSON', () => {
    const cam = makeCameraMock()
    const worldV1: RennWorld = {
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
              mode: 'follow',
              control: 'follow',
              orbitYaw: 0.1,
              orbitPitch: 0,
              orbitDistance: 10,
            },
          },
        },
      ],
    }
    const session = new AvatarSession({
      entities: worldV1.entities,
      worldCamera: worldV1.world.camera,
      getCameraController: () => cam as unknown as CameraController,
      controlledEntityIdRef: { current: null },
    })
    const worldV2: RennWorld = {
      ...worldV1,
      entities: [
        { id: 'a', avatar: {} },
        {
          id: 'b',
          avatar: {
            preferredCamera: {
              mode: 'tracking',
              control: 'follow',
              distance: 11,
              height: 2,
              orbitYaw: 0.44,
              orbitPitch: 0.05,
              orbitDistance: 9,
            },
          },
        },
      ],
    }
    session.syncWorld(worldV2)
    cam.applyAvatarFocusState.mockClear()
    session.setCurrentAvatar('b')
    const calls = cam.applyAvatarFocusState.mock.calls
    const applied = calls[calls.length - 1]?.[0] as AvatarFocusSnapshot
    expect(applied?.mode).toBe('tracking')
    expect(applied?.orbitYaw).toBeCloseTo(0.44)
    expect(applied?.distance).toBe(11)
  })
})
