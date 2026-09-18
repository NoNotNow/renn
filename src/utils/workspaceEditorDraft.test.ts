import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearWorkspaceEditorDraftStoreForTests,
  saveWorkspaceEditorDraft,
  loadWorkspaceEditorDraft,
  deleteWorkspaceEditorDraft,
} from './workspaceEditorDraft'

describe('workspaceEditorDraft', () => {
  beforeEach(() => {
    clearWorkspaceEditorDraftStoreForTests()
  })

  it('round-trips saved editor draft by key', () => {
    const key = 'car:scripts:scr1:_root'
    saveWorkspaceEditorDraft(key, '// unapplied edit')
    expect(loadWorkspaceEditorDraft(key)).toBe('// unapplied edit')
    deleteWorkspaceEditorDraft(key)
    expect(loadWorkspaceEditorDraft(key)).toBeUndefined()
  })
})
