import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

describe('TransformerCustomCodeEditor height resize handle', () => {
  const getHandle = () => screen.getByTestId('custom-code-editor-resize-handle')

  it('mouse drag on the handle changes the height', () => {
    const onHeightPxChange = vi.fn()
    render(
      <TransformerCustomCodeEditor value="v" onChange={vi.fn()} heightPx={280} onHeightPxChange={onHeightPxChange} />,
    )
    const handle = getHandle()
    expect(handle.style.touchAction).toBe('none')
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'mouse', clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'mouse', clientY: 200 })
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'mouse' })
    expect(onHeightPxChange).toHaveBeenLastCalledWith(380)
  })

  it('touch drag changes the height; pointercancel ends the drag', () => {
    const onHeightPxChange = vi.fn()
    render(
      <TransformerCustomCodeEditor value="v" onChange={vi.fn()} heightPx={280} onHeightPxChange={onHeightPxChange} />,
    )
    const handle = getHandle()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'touch', clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientY: 180 })
    expect(onHeightPxChange).toHaveBeenLastCalledWith(360)
    fireEvent.pointerCancel(handle, { pointerId: 1, pointerType: 'touch' })
    const calls = onHeightPxChange.mock.calls.length
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientY: 300 })
    expect(onHeightPxChange).toHaveBeenCalledTimes(calls)
  })

  it('clamps to the configured max height', () => {
    const onHeightPxChange = vi.fn()
    render(
      <TransformerCustomCodeEditor
        value="v"
        onChange={vi.fn()}
        heightPx={280}
        maxHeightPx={300}
        onHeightPxChange={onHeightPxChange}
      />,
    )
    const handle = getHandle()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, pointerType: 'mouse', clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'mouse', clientY: 500 })
    expect(onHeightPxChange).toHaveBeenLastCalledWith(300)
  })
})
