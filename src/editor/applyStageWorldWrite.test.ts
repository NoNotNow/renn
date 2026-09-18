import { describe, it, expect, vi } from 'vitest'
import {
  applyStageWorldWrite,
  stageWorldEditDescriptor,
  STAGE_WORLD_EDIT_SCENE,
} from './applyStageWorldWrite'
import { STAGE_EDIT_POLICY, type StageEditIntent } from './commitStageEdit'
import type { RennWorld } from '@/types/world'
import type { ApplyWorldWrite } from './applyWorldEdit'

function minimalWorld(): RennWorld {
  return {
    version: '1',
    world: {},
    entities: [
      {
        id: 'e1',
        bodyType: 'dynamic',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [0, 0, 0],
      },
    ],
  }
}

describe('stageWorldEditDescriptor', () => {
  it('maps every intent kind to sync scene and policy-table undo', () => {
    const kinds = Object.keys(STAGE_EDIT_POLICY) as StageEditIntent['kind'][]
    for (const kind of kinds) {
      const descriptor = stageWorldEditDescriptor(STAGE_EDIT_POLICY[kind].pushUndo)
      expect(descriptor.scene).toBe(STAGE_WORLD_EDIT_SCENE)
      expect(descriptor.undo).toBe(STAGE_EDIT_POLICY[kind].pushUndo ? 'push' : 'skip')
    }
  })

  it('codeEdit is the only skip-undo row', () => {
    expect(stageWorldEditDescriptor(STAGE_EDIT_POLICY.codeEdit.pushUndo).undo).toBe('skip')
    expect(stageWorldEditDescriptor(STAGE_EDIT_POLICY.patch.pushUndo).undo).toBe('push')
  })
})

describe('applyStageWorldWrite', () => {
  it('delegates descriptor and next world to ApplyWorldWrite', () => {
    const next = minimalWorld()
    const applyWorldWrite = vi.fn<ApplyWorldWrite>()
    applyStageWorldWrite(applyWorldWrite, stageWorldEditDescriptor(true), next)
    expect(applyWorldWrite).toHaveBeenCalledOnce()
    const [descriptor, produceNext] = applyWorldWrite.mock.calls[0]!
    expect(descriptor).toEqual({ undo: 'push', scene: 'sync' })
    expect(produceNext(minimalWorld())).toBe(next)
  })
})
