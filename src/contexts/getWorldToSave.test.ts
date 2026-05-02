import { describe, expect, it } from 'vitest'
import { buildWorldToSave } from './getWorldToSave'
import type { CameraState } from '@/hooks/useCameraState'
import type { EditorFreePose, RennWorld } from '@/types/world'

function makeWorld(camera?: RennWorld['world']['camera']): RennWorld {
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
      ...(camera != null ? { camera } : {}),
    },
    entities: [
      {
        id: 'box',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
      },
    ],
  }
}

const CAMERA: CameraState = {
  control: 'follow',
  target: 'box',
  mode: 'thirdPerson',
  targetVerticalAngle: 0,
}

describe('buildWorldToSave', () => {
  it('overrides control / target / mode with the live UI state', () => {
    const world = makeWorld({ control: 'free', target: 'old', mode: 'follow' })

    const saved = buildWorldToSave(world, CAMERA, null)

    expect(saved.world.camera).toMatchObject({
      control: 'follow',
      target: 'box',
      mode: 'thirdPerson',
    })
  })

  it('synthesises a camera object when the world has none', () => {
    const world = makeWorld()

    const saved = buildWorldToSave(world, CAMERA, null)

    expect(saved.world.camera?.control).toBe('follow')
    expect(saved.world.camera?.target).toBe('box')
    expect(saved.world.camera?.mode).toBe('thirdPerson')
  })

  it('writes the live editor free pose when provided', () => {
    const world = makeWorld({ mode: 'follow', target: 'box' })
    const pose: EditorFreePose = { position: [1, 2, 3], quaternion: [0, 0, 0, 1] }

    const saved = buildWorldToSave(world, CAMERA, pose)

    expect(saved.world.camera?.editorFreePose).toEqual(pose)
  })

  it('falls back to the documents editor free pose when live ref is null', () => {
    const docPose: EditorFreePose = { position: [9, 9, 9], quaternion: [0, 0, 0, 1] }
    const world = makeWorld({ mode: 'follow', target: 'box', editorFreePose: docPose })

    const saved = buildWorldToSave(world, CAMERA, null)

    expect(saved.world.camera?.editorFreePose).toEqual(docPose)
  })

  it('omits editorFreePose when neither live ref nor doc has one', () => {
    const world = makeWorld({ mode: 'follow', target: 'box' })

    const saved = buildWorldToSave(world, CAMERA, null)

    expect(saved.world.camera).not.toHaveProperty('editorFreePose')
  })

  it('does not mutate the input world', () => {
    const world = makeWorld({ control: 'free', target: 'old', mode: 'follow' })
    const before = JSON.stringify(world)

    buildWorldToSave(world, CAMERA, null)

    expect(JSON.stringify(world)).toBe(before)
  })

  it('preserves other camera fields (e.g. distance, height) on the document camera', () => {
    const world = makeWorld({
      mode: 'follow',
      target: 'box',
      distance: 12,
      height: 3,
    } as RennWorld['world']['camera'])

    const saved = buildWorldToSave(world, CAMERA, null)

    expect(saved.world.camera).toMatchObject({ distance: 12, height: 3 })
  })

  it('overrides targetVerticalAngle with the live UI state', () => {
    const world = makeWorld({
      mode: 'follow',
      target: 'box',
      targetVerticalAngle: 5,
    } as RennWorld['world']['camera'])

    const saved = buildWorldToSave(world, { ...CAMERA, targetVerticalAngle: -12 }, null)

    expect(saved.world.camera?.targetVerticalAngle).toBe(-12)
  })
})
