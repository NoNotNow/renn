import { useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { addMonacoTypescriptExtraLib } from '@/utils/monacoExtraLib'
import { transformerCtxDecl, TRANSFORMER_CODE_EXTRA_LIB_URI } from '@/transformers/transformerCodeDecl'

export interface TransformerCustomCodeEditorProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  minHeightPx?: number
}

export default function TransformerCustomCodeEditor({
  value,
  onChange,
  disabled = false,
  minHeightPx = 220,
}: TransformerCustomCodeEditorProps) {
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const extraLibRef = useRef<{ dispose(): void } | null>(null)

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    extraLibRef.current?.dispose()
    extraLibRef.current = addMonacoTypescriptExtraLib(
      monaco,
      transformerCtxDecl(),
      TRANSFORMER_CODE_EXTRA_LIB_URI,
    )
    return () => {
      extraLibRef.current?.dispose()
      extraLibRef.current = null
    }
  }, [])

  const handleMount = (_ed: unknown, monaco: Monaco) => {
    monacoRef.current = monaco
    extraLibRef.current?.dispose()
    extraLibRef.current = addMonacoTypescriptExtraLib(
      monaco,
      transformerCtxDecl(),
      TRANSFORMER_CODE_EXTRA_LIB_URI,
    )
  }

  return (
    <div style={{ minHeight: minHeightPx, width: '100%', overflow: 'hidden' }}>
      <Editor
        height={`${minHeightPx}px`}
        language="javascript"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          readOnly: disabled,
        }}
      />
    </div>
  )
}
