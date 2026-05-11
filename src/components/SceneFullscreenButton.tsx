import type { CSSProperties } from 'react'

export interface SceneFullscreenButtonProps {
  active: boolean
  visible: boolean
  onToggle: () => void
  /**
   * Called after toggle so focus leaves the button (Space/Enter won’t re-trigger exit fullscreen).
   * SceneView wires this to focus the WebGL host (`tabIndex={-1}`).
   */
  onReturnFocusToScene?: () => void
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  left: 10,
  bottom: 10,
  zIndex: 115,
}

const buttonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  color: '#e6e9f2',
  background: 'rgba(27, 31, 42, 0.88)',
  border: '1px solid #3d4a62',
  borderRadius: 6,
  boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
}

/** Floating fullscreen toggle anchored to the bottom-left of a scene host. */
export function SceneFullscreenButton({
  active,
  visible,
  onToggle,
  onReturnFocusToScene,
}: SceneFullscreenButtonProps) {
  return (
    <div style={{ ...containerStyle, display: visible ? 'block' : 'none' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
          onReturnFocusToScene?.()
        }}
        aria-label={active ? 'Exit fullscreen' : 'Enter fullscreen'}
        title={active ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
        style={buttonStyle}
      >
        {active ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="square"
            />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="square"
            />
          </svg>
        )}
      </button>
    </div>
  )
}
