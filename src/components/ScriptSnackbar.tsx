export interface ScriptSnackbarProps {
  message: string
}

/**
 * Transient message from user scripts (`ctx.snackbar`). Timer/dismiss is owned by the parent.
 */
export function ScriptSnackbar({ message }: ScriptSnackbarProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 72,
        zIndex: 51,
        padding: '10px 14px',
        borderRadius: 8,
        background: 'rgba(22, 28, 38, 0.96)',
        border: '1px solid rgba(120, 160, 220, 0.35)',
        color: '#e8eef8',
        fontSize: 13,
        lineHeight: 1.45,
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        wordBreak: 'break-word',
      }}
    >
      {message}
    </div>
  )
}
