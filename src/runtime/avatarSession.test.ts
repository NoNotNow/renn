import { describe, it, expect, vi } from 'vitest'
import type { CameraController } from '@/camera/cameraController'
import type { AvatarFocusSnapshot } from '@/types/world'
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
})
