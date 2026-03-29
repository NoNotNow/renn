import type { CSSProperties } from 'react'

export interface GameHudProps {
  score: number
  damage: number
  /** Signed forward speed (m/s) along entity forward; from camera target + physics. */
  speedMs: number
  /** Car2 wheel angle −1…1; visual rotation scales this. */
  wheelAngle: number
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

const MAX_KMH = 180
const STEER_VIS_DEG = 118

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function SpeedTachSvg({ speedMs }: { speedMs: number }) {
  const speedKmh = Math.min(MAX_KMH, Math.abs(speedMs) * 3.6)
  const t = MAX_KMH > 0 ? Math.min(1, speedKmh / MAX_KMH) : 0
  const needleDeg = 210 - t * 240
  const cx = 100
  const cy = 88
  const rInner = 64
  const rTicks = 70
  const majorTicks: number[] = []
  for (let v = 0; v <= MAX_KMH; v += 20) majorTicks.push(v)

  return (
    <svg width={200} height={118} viewBox="0 0 200 118" aria-hidden style={{ display: 'block' }}>
      <defs>
        <linearGradient id="rennTachArc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(90, 200, 255, 0.45)" />
          <stop offset="100%" stopColor="rgba(40, 120, 220, 0.25)" />
        </linearGradient>
        <linearGradient id="rennNeedle" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#ff4d6a" />
          <stop offset="55%" stopColor="#ffb38a" />
          <stop offset="100%" stopColor="#fff5e6" />
        </linearGradient>
        <filter id="rennNeedleGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M 28 78 A 72 72 0 0 1 172 78"
        fill="none"
        stroke="url(#rennTachArc)"
        strokeWidth={5}
        strokeLinecap="round"
      />
      {majorTicks.map((v) => {
        const tt = v / MAX_KMH
        const deg = 210 - tt * 240
        const p0 = polar(cx, cy, rTicks, deg)
        const p1 = polar(cx, cy, rTicks - (v % 40 === 0 ? 10 : 5), deg)
        return (
          <line
            key={v}
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke={v % 40 === 0 ? 'rgba(200, 230, 255, 0.85)' : 'rgba(160, 190, 220, 0.45)'}
            strokeWidth={v % 40 === 0 ? 2 : 1}
            strokeLinecap="round"
          />
        )
      })}
      {[10, 30, 50, 70, 90, 110, 130, 150, 170].map((v) => {
        const tt = v / MAX_KMH
        const deg = 210 - tt * 240
        const p0 = polar(cx, cy, rTicks, deg)
        const p1 = polar(cx, cy, rTicks - 4, deg)
        return (
          <line
            key={`m-${v}`}
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke="rgba(140, 170, 200, 0.35)"
            strokeWidth={1}
            strokeLinecap="round"
          />
        )
      })}
      <g transform={`rotate(${needleDeg}, ${cx}, ${cy})`} filter="url(#rennNeedleGlow)">
        <polygon
          points={`${cx},${cy - 4} ${cx + 3},${cy + 2} ${cx},${cy - rInner + 4} ${cx - 3},${cy + 2}`}
          fill="url(#rennNeedle)"
        />
        <circle cx={cx} cy={cy} r={5} fill="#1a1e28" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      </g>
      <text
        x={cx}
        y={106}
        textAnchor="middle"
        fill="rgba(180, 210, 235, 0.9)"
        style={{ fontFamily: '"Orbitron", system-ui, sans-serif', fontSize: 11, fontWeight: 700 }}
      >
        {Math.round(speedKmh)}
        <tspan fill="rgba(140, 170, 200, 0.75)" fontSize={8} fontWeight={600}>
          {' '}
          KM/H
        </tspan>
      </text>
      <text
        x={cx}
        y={22}
        textAnchor="middle"
        fill="rgba(120, 200, 255, 0.55)"
        style={{
          fontFamily: '"Orbitron", system-ui, sans-serif',
          fontSize: 7,
          letterSpacing: '0.28em',
          fontWeight: 600,
        }}
      >
        SPEED
      </text>
    </svg>
  )
}

function SteeringWheelSvg({ wheelAngle }: { wheelAngle: number }) {
  const rot = wheelAngle * STEER_VIS_DEG
  return (
    <svg width={112} height={112} viewBox="0 0 112 112" aria-hidden style={{ display: 'block' }}>
      <defs>
        <linearGradient id="rennWheelCarbon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2a2e38" />
          <stop offset="35%" stopColor="#1a1d24" />
          <stop offset="70%" stopColor="#252a32" />
          <stop offset="100%" stopColor="#12151a" />
        </linearGradient>
        <linearGradient id="rennWheelAlcantara" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3d3842" />
          <stop offset="100%" stopColor="#1c1820" />
        </linearGradient>
        <linearGradient id="rennPaddle" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4a4a52" />
          <stop offset="100%" stopColor="#c8a050" />
        </linearGradient>
      </defs>
      <g transform={`translate(56,56) rotate(${rot})`}>
        <rect x={-42} y={-8} width={10} height={28} rx={2} fill="url(#rennPaddle)" opacity={0.92} />
        <rect x={32} y={-8} width={10} height={28} rx={2} fill="url(#rennPaddle)" opacity={0.92} />
        <path
          d="M 0 -46 A 46 46 0 1 1 0 38 L -18 38 Q 0 22 18 38 L 0 38 A 38 38 0 1 0 0 -38 Z"
          fill="url(#rennWheelAlcantara)"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={0.75}
        />
        <path
          d="M 0 -50 A 50 50 0 1 1 0 42"
          fill="none"
          stroke="url(#rennWheelCarbon)"
          strokeWidth={7}
          strokeLinecap="round"
        />
        <path
          d="M -24 40 L 24 40"
          stroke="url(#rennWheelCarbon)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <ellipse cx={0} cy={0} rx={14} ry={14} fill="#0e1014" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        <circle cx={0} cy={0} r={5} fill="#1c222c" stroke="rgba(200,200,210,0.2)" strokeWidth={0.75} />
        <line x1={0} y1={-14} x2={0} y2={-36} stroke="rgba(255,255,255,0.08)" strokeWidth={2} strokeLinecap="round" />
        <line
          x1={0}
          y1={14}
          x2={0}
          y2={36}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

/**
 * Play-mode overlay: score (green), damage (red), drive cluster (tach + wheel) from camera target.
 */
export function GameHud({ score, damage, speedMs, wheelAngle }: GameHudProps) {
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

      <div
        role="group"
        aria-label="Speed and steering"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 18,
          transform: 'translateX(-50%)',
          zIndex: 52,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 4,
          padding: '10px 16px 12px',
          borderRadius: 14,
          border: '1px solid rgba(100, 160, 220, 0.35)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: '0 4px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
          backgroundImage: `
            repeating-linear-gradient(8deg, transparent, transparent 3px, rgba(80, 140, 200, 0.04) 3px, rgba(80, 140, 200, 0.04) 6px),
            linear-gradient(160deg, rgba(10, 16, 26, 0.88) 0%, rgba(8, 12, 20, 0.92) 100%)
          `,
          pointerEvents: 'none',
        }}
      >
        <SpeedTachSvg speedMs={speedMs} />
        <div style={{ paddingBottom: 4 }}>
          <SteeringWheelSvg wheelAngle={wheelAngle} />
        </div>
      </div>
    </>
  )
}
