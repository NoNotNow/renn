import { describe, it, expect, vi } from 'vitest'
import {
  applyPipeNavWorldWrite,
  pipeNavWorldEditDescriptor,
  PIPE_NAV_WORLD_EDIT_SCENE,
} from './applyPipeNavWorldWrite'
import { PIPE_NAV_EDIT_POLICY, type PipeNavEditIntent } from './pipeNavEdit'
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

describe('pipeNavWorldEditDescriptor', () => {
  it('maps every intent kind to sync scene and policy-table undo', () => {
    const kinds = Object.keys(PIPE_NAV_EDIT_POLICY) as PipeNavEditIntent['kind'][]
    for (const kind of kinds) {
      const descriptor = pipeNavWorldEditDescriptor(kind)
      expect(descriptor.scene).toBe(PIPE_NAV_WORLD_EDIT_SCENE)
      expect(descriptor.undo).toBe(PIPE_NAV_EDIT_POLICY[kind].pushUndo ? 'push' : 'skip')
    }
  })

  it('ensurePipeStack is the only skip-undo row', () => {
    expect(pipeNavWorldEditDescriptor('ensurePipeStack').undo).toBe('skip')
    expect(pipeNavWorldEditDescriptor('createPipe').undo).toBe('push')
  })
})

describe('applyPipeNavWorldWrite', () => {
  it('delegates descriptor and next world to ApplyWorldWrite', () => {
    const next = minimalWorld()
    const applyWorldWrite = vi.fn<ApplyWorldWrite>()
    applyPipeNavWorldWrite(applyWorldWrite, 'renamePipe', next)
    expect(applyWorldWrite).toHaveBeenCalledOnce()
    const [descriptor, produceNext] = applyWorldWrite.mock.calls[0]!
    expect(descriptor).toEqual({ undo: 'push', scene: 'sync' })
    expect(produceNext(minimalWorld())).toBe(next)
  })
})
