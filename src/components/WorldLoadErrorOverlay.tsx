import type { CSSProperties } from 'react'

export interface WorldLoadErrorOverlayProps {
  message: string
  onDismiss: () => void
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 40,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'stretch',
  padding: 20,
  boxSizing: 'border-box',
  background: '#14161c',
  color: '#e6e9f2',
  overflow: 'auto',
}

const preStyle: CSSProperties = {
  margin: '0 0 16px',
  padding: 12,
  background: '#0d0f14',
  border: '1px solid #2f3545',
  borderRadius: 6,
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  flex: '0 1 auto',
  maxHeight: '45vh',
  overflow: 'auto',
}

const buttonStyle: CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  cursor: 'pointer',
  background: '#2a3142',
  border: '1px solid #3d4a62',
  borderRadius: 6,
  color: '#e6e9f2',
}

/** Full-bleed overlay shown when the world fails to load (parse / schema / asset error). */
export function WorldLoadErrorOverlay({ message, onDismiss }: WorldLoadErrorOverlayProps) {
  return (
    <div role="alert" style={overlayStyle}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>Failed to load world</h2>
      <pre style={preStyle}>{message}</pre>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9aa4b2', lineHeight: 1.5 }}>
        If you edited mesh simplification by hand, check that{' '}
        <code style={{ color: '#c4d4e8' }}>maxError</code> is at least 0.0001 and{' '}
        <code style={{ color: '#c4d4e8' }}>maxTriangles</code> is at least 500. Current builds clamp
        these on load when possible; fix the JSON or use Undo in the editor if available.
      </p>
      <div>
        <button type="button" onClick={onDismiss} style={buttonStyle}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
