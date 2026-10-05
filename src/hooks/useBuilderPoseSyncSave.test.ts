import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBuilderPoseSyncSave } from '@/hooks/useBuilderPoseSyncSave'
import type { SceneViewHandle } from '@/components/SceneView'
import type { RefObject } from 'react'

function makePoses() {
  return new Map([
    [
      'e1',
      {
        position: [0, 1, 0] as const,
        rotation: [0, 0, 0, 1] as const,
        scale: [1, 1, 1] as const,
      },
    ],
  ])
}

function makeParams(overrides: Partial<Parameters<typeof useBuilderPoseSyncSave>[0]> = {}) {
  const poses = makePoses()
  const getAllPoses = vi.fn(() => poses)
  const sceneViewRef: RefObject<SceneViewHandle | null> = {
    current: {
      getAllPoses,
    } as unknown as SceneViewHandle,
  }

  const fileShortcutHandlersRef = {
    current: {
      onSave: () => {},
      onSaveAs: () => {},
      onNew: () => {},
    },
  }

  return {
    sceneViewRef,
    fileShortcutHandlersRef,
    currentProject: { id: 'proj-1', name: 'My World', isDirty: false },
    projects: [{ id: 'proj-1', name: 'My World', updatedAt: 0 }],
    saveProject: vi.fn().mockResolvedValue(true),
    saveProjectAs: vi.fn().mockResolvedValue(true),
    saveToProject: vi.fn().mockResolvedValue(true),
    syncPosesFromScene: vi.fn(),
    syncPosesToRefOnly: vi.fn(),
    newProject: vi.fn(),
    loadProject: vi.fn(),
    reloadWorld: vi.fn().mockResolvedValue(true),
    loadExampleWorld: vi.fn(),
    ...overrides,
  }
}

describe('useBuilderPoseSyncSave', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('syncPosesThen runs ref-only sync, IO, then scene sync when poses exist', async () => {
    const params = makeParams()
    const order: string[] = []
    vi.mocked(params.syncPosesToRefOnly).mockImplementation(() => {
      order.push('ref')
    })
    vi.mocked(params.syncPosesFromScene).mockImplementation(() => {
      order.push('scene')
    })
    vi.mocked(params.saveProject).mockImplementation(async () => {
      order.push('io')
      return true
    })

    const { result } = renderHook(() => useBuilderPoseSyncSave(params))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(order).toEqual(['ref', 'io', 'scene'])
    expect(params.syncPosesToRefOnly).toHaveBeenCalledTimes(1)
    expect(params.syncPosesFromScene).toHaveBeenCalledTimes(1)
    expect(params.saveProject).toHaveBeenCalledTimes(1)
  })

  it('save skips pose sync when getAllPoses returns null', async () => {
    const params = makeParams({
      sceneViewRef: {
        current: {
          getAllPoses: vi.fn(() => null),
        } as unknown as SceneViewHandle,
      },
    })

    const { result } = renderHook(() => useBuilderPoseSyncSave(params))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(params.syncPosesToRefOnly).not.toHaveBeenCalled()
    expect(params.syncPosesFromScene).not.toHaveBeenCalled()
    expect(params.saveProject).toHaveBeenCalledTimes(1)
  })

  it('opens save dialog when project has no id', async () => {
    const params = makeParams({
      currentProject: { id: null, name: 'Untitled', isDirty: false },
    })
    const { result } = renderHook(() => useBuilderPoseSyncSave(params))

    expect(result.current.showSaveDialog).toBe(false)
    await act(async () => {
      await result.current.handleSave()
    })
    expect(result.current.showSaveDialog).toBe(true)
    expect(params.saveProject).not.toHaveBeenCalled()
  })

  it('forwards file shortcut handlers on each render', async () => {
    const params = makeParams()
    renderHook(() => useBuilderPoseSyncSave(params))

    await waitFor(() => {
      expect(params.fileShortcutHandlersRef.current.onSave).not.toBe(params.fileShortcutHandlersRef.current.onNew)
    })

    await act(async () => {
      params.fileShortcutHandlersRef.current.onSave()
    })
    expect(params.saveProject).toHaveBeenCalled()
  })

  it('handleNew respects dirty confirm', () => {
    const confirmMock = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmMock)
    const params = makeParams({
      currentProject: { id: 'p', name: 'X', isDirty: true },
    })
    const { result } = renderHook(() => useBuilderPoseSyncSave(params))

    act(() => {
      result.current.handleNew()
    })

    expect(confirmMock).toHaveBeenCalled()
    expect(params.newProject).not.toHaveBeenCalled()
  })

  it('handleReload calls reloadWorld (saved and example worlds)', () => {
    const params = makeParams({
      currentProject: { id: null, name: 'example_world', isDirty: false },
    })
    const { result } = renderHook(() => useBuilderPoseSyncSave(params))

    act(() => {
      result.current.handleReload()
    })

    expect(params.reloadWorld).toHaveBeenCalledTimes(1)
  })

  it('registers beforeunload when project is dirty', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const params = makeParams({
      currentProject: { id: 'p', name: 'X', isDirty: true },
    })
    renderHook(() => useBuilderPoseSyncSave(params))

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    addSpy.mockRestore()
  })
})
