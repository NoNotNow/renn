import { describe, it, expect } from 'vitest'
import { MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN } from './monacoEscape'

describe('monacoEscape', () => {
  it('closes workspace only when editor is focused and no popup is open', () => {
    expect(MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN).toContain('editorTextFocus')
    expect(MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN).toContain('!suggestWidgetVisible')
    expect(MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN).toContain('!parameterHintsVisible')
    expect(MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN).toContain('!renameInputVisible')
    expect(MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN).toContain('!inSnippetMode')
    expect(MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN).toContain('!quickFixWidgetVisible')
  })
})
