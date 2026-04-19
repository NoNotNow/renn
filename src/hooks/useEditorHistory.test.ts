import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditorHistory } from '@/hooks/useEditorHistory'
import type { RennWorld } from '@/types/world'

function makeWorld(version: number = 1): RennWorld {
  return {
    version,
    entities: [],
    world: {
      gravity: [0, -9.81, 0],
      groundColor: '#888888',
      camera: { control: 'free', target: '', mode: 'firstPerson' },
    },
  } as unknown as RennWorld
}

function setupHook(initial?: { world?: RennWorld; assets?: Map<string, Blob> }) {
  const ref = {
    current: {
      world: initial?.world ?? makeWorld(1),
      assets: initial?.assets ?? new Map<string, Blob>(),
    },
  }
  const hook = renderHook(() =>
    useEditorHistory({ worldAssetsRef: ref, maxDepth: 3 }),
  )
  return { ref, ...hook }
}

describe('useEditorHistory', () => {
  it('starts empty: canUndo/canRedo are false, tryUndo/tryRedo return null', () => {
    const { result } = setupHook()
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.tryUndo()).toBeNull()
    expect(result.current.tryRedo()).toBeNull()
  })

  it('pushBeforeMutation snapshots current world+assets and enables undo', () => {
    const { ref, result } = setupHook()

    act(() => {
      result.current.pushBeforeMutation()
    })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)

    ref.current = { world: makeWorld(2), assets: new Map() }
    let popped: ReturnType<typeof result.current.tryUndo> = null
    act(() => {
      popped = result.current.tryUndo()
    })
    expect(popped).not.toBeNull()
    expect(popped!.world.version).toBe(1)
  })

  it('tryRedo restores after undo', () => {
    const { ref, result } = setupHook()

    act(() => {
      result.current.pushBeforeMutation()
    })
    ref.current = { world: makeWorld(2), assets: new Map() }
    act(() => {
      const snap = result.current.tryUndo()
      if (snap) ref.current = { world: snap.world, assets: snap.assets }
    })
    expect(result.current.canRedo).toBe(true)

    let popped: ReturnType<typeof result.current.tryRedo> = null
    act(() => {
      popped = result.current.tryRedo()
    })
    expect(popped).not.toBeNull()
    expect(popped!.world.version).toBe(2)
  })

  it('clear empties both stacks', () => {
    const { result } = setupHook()
    act(() => {
      result.current.pushBeforeMutation()
    })
    expect(result.current.canUndo).toBe(true)

    act(() => {
      result.current.clear()
    })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('editorUndoApi.pushBeforeEdit pushes onto the undo stack', () => {
    const { result } = setupHook()
    act(() => {
      result.current.editorUndoApi.pushBeforeEdit()
    })
    expect(result.current.canUndo).toBe(true)
  })

  it('editorUndoApi gesture: scrubStart + scrubEnd(true) commits one entry', () => {
    const { ref, result } = setupHook({ world: makeWorld(10) })
    act(() => {
      result.current.editorUndoApi.notifyScrubStart()
    })
    ref.current = { world: makeWorld(11), assets: new Map() }
    act(() => {
      result.current.editorUndoApi.notifyScrubEnd(true)
    })
    expect(result.current.canUndo).toBe(true)
    let popped: ReturnType<typeof result.current.tryUndo> = null
    act(() => {
      popped = result.current.tryUndo()
    })
    expect(popped!.world.version).toBe(10)
  })

  it('editorUndoApi.notifyScrubEnd(false) discards the snapshot', () => {
    const { result } = setupHook()
    act(() => {
      result.current.editorUndoApi.notifyScrubStart()
      result.current.editorUndoApi.notifyScrubEnd(false)
    })
    expect(result.current.canUndo).toBe(false)
  })

  it('respects maxDepth: oldest entries are dropped', () => {
    const { ref, result } = setupHook({ world: makeWorld(1) })

    for (let v = 1; v <= 5; v++) {
      act(() => {
        result.current.pushBeforeMutation()
      })
      ref.current = { world: makeWorld(v + 1), assets: new Map() }
    }
    const popped: ReturnType<typeof result.current.tryUndo>[] = []
    for (let i = 0; i < 4; i++) {
      act(() => {
        const snap = result.current.tryUndo()
        popped.push(snap)
        if (snap) ref.current = { world: snap.world, assets: snap.assets }
      })
    }
    expect(popped[0]!.world.version).toBe(5)
    expect(popped[1]!.world.version).toBe(4)
    expect(popped[2]!.world.version).toBe(3)
    expect(popped[3]).toBeNull()
  })

  it('returns stable function references across renders', () => {
    const { result, rerender } = setupHook()
    const before = {
      pushBeforeMutation: result.current.pushBeforeMutation,
      tryUndo: result.current.tryUndo,
      tryRedo: result.current.tryRedo,
      clear: result.current.clear,
      bumpUi: result.current.bumpUi,
      editorUndoApi: result.current.editorUndoApi,
    }
    rerender()
    expect(result.current.pushBeforeMutation).toBe(before.pushBeforeMutation)
    expect(result.current.tryUndo).toBe(before.tryUndo)
    expect(result.current.tryRedo).toBe(before.tryRedo)
    expect(result.current.clear).toBe(before.clear)
    expect(result.current.bumpUi).toBe(before.bumpUi)
    expect(result.current.editorUndoApi).toBe(before.editorUndoApi)
  })
})
