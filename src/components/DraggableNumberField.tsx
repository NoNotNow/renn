import { useRef, useCallback } from 'react'
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
}: DraggableNumberFieldProps) {
  const scrubRef = useRef<{ startValue: number; startX: number; deadZoneUsed: boolean } | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      if (e.button !== 0) return
      const target = e.target as HTMLInputElement
      scrubRef.current = {
        startValue: value,
        startX: e.clientX,
        deadZoneUsed: false,
      }
      if (typeof target.setPointerCapture === 'function') {
        target.setPointerCapture(e.pointerId)
      }
    },
    [value]
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

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    scrubRef.current = null
    const target = e.target as HTMLInputElement
    if (typeof target.releasePointerCapture === 'function') {
      target.releasePointerCapture(e.pointerId)
    }
  }, [])

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    scrubRef.current = null
    const target = e.target as HTMLInputElement
    if (typeof target.releasePointerCapture === 'function') {
      target.releasePointerCapture(e.pointerId)
    }
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value)
    if (!Number.isNaN(parsed)) {
      onChange(clampWithOptional(parsed, min, max))
    }
    },
    [onChange, min, max]
  )

  return (
    <input
      type="number"
      id={id}
      value={value}
      onChange={handleChange}
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
