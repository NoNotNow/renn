import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { addMonacoTypescriptExtraLib } from '@/utils/monacoExtraLib'
import { transformerCtxDecl, TRANSFORMER_CODE_EXTRA_LIB_URI } from '@/transformers/transformerCodeDecl'
import { clamp } from '@/utils/numberUtils'
import { theme } from '@/config/theme'

export const CUSTOM_CODE_EDITOR_HEIGHT_MIN_PX = 160
export const CUSTOM_CODE_EDITOR_HEIGHT_MAX_PX = 720
export const CUSTOM_CODE_EDITOR_HEIGHT_DEFAULT_PX = 280

export interface TransformerCustomCodeEditorProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  /** `fixed`: pixel height + optional resize handle. `fill`: grow inside a flex parent (`flex:1; minHeight:0`). */
  layout?: 'fixed' | 'fill'
  /** Controlled editor height in pixels. */
  heightPx?: number
  onHeightPxChange?: (next: number) => void
  minHeightPx?: number
  maxHeightPx?: number
}

export default function TransformerCustomCodeEditor({
  value,
  onChange,
  disabled = false,
  layout = 'fixed',
  heightPx = CUSTOM_CODE_EDITOR_HEIGHT_DEFAULT_PX,
  onHeightPxChange,
  minHeightPx = CUSTOM_CODE_EDITOR_HEIGHT_MIN_PX,
  maxHeightPx = CUSTOM_CODE_EDITOR_HEIGHT_MAX_PX,
}: TransformerCustomCodeEditorProps) {
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const extraLibRef = useRef<{ dispose(): void } | null>(null)
  const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const clampHeight = useCallback((h: number) => clamp(h, minHeightPx, maxHeightPx), [minHeightPx, maxHeightPx])

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

  const effectiveHeight = clampHeight(heightPx)

  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (layout === 'fill' || onHeightPxChange == null) return
      e.preventDefault()
      resizeDragRef.current = {
        startY: e.clientY,
        startHeight: effectiveHeight,
      }
      const onMove = (move: MouseEvent) => {
        const data = resizeDragRef.current
        if (data == null) return
        const dy = move.clientY - data.startY
        onHeightPxChange(clampHeight(data.startHeight + dy))
      }
      const onUp = () => {
        resizeDragRef.current = null
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [clampHeight, effectiveHeight, layout, onHeightPxChange],
  )

  if (layout === 'fill') {
    return (
      <div
        style={{
          width: '100%',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
          <Editor
            height="100%"
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
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ height: effectiveHeight, width: '100%', overflow: 'hidden' }}>
        <Editor
          height={`${effectiveHeight}px`}
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
      {onHeightPxChange ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize code height"
          data-testid="custom-code-editor-resize-handle"
          onMouseDown={handleResizeMouseDown}
          style={{
            height: 6,
            flexShrink: 0,
            cursor: 'ns-resize',
            background: theme.border.default,
            borderRadius: 2,
            marginTop: 2,
          }}
        />
      ) : null}
    </div>
  )
}
