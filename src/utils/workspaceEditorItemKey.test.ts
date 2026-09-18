import { describe, it, expect } from 'vitest'
import { workspaceEditorItemKey } from './workspaceEditorItemKey'

describe('workspaceEditorItemKey', () => {
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
})
