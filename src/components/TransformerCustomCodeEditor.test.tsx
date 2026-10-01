import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { useEffect } from 'react'
import TransformerCustomCodeEditor from './TransformerCustomCodeEditor'

const executeEdits = vi.fn()
/** Simulates Monaco model buffer per `path` — not auto-updated when React `defaultValue` changes. */
const modelByPath = new Map<string, string>()

function modelKey(path?: string) {
  return path ?? '__default__'
}

vi.mock('@/utils/monacoExtraLib', () => ({
  addMonacoTypescriptExtraLib: vi.fn(() => ({ dispose: vi.fn() })),
}))

vi.mock('@monaco-editor/react', () => ({
  default: function MockMonacoEditor({
    path,
    defaultValue,
    onMount,
  }: {
    path?: string
    defaultValue?: string
    onMount?: (ed: unknown, monaco: unknown) => void
  }) {
    useEffect(() => {
      const key = modelKey(path)
      if (!modelByPath.has(key)) {
        modelByPath.set(key, defaultValue ?? '')
      }
      const model = {
        getValue: () => modelByPath.get(key) ?? '',
        getFullModelRange: () => ({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        }),
      }
      const ed = {
        getModel: () => model,
        getValue: () => modelByPath.get(key) ?? '',
        saveViewState: vi.fn(() => ({})),
        restoreViewState: vi.fn(),
        executeEdits: vi.fn((source: string, edits: Array<{ text: string }>) => {
          executeEdits(source, edits)
          modelByPath.set(key, edits[0]?.text ?? modelByPath.get(key) ?? '')
        }),
        layout: vi.fn(),
        addCommand: vi.fn(),
      }
      onMount?.(ed, {
        KeyCode: { Escape: 27 },
        editor: { defineTheme: vi.fn() },
      })
      // Intentionally omit `onMount` — the real component passes an unstable callback.
    }, [path, defaultValue])

    return <div data-testid="mock-monaco" data-path={path ?? ''} />
  },
}))

describe('TransformerCustomCodeEditor model sync', () => {
  beforeEach(() => {
    executeEdits.mockClear()
    modelByPath.clear()
  })

  it('imperatively syncs Monaco when modelPath or value changes and model text differs', () => {
    const { rerender } = render(
      <TransformerCustomCodeEditor
        modelPath="stage/a"
        value="expected"
        onChange={vi.fn()}
      />,
    )

    executeEdits.mockClear()
    modelByPath.set('stage/b', 'stale-from-previous-model')

    rerender(
      <TransformerCustomCodeEditor
        modelPath="stage/b"
        value="expected"
        onChange={vi.fn()}
      />,
    )

    expect(executeEdits).toHaveBeenCalledWith(
      'model-path-sync',
      expect.arrayContaining([expect.objectContaining({ text: 'expected' })]),
    )
  })

  it('imperatively syncs when parent value changes and model text is stale', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <TransformerCustomCodeEditor value="v1" onChange={onChange} />,
    )

    onChange.mockClear()
    executeEdits.mockClear()
    modelByPath.set('__default__', 'v1')

    rerender(<TransformerCustomCodeEditor value="from-undo" onChange={onChange} />)

    expect(executeEdits).toHaveBeenCalledWith(
      'model-path-sync',
      expect.arrayContaining([expect.objectContaining({ text: 'from-undo' })]),
    )
  })
})
