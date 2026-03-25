import { useRef, useCallback, useState, useEffect } from 'react'
import { clamp } from '@/utils/numberUtils'

const DEAD_ZONE_PX = 2
const DEFAULT_SENSITIVITY = 0.01

export interface DraggableNumberFieldProps {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  sensitivity?: number
  label?: string
  id?: string
  disabled?: boolean
  /** Fired on primary pointer down (potential scrub). */
  onScrubStart?: () => void
  /** Fired on pointer up/cancel; `true` if the scrub left the dead zone and applied deltas. */
  onScrubEnd?: (hadScrub: boolean) => void
  /** Blur/Enter commit that changes the stored number (not used during scrub; scrub uses onScrubEnd). */
  onBeforeCommit?: () => void
}

function clampWithOptional(value: number, min: number | undefined, max: number | undefined): number {
  if (min !== undefined && max !== undefined) {
    return clamp(value, min, max)
  }
  if (min !== undefined && value < min) return min
  if (max !== undefined && value > max) return max
  return value
}

export default function DraggableNumberField({
  value,
  onChange,
  min,
  max,
  step = 0.1,
  sensitivity = DEFAULT_SENSITIVITY,
  label,
  id,
  disabled = false,
  onScrubStart,
  onScrubEnd,
  onBeforeCommit,
}: DraggableNumberFieldProps) {
  const scrubRef = useRef<{ startValue: number; startX: number; deadZoneUsed: boolean } | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [localValue, setLocalValue] = useState(stringifyValue(value))

  // When not focused, keep displayed value in sync with props
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(stringifyValue(value))
    }
  }, [value, isFocused])

  function stringifyValue(n: number): string {
    return String(n)
  }

  const displayValue = isFocused ? localValue : stringifyValue(value)

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    setLocalValue(stringifyValue(value))
  }, [value])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    const parsed = parseFloat(localValue)
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      const clamped = clampWithOptional(parsed, min, max)
      if (clamped !== value) {
        onBeforeCommit?.()
      }
      onChange(clamped)
      setLocalValue(stringifyValue(clamped))
    } else {
      setLocalValue(stringifyValue(value))
      onChange(value)
    }
  }, [localValue, value, min, max, onChange, onBeforeCommit])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      if (e.button !== 0) return
      onScrubStart?.()
      const target = e.target as HTMLInputElement
      const startValue = isFocused
        ? (() => {
            const p = parseFloat(localValue)
            return Number.isNaN(p) || !Number.isFinite(p) ? value : clampWithOptional(p, min, max)
          })()
        : value
      scrubRef.current = {
        startValue,
        startX: e.clientX,
        deadZoneUsed: false,
      }
      if (typeof target.setPointerCapture === 'function') {
        target.setPointerCapture(e.pointerId)
      }
    },
    [value, isFocused, localValue, min, max, onScrubStart]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      const scrub = scrubRef.current
      if (!scrub) return
      const deltaX = e.clientX - scrub.startX
      if (!scrub.deadZoneUsed && Math.abs(deltaX) < DEAD_ZONE_PX) return
      scrub.deadZoneUsed = true
      const deltaValue = deltaX * sensitivity
      const newValue = clampWithOptional(scrub.startValue + deltaValue, min, max)
      onChange(newValue)
    },
    [onChange, sensitivity, min, max]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      const scrub = scrubRef.current
      const hadScrub = scrub?.deadZoneUsed ?? false
      scrubRef.current = null
      onScrubEnd?.(hadScrub)
      const target = e.target as HTMLInputElement
      if (typeof target.releasePointerCapture === 'function') {
        target.releasePointerCapture(e.pointerId)
      }
    },
    [onScrubEnd]
  )

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      const scrub = scrubRef.current
      const hadScrub = scrub?.deadZoneUsed ?? false
      scrubRef.current = null
      onScrubEnd?.(hadScrub)
      const target = e.target as HTMLInputElement
      if (typeof target.releasePointerCapture === 'function') {
        target.releasePointerCapture(e.pointerId)
      }
    },
    [onScrubEnd]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isFocused) {
        setLocalValue(e.target.value)
      } else {
        const parsed = parseFloat(e.target.value)
        if (!Number.isNaN(parsed)) {
          onChange(clampWithOptional(parsed, min, max))
        }
      }
    },
    [onChange, min, max, isFocused]
  )

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Return') {
      e.currentTarget.blur()
    }
  }, [])

  return (
    <input
      type="number"
      id={id}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPointerDown={disabled ? undefined : handlePointerDown}
      onPointerMove={disabled ? undefined : handlePointerMove}
      onPointerUp={disabled ? undefined : handlePointerUp}
      onPointerCancel={disabled ? undefined : handlePointerCancel}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      style={{
        width: '100%',
        minWidth: 0,
        cursor: disabled ? 'not-allowed' : 'ew-resize',
        boxSizing: 'border-box',
      }}
    />
  )
}
