import type { CSSProperties } from 'react'

export interface GameHudProps {
  score: number
  damage: number
}

const cardBase: CSSProperties = {
  position: 'relative',
  minWidth: 112,
  padding: '10px 14px 12px',
  borderRadius: 10,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const labelStyle: CSSProperties = {
  fontFamily: '"Orbitron", system-ui, sans-serif',
  fontSize: 9,
  letterSpacing: '0.22em',
  fontWeight: 600,
  marginBottom: 4,
  opacity: 0.92,
}

const valueStyle: CSSProperties = {
  fontFamily: '"Orbitron", system-ui, sans-serif',
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
}

/**
 * Play-mode overlay: score (green) and damage (red). Values are driven by `ctx.setScore` / `ctx.setDamage`.
 */
export function GameHud({ score, damage }: GameHudProps) {
  return (
    <>
      <style>
        {`
          @keyframes rennHudPulseScore {
            0%, 100% { filter: drop-shadow(0 0 6px rgba(72, 255, 140, 0.35)); }
            50% { filter: drop-shadow(0 0 14px rgba(100, 255, 160, 0.55)); }
          }
          @keyframes rennHudPulseDamage {
            0%, 100% { filter: drop-shadow(0 0 6px rgba(255, 72, 96, 0.35)); }
            50% { filter: drop-shadow(0 0 14px rgba(255, 100, 120, 0.5)); }
          }
        `}
      </style>
      <div
        role="status"
        aria-label="Game status"
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 52,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            ...cardBase,
            border: '1px solid rgba(72, 220, 130, 0.45)',
            backgroundImage: `
              repeating-linear-gradient(-18deg, transparent, transparent 2px, rgba(72, 220, 130, 0.04) 2px, rgba(72, 220, 130, 0.04) 4px),
              linear-gradient(145deg, rgba(8, 22, 14, 0.82) 0%, rgba(6, 14, 10, 0.88) 100%)
            `,
          }}
        >
          <div style={{ ...labelStyle, color: 'rgba(160, 240, 190, 0.85)' }}>SCORE</div>
          <div
            style={{
              ...valueStyle,
              color: '#b8ffc8',
              textShadow: '0 0 20px rgba(80, 255, 140, 0.45), 0 0 40px rgba(60, 200, 100, 0.2)',
              animation: 'rennHudPulseScore 3.2s ease-in-out infinite',
            }}
          >
            {score}
          </div>
        </div>
        <div
          style={{
            ...cardBase,
            border: '1px solid rgba(255, 90, 110, 0.5)',
            backgroundImage: `
              repeating-linear-gradient(12deg, transparent, transparent 2px, rgba(255, 90, 110, 0.05) 2px, rgba(255, 90, 110, 0.05) 4px),
              linear-gradient(145deg, rgba(22, 8, 10, 0.82) 0%, rgba(14, 6, 8, 0.88) 100%)
            `,
          }}
        >
          <div style={{ ...labelStyle, color: 'rgba(255, 180, 188, 0.88)' }}>DAMAGE</div>
          <div
            style={{
              ...valueStyle,
              color: '#ffb0b8',
              textShadow: '0 0 18px rgba(255, 80, 100, 0.5), 0 0 36px rgba(200, 40, 60, 0.2)',
              animation: 'rennHudPulseDamage 2.8s ease-in-out infinite',
            }}
          >
            {damage}
          </div>
        </div>
      </div>
    </>
  )
}
