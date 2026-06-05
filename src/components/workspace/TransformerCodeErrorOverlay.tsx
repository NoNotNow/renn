import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { theme } from '@/config/theme'

export interface TransformerRuntimeErrorDisplay {
  message: string
  stack?: string
  code: string
  lineNumber?: number
}

export interface TransformerCodeErrorOverlayProps {
  compileError?: string | null
  compileErrorTestId?: string
  runtimeError?: TransformerRuntimeErrorDisplay | null
  runtimeActive?: boolean
  formatRuntimeClipboard?: (snapshot: TransformerRuntimeErrorDisplay) => string
  onRuntimeContextMenu?: (e: ReactMouseEvent) => void
}

/**
 * Floating error toasts over the transformer code column. Positioned absolute inside a
 * `position: relative` host so Monaco height stays stable while errors appear.
 */
export default function TransformerCodeErrorOverlay({
  compileError = null,
  compileErrorTestId = 'workspace-transformer-compile-error',
  runtimeError = null,
  runtimeActive = true,
  formatRuntimeClipboard,
  onRuntimeContextMenu,
}: TransformerCodeErrorOverlayProps) {
  const [copiedRuntime, setCopiedRuntime] = useState(false)

  if (!compileError && !runtimeError) return null

  const handleCopyRuntime = async (): Promise<void> => {
    if (!runtimeError || !formatRuntimeClipboard) return
    try {
      await navigator.clipboard.writeText(formatRuntimeClipboard(runtimeError))
      setCopiedRuntime(true)
      window.setTimeout(() => setCopiedRuntime(false), 1200)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      aria-live="polite"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        maxHeight: 'min(42vh, 300px)',
        overflow: 'auto',
      }}
    >
      {compileError ?
        <div
          data-testid={compileErrorTestId}
          style={{
            pointerEvents: 'auto',
            padding: '8px 10px',
            fontSize: 12,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: theme.text.error,
            border: `1px solid ${theme.border.error}`,
            borderRadius: 8,
            background: 'rgba(40, 18, 22, 0.96)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11 }}>Compile error</div>
          {compileError}
        </div>
      : null}

      {runtimeError ?
        <div
          data-testid="workspace-transformer-runtime-error"
          onContextMenu={onRuntimeContextMenu}
          style={{
            pointerEvents: 'auto',
            padding: '8px 10px',
            fontSize: 12,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: theme.text.warning,
            border: `1px solid ${runtimeActive ? theme.text.warning : theme.feedback.successBorder}`,
            borderRadius: 8,
            background: 'rgba(35, 28, 12, 0.96)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            opacity: runtimeActive ? 1 : 0.8,
            transition: 'opacity 140ms linear, border-color 140ms linear',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11 }}>
              Runtime error
              {runtimeError.lineNumber !== undefined ?
                <span style={{ marginLeft: 8, opacity: 0.8 }}>— line {runtimeError.lineNumber}</span>
              : null}
            </div>
            {formatRuntimeClipboard ?
              <div style={{ marginLeft: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyRuntime()
                  }}
                  aria-label="Copy runtime error"
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    color: theme.text.warning,
                  }}
                >
                  {copiedRuntime ? 'Copied' : 'Copy'}
                </button>
              </div>
            : null}
          </div>
          <div style={{ marginBottom: 4 }}>{runtimeError.message}</div>
          {runtimeError.stack ?
            <pre
              style={{
                margin: '6px 0 0',
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                whiteSpace: 'pre-wrap',
              }}
            >
              {runtimeError.stack}
            </pre>
          : null}
        </div>
      : null}
    </div>
  )
}
