import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearWorkspaceEditorViewStateStoreForTests,
  loadWorkspaceEditorViewState,
  saveWorkspaceEditorViewState,
  saveWorkspaceEditorDraft,
  loadWorkspaceEditorDraft,
  deleteWorkspaceEditorDraft,
  workspaceEditorItemKey,
  type WorkspaceEditorViewState,
} from './workspaceEditorViewState'

describe('workspaceEditorViewState', () => {
  beforeEach(() => {
    clearWorkspaceEditorViewStateStoreForTests()
  })

  it('builds distinct keys per entity, tab, item, and pipe path', () => {
    const base = {
      entityId: 'car',
      tab: 'transformers' as const,
      itemId: 'tf_custom',
    }
    expect(workspaceEditorItemKey(base)).toBe('car:transformers:tf_custom:_root')
    expect(
      workspaceEditorItemKey({
        ...base,
        pipeNavPath: [{ kind: 'stack', index: 1 }],
      }),
    ).toBe('car:transformers:tf_custom:s1')
    expect(workspaceEditorItemKey({ ...base, tab: 'scripts' })).toBe('car:scripts:tf_custom:_root')
    expect(workspaceEditorItemKey({ ...base, entityId: 'box' })).toBe('box:transformers:tf_custom:_root')
  })

  it('returns null when itemId is missing', () => {
    expect(workspaceEditorItemKey({ tab: 'transformers' })).toBeNull()
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

  it('round-trips saved editor draft by key', () => {
    const key = 'car:scripts:scr1:_root'
    saveWorkspaceEditorDraft(key, '// unapplied edit')
    expect(loadWorkspaceEditorDraft(key)).toBe('// unapplied edit')
    deleteWorkspaceEditorDraft(key)
    expect(loadWorkspaceEditorDraft(key)).toBeUndefined()
  })
})
