import { useEffect } from 'react'

const AUTO_DISMISS_MS = 12_000

export interface WarningSnackbarProps {
  messages: string[]
  onDismiss: () => void
}

/**
 * Bottom snack bar for non-fatal issues (e.g. world JSON fields removed to match schema).
 */
export function WarningSnackbar({ messages, onDismiss }: WarningSnackbarProps) {
  useEffect(() => {
    if (messages.length === 0) return
    const t = window.setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [messages, onDismiss])

  if (messages.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 50,
        maxHeight: 'min(40vh, 220px)',
        overflow: 'auto',
        padding: '12px 14px',
        borderRadius: 8,
        background: 'rgba(35, 28, 12, 0.96)',
        border: '1px solid rgba(212, 168, 75, 0.45)',
        color: '#f3e6c8',
        fontSize: 13,
        lineHeight: 1.45,
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <strong style={{ flexShrink: 0, color: '#e8b84a' }}>Warning</strong>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            flexShrink: 0,
            margin: 0,
            padding: '2px 10px',
            fontSize: 12,
            cursor: 'pointer',
            borderRadius: 6,
          }}
        >
          Dismiss
        </button>
      </div>
      {messages.map((msg, i) => (
        <pre
          key={i}
          style={{
            margin: '10px 0 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 11,
            opacity: 0.95,
          }}
        >
          {msg}
        </pre>
      ))}
    </div>
  )
}
