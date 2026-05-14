import { useCallback, useEffect, useId, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { addMonacoTypescriptExtraLib } from '@/utils/monacoExtraLib'
import { transformerCtxDecl, TRANSFORMER_CODE_EXTRA_LIB_URI } from '@/transformers/transformerCodeDecl'
import { clamp } from '@/utils/numberUtils'
import { theme } from '@/config/theme'

export const CUSTOM_CODE_EDITOR_HEIGHT_MIN_PX = 160
export const CUSTOM_CODE_EDITOR_HEIGHT_MAX_PX = 720
export const CUSTOM_CODE_EDITOR_HEIGHT_DEFAULT_PX = 280

/**
 * Name of the Monaco theme used when `transparent` is true.
 * Defined once per Monaco instance in `handleMount`; safe to redefine (idempotent overwrite).
 */
const GLASS_THEME = 'vs-dark-glass'

/** CSS injected when at least one glass editor is mounted. Scoped via `data-glass-editor`. */
const GLASS_EDITOR_CSS = `
[data-glass-editor] .monaco-editor,
[data-glass-editor] .monaco-editor-background,
[data-glass-editor] .monaco-editor .margin {
  background-color: rgba(26, 26, 26, 0.5) !important;
}
`

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
  /**
   * When true the Monaco editor background is made transparent so it inherits
   * the parent panel's frosted-glass appearance.
   */
  transparent?: boolean
  /** If set (ms ≥ 0), call `editor.layout()` once after this delay (helps flex/portal hosts). */
  delayedLayoutMs?: number
  /** Fires once after Monaco mounts with the editor instance. */
  onEditorReady?: (ed: editor.IStandaloneCodeEditor) => void
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
  transparent = false,
  delayedLayoutMs,
  onEditorReady,
}: TransformerCustomCodeEditorProps) {
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const extraLibRef = useRef<{ dispose(): void } | null>(null)
  const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const delayedLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uid = useId()

  const clampHeight = useCallback((h: number) => clamp(h, minHeightPx, maxHeightPx), [minHeightPx, maxHeightPx])

  // Inject / remove the glass CSS whenever `transparent` toggles.
  useEffect(() => {
    if (!transparent) return
    const existing = document.getElementById('monaco-glass-style')
    let style: HTMLStyleElement
    if (existing instanceof HTMLStyleElement) {
      style = existing
    } else {
      style = document.createElement('style')
      style.id = 'monaco-glass-style'
      style.textContent = GLASS_EDITOR_CSS
      document.head.appendChild(style)
    }
    // Track reference count so the style is only removed when the last glass editor unmounts.
    const count = Number(style.dataset.refCount ?? 0) + 1
    style.dataset.refCount = String(count)
    return () => {
      const cur = Number(style.dataset.refCount ?? 1) - 1
      if (cur <= 0) {
        style.remove()
      } else {
        style.dataset.refCount = String(cur)
      }
    }
  }, [transparent])

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

  useEffect(() => {
    return () => {
      if (delayedLayoutTimerRef.current != null) {
        clearTimeout(delayedLayoutTimerRef.current)
        delayedLayoutTimerRef.current = null
      }
    }
  }, [])

  const handleMount: OnMount = (ed, monaco) => {
    monacoRef.current = monaco
    extraLibRef.current?.dispose()
    extraLibRef.current = addMonacoTypescriptExtraLib(
      monaco,
      transformerCtxDecl(),
      TRANSFORMER_CODE_EXTRA_LIB_URI,
    )
    if (transparent) {
      monaco.editor.defineTheme(GLASS_THEME, {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          // 8-digit hex: #rrggbbaa — must match the CSS rgba(26,26,26,0.5) above
          'editor.background': '#1a1a1a80',
          'editorGutter.background': '#1a1a1a80',
          'editor.lineHighlightBackground': '#ffffff0a',
          'editor.lineHighlightBorder': '#ffffff00',
          'editor.selectionBackground': '#6b7280aa',
          'scrollbar.shadow': '#00000000',
        },
      })
    }
    if (delayedLayoutTimerRef.current != null) {
      clearTimeout(delayedLayoutTimerRef.current)
      delayedLayoutTimerRef.current = null
    }
    if (delayedLayoutMs != null && delayedLayoutMs >= 0) {
      delayedLayoutTimerRef.current = setTimeout(() => {
        delayedLayoutTimerRef.current = null
        ed.layout()
      }, delayedLayoutMs)
    }
    onEditorReady?.(ed)
  }

  const monacoTheme = transparent ? GLASS_THEME : 'vs-dark'
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
        data-glass-editor={transparent ? uid : undefined}
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
            theme={monacoTheme}
            value={value}
            onChange={(v) => onChange(v ?? '')}
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              readOnly: disabled,
              renderLineHighlight: 'all',
              renderLineHighlightOnlyWhenFocus: true,
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
          theme={monacoTheme}
          value={value}
          onChange={(v) => onChange(v ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            readOnly: disabled,
            renderLineHighlight: 'all',
            renderLineHighlightOnlyWhenFocus: true,
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
