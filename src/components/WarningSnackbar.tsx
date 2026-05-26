import { useEffect, useState } from 'react'

const AUTO_DISMISS_MS = 10_000
const ACTIVE_WINDOW_MS = 1500

export interface WarningSnackbarProps {
  messages: string[]
  onDismiss: () => void
}

/**
 * Bottom snack bar for non-fatal issues (e.g. world JSON fields removed to match schema).
 * Adds per-message copy buttons and visually de-emphasizes messages after an active window.
 */
export function WarningSnackbar({ messages, onDismiss }: WarningSnackbarProps) {
  const [active, setActive] = useState(true)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (messages.length === 0) return
    const t = window.setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [messages, onDismiss])

  useEffect(() => {
    if (messages.length === 0) return
    setActive(true)
    const t = window.setTimeout(() => setActive(false), ACTIVE_WINDOW_MS)
    return () => window.clearTimeout(t)
  }, [messages])

  if (messages.length === 0) return null

  const onCopy = async (msg: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(msg)
      setCopiedIndex(idx)
      window.setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1200)
    } catch (e) {
      // ignore
    }
  }

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
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 11,
              opacity: active ? 0.95 : 0.8,
              flex: 1,
            }}
          >
            {msg}
          </pre>
          <div style={{ flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => onCopy(msg, i)}
              aria-label={`Copy warning ${i + 1}`}
              style={{
                margin: 0,
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.04)',
                color: '#f3e6c8',
              }}
            >
              {copiedIndex === i ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
