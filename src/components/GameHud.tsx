import type { CSSProperties } from 'react'
import { useId } from 'react'

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

/** Circular chrome bezel around the tach only (px). */
const TACH_BEZEL_SIZE = 214
const TACH_BEZEL_INNER_PAD = 6

const tachChromeBezel: CSSProperties = {
  width: TACH_BEZEL_SIZE,
  height: TACH_BEZEL_SIZE,
  minWidth: TACH_BEZEL_SIZE,
  minHeight: TACH_BEZEL_SIZE,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  background:
    'radial-gradient(130% 108% at 50% 18%, #4a5468 0%, #2a3140 28%, #181d28 58%, #05070c 100%)',
  boxShadow: `
    0 0 0 1px rgba(255, 255, 255, 0.42),
    0 0 0 2px rgba(70, 76, 90, 0.98),
    0 0 0 3px rgba(160, 168, 188, 0.32),
    0 0 0 5px rgba(18, 20, 28, 0.95),
    0 0 0 7px rgba(90, 96, 112, 0.2),
    inset 0 2px 4px rgba(255, 255, 255, 0.26),
    inset 0 -8px 18px rgba(0, 0, 0, 0.78),
    0 12px 32px rgba(0, 0, 0, 0.55)
  `,
  padding: TACH_BEZEL_INNER_PAD,
  boxSizing: 'border-box',
}

/**
 * Upper semicircle (classic tach): center on chord, arc bulges upward.
 * u=0 → left end, u=1 → right end, u=0.5 → top (12 o’clock).
 */
const TACH_CX = 100
const TACH_CY = 84
const TACH_R = 72
const TACH_R_TICKS = 66
const TACH_R_NEEDLE = 58

/** Radians on upper arc: π (left) → 2π (right), passing through 3π/2 (top). */
function tachAngleRadForU(u: number): number {
  const clamped = Math.min(1, Math.max(0, u))
  return Math.PI * (1 + clamped)
}

/** Longer ticks toward the top of the dial (u≈0.5); sin peaks at apex. */
function tickInset(u: number, longMajor: boolean): number {
  const apex = Math.sin(u * Math.PI)
  const base = longMajor ? 9 : 6
  const apexExtra = longMajor ? 14 : 9
  return base + apex * apexExtra
}

