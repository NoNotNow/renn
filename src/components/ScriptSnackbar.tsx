import { useEffect, useState } from 'react'

export interface ScriptSnackbarProps {
  message: string
}

/**
 * Transient message from user scripts (`ctx.snackbar`). Timer/dismiss is owned by the parent.
 * Adds a copy button and visually de-emphasizes the message after an active window.
 */
export function ScriptSnackbar({ message }: ScriptSnackbarProps) {
  const [active, setActive] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!message) return
    setActive(true)
    setCopied(false)
    const t = window.setTimeout(() => setActive(false), 1500)
    return () => window.clearTimeout(t)
  }, [message])

  if (!message) return null

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
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
        bottom: 72,
        zIndex: 53,
        padding: '10px 14px',
        borderRadius: 8,
        background: 'rgba(22, 28, 38, 0.96)',
        border: '1px solid rgba(120, 160, 220, 0.35)',
        color: '#e8eef8',
        fontSize: 13,
        lineHeight: 1.45,
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        wordBreak: 'break-word',
        opacity: active ? 1 : 0.8,
        transition: 'opacity 180ms linear',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message}</div>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy message"
          style={{
            flexShrink: 0,
            margin: 0,
            padding: '6px 8px',
            fontSize: 12,
            cursor: 'pointer',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#e8eef8',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
