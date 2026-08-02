/** Monaco `when` clause — true when Escape should dismiss an editor widget, not the Workspace. */
export const MONACO_ESCAPE_WIDGET_VISIBLE_WHEN =
  'suggestWidgetVisible || parameterHintsVisible || renameInputVisible || inSnippetMode || quickFixWidgetVisible'

/** Monaco `when` clause — Escape may close the Workspace shell (editor focused, no popup). */
export const MONACO_ESCAPE_CLOSE_WORKSPACE_WHEN =
  'editorTextFocus && !suggestWidgetVisible && !parameterHintsVisible && !renameInputVisible && !inSnippetMode && !quickFixWidgetVisible'
