import { describe, it, expect } from 'vitest'
import {
  MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN,
  MONACO_ESCAPE_WIDGET_VISIBLE_WHEN,
} from './monacoEscape'

describe('monacoEscape', () => {
  it('defines widget and workspace escape when clauses', () => {
    expect(MONACO_ESCAPE_WIDGET_VISIBLE_WHEN).toContain('suggestWidgetVisible')
    expect(MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN).toContain('!suggestWidgetVisible')
    expect(MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN).toContain('editorTextFocus')
  })
})