function SpeedTachSvg({ speedMs }: { speedMs: number }) {
  const uid = useId().replace(/:/g, '_')
  const speedKmh = Math.min(MAX_KMH, Math.abs(speedMs) * 3.6)
  const t = MAX_KMH > 0 ? Math.min(1, speedKmh / MAX_KMH) : 0
  const θ = tachAngleRadForU(t)
  /** Default needle along −Y; rotate so it aligns with (cos θ, sin θ) from center. */
  const needleRotateDeg = (θ * 180) / Math.PI + 90

  const majorTicks: number[] = []
  for (let v = 0; v <= MAX_KMH; v += 20) majorTicks.push(v)

  return (
    <svg width={200} height={118} viewBox="0 0 200 118" aria-hidden style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`${uid}-tachArc`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(90, 200, 255, 0.45)" />
          <stop offset="100%" stopColor="rgba(40, 120, 220, 0.25)" />
        </linearGradient>
        <linearGradient id={`${uid}-needle`} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#ff4d6a" />
          <stop offset="55%" stopColor="#ffb38a" />
          <stop offset="100%" stopColor="#fff5e6" />
        </linearGradient>
        <filter id={`${uid}-needleGlow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={`M ${TACH_CX - TACH_R} ${TACH_CY} A ${TACH_R} ${TACH_R} 0 0 0 ${TACH_CX + TACH_R} ${TACH_CY}`}
        fill="none"
        stroke={`url(#${uid}-tachArc)`}
        strokeWidth={5}
        strokeLinecap="round"
      />
      {majorTicks.map((v) => {
        const u = v / MAX_KMH
        const angle = tachAngleRadForU(u)
        const longMajor = v % 40 === 0
        const inset = tickInset(u, longMajor)
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const p0 = {
          x: TACH_CX + TACH_R_TICKS * cos,
          y: TACH_CY + TACH_R_TICKS * sin,
        }
        const p1 = {
          x: TACH_CX + (TACH_R_TICKS - inset) * cos,
          y: TACH_CY + (TACH_R_TICKS - inset) * sin,
        }
        return (
          <line
            key={v}
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke={longMajor ? 'rgba(200, 230, 255, 0.85)' : 'rgba(160, 190, 220, 0.45)'}
            strokeWidth={longMajor ? 2 : 1}
            strokeLinecap="round"
          />
        )
      })}
      {[10, 30, 50, 70, 90, 110, 130, 150, 170].map((v) => {
        const u = v / MAX_KMH
        const angle = tachAngleRadForU(u)
        const inset = tickInset(u, false)
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const p0 = {
          x: TACH_CX + TACH_R_TICKS * cos,
          y: TACH_CY + TACH_R_TICKS * sin,
        }
        const p1 = {
          x: TACH_CX + (TACH_R_TICKS - inset) * cos,
          y: TACH_CY + (TACH_R_TICKS - inset) * sin,
        }
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
      <g
        transform={`rotate(${needleRotateDeg}, ${TACH_CX}, ${TACH_CY})`}
        filter={`url(#${uid}-needleGlow)`}
      >
        <polygon
          points={`${TACH_CX},${TACH_CY - 4} ${TACH_CX + 3},${TACH_CY + 2} ${TACH_CX},${TACH_CY - TACH_R_NEEDLE} ${TACH_CX - 3},${TACH_CY + 2}`}
          fill={`url(#${uid}-needle)`}
        />
        <circle
          cx={TACH_CX}
          cy={TACH_CY}
          r={5}
          fill="#1a1e28"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
        />
      </g>
      <text
        x={TACH_CX}
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
        x={TACH_CX}
        y={10}
        textAnchor="middle"
        fill="rgba(140, 215, 255, 0.82)"
        style={{
          fontFamily: '"Orbitron", system-ui, sans-serif',
          fontSize: 10,
          letterSpacing: '0.32em',
          fontWeight: 700,
        }}
      >
        SPEED
      </text>
    </svg>
  )
}

/**
 * Formula-style yoke: open top, two vertical grips, wide lower bridge (no circular rim).
 */
function SteeringWheelSvg({ wheelAngle }: { wheelAngle: number }) {
  const uid = useId().replace(/:/g, '_')
  const rotDeg = wheelAngle * STEER_VIS_DEG
  const ox = 64
  const oy = 50

  return (
    <svg width={128} height={92} viewBox="0 0 128 92" aria-hidden style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`${uid}-yokeBody`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#242830" />
          <stop offset="45%" stopColor="#12151c" />
          <stop offset="100%" stopColor="#1c2128" />
        </linearGradient>
        <linearGradient id={`${uid}-yokeGrip`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e222a" />
          <stop offset="50%" stopColor="#2a303c" />
          <stop offset="100%" stopColor="#181c24" />
        </linearGradient>
      </defs>
      <g transform={`translate(${ox},${oy}) rotate(${rotDeg})`}>
        <path
          d="M -54 28 L -54 -16 L -46 -34 L -32 -26 L -27 -10 L -27 28 Z"
          fill={`url(#${uid}-yokeGrip)`}
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={0.65}
          strokeLinejoin="round"
        />
        <path
          d="M 54 28 L 54 -16 L 46 -34 L 32 -26 L 27 -10 L 27 28 Z"
          fill={`url(#${uid}-yokeGrip)`}
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={0.65}
          strokeLinejoin="round"
        />
        <path
          d="M -27 28 L -27 -4 L -14 -4 L 0 -14 L 14 -4 L 27 -4 L 27 28 Z"
          fill={`url(#${uid}-yokeBody)`}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
        <path
          d="M -18 22 L 0 10 L 18 22"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={0.9}
          strokeLinecap="round"
        />
        <path
          d="M -22 6 L -8 6 M 8 6 L 22 6"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={0.6}
          strokeLinecap="round"
        />
        <circle cx={0} cy={8} r={9.5} fill="#06080c" stroke="rgba(255,255,255,0.11)" strokeWidth={1} />
        <circle cx={0} cy={8} r={5} fill="#141a24" stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
        <circle cx={24} cy={6} r={3.8} fill="#9e1424" stroke="#2a0608" strokeWidth={0.45} />
        <circle cx={24} cy={6} r={1.6} fill="#1a0a0c" opacity={0.85} />
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
          .rennTachBezel {
            position: relative;
          }
          .rennTachBezel::after {
            content: '';
            position: absolute;
            inset: 5px;
            border-radius: 50%;
            pointer-events: none;
            box-shadow:
              inset 0 0 0 1px rgba(255, 255, 255, 0.06),
              inset 0 10px 24px rgba(255, 255, 255, 0.04);
          }
          .rennDriveHudYoke {
            position: absolute;
            left: 50%;
            bottom: 8px;
            transform: translateX(-50%) scale(2.25);
            transform-origin: center bottom;
          }
          @media (max-width: 720px) {
            .rennDriveHudYoke {
              transform: translateX(-50%) scale(1.65);
            }
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
          left: 0,
          right: 0,
          bottom: 14,
          zIndex: 52,
          pointerEvents: 'none',
          minHeight: 240,
        }}
      >
        <div
          className="rennTachBezel"
          style={{
            position: 'absolute',
            left: 'max(12px, 3vw)',
            bottom: 8,
            ...tachChromeBezel,
            paddingTop: 8,
            paddingBottom: 12,
          }}
        >
          <div style={{ marginTop: 2, filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.4))' }}>
            <SpeedTachSvg speedMs={speedMs} />
          </div>
        </div>
        <div className="rennDriveHudYoke" style={{ filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.35))' }}>
          <SteeringWheelSvg wheelAngle={wheelAngle} />
        </div>
      </div>
    </>
  )
}
