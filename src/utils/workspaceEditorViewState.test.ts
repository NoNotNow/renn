import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearWorkspaceEditorViewStateStoreForTests,
  loadWorkspaceEditorViewState,
  saveWorkspaceEditorViewState,
  type WorkspaceEditorViewState,
} from './workspaceEditorViewState'

describe('workspaceEditorViewState', () => {
  beforeEach(() => {
    clearWorkspaceEditorViewStateStoreForTests()
  })

  it('round-trips saved view state by key', () => {
    const key = 'car:transformers:tf1:_root'
    const state = {
      scrollTop: 120,
      scrollLeft: 0,
      firstPosition: { lineNumber: 8, column: 3 },
      lastPosition: { lineNumber: 8, column: 3 },
    } as unknown as WorkspaceEditorViewState
    saveWorkspaceEditorViewState(key, state)
    expect(loadWorkspaceEditorViewState(key)).toEqual(state)
    expect(loadWorkspaceEditorViewState('missing')).toBeUndefined()
  })
})
