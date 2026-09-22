import {
  useRef,
  useCallback,
  useState,
  useEffect,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { parseNumberInput, clamp } from '@/utils/numberUtils'
import {
  advanceScrubVelocity,
  createScrubVelocityState,
  scrubScaleFromVelocity,
  scrubValueDelta,
} from '@/utils/scrubNumberScaling'

const DEAD_ZONE_PX = 2
const DEFAULT_SENSITIVITY = 0.01
const DEFAULT_SCRUB_INPUT_TITLE = 'Drag horizontally to adjust; slow = fine, fast = larger steps. Or type a value.'

export interface DraggableNumberFieldProps {
  /** Use `null` for “mixed” multi-selection; shows empty until the user enters a value. */
  value: number | null
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  sensitivity?: number
  label?: string
  id?: string
  disabled?: boolean
  defaultValue?: number
  /** Fired on primary pointer down (potential scrub). */
  onScrubStart?: () => void
  /** Fired on pointer up/cancel; `true` if the scrub left the dead zone and applied deltas. */
  onScrubEnd?: (hadScrub: boolean) => void
  /** Blur/Enter commit that changes the stored number (not used during scrub; scrub uses onScrubEnd). */
  onBeforeCommit?: (committedValue: number) => void
  /** Native tooltip on the input; when omitted but `label` is set, a default scrub hint is shown. */
  inputTitle?: string
  style?: CSSProperties
}

function clampWithOptional(value: number, min: number | undefined, max: number | undefined): number {
  if (min !== undefined && max !== undefined) {
    return clamp(value, min, max)
  }
  if (min !== undefined && value < min) return min
  if (max !== undefined && value > max) return max
  return value
}

function stringifyValue(n: number | null): string {
  if (n === null) return ''
  return String(n)
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
  defaultValue = 0,
  onScrubStart,
  onScrubEnd,
  onBeforeCommit,
  inputTitle,
  style,
}: DraggableNumberFieldProps) {
  const resolvedInputTitle = inputTitle ?? (label ? DEFAULT_SCRUB_INPUT_TITLE : undefined)
  const scrubRef = useRef<{
    startX: number
    lastValue: number
    velocity: ReturnType<typeof createScrubVelocityState>
    smoothedScale: number
    deadZoneUsed: boolean
  } | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [localValue, setLocalValue] = useState(() => stringifyValue(value))
  const localAtFocusRef = useRef('')

  useEffect(() => {
    if (!isFocused && !isScrubbing) {
      setLocalValue(stringifyValue(value))
    }
  }, [value, isFocused, isScrubbing])

  const displayValue = isFocused || isScrubbing ? localValue : stringifyValue(value)

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    const next = stringifyValue(value)
    localAtFocusRef.current = next
    setLocalValue(next)
  }, [value])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    const parsed = parseNumberInput(localValue, defaultValue)
    const clamped = clampWithOptional(parsed, min, max)

    if (value === null) {
      onBeforeCommit?.(clamped)
      onChange(clamped)
      setLocalValue(stringifyValue(clamped))
      return
    }

    // Pass-through focus without edit: parent may have updated this axis (e.g. linked vec3).
    if (localValue === localAtFocusRef.current && clamped !== value) {
      setLocalValue(stringifyValue(value))
      return
    }

    if (clamped === value) {
      setLocalValue(stringifyValue(value))
      return
    }

    onBeforeCommit?.(clamped)
    onChange(clamped)
    setLocalValue(stringifyValue(clamped))
  }, [localValue, value, min, max, defaultValue, onChange, onBeforeCommit])

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLInputElement>) => {
      if (e.button !== 0 || disabled) return
      onScrubStart?.()
      const effectiveValue = value ?? defaultValue
      const startValue = isFocused
        ? clampWithOptional(parseNumberInput(localValue, defaultValue), min, max)
        : effectiveValue
      const now = performance.now()
      scrubRef.current = {
        startX: e.clientX,
        lastValue: startValue,
        velocity: createScrubVelocityState(e.clientX, now),
        smoothedScale: 1,
        deadZoneUsed: false,
      }
      setIsScrubbing(true)
      if (!isFocused) {
        setLocalValue(stringifyValue(startValue))
      }
      const target = e.target as HTMLInputElement
      if (typeof target.setPointerCapture === 'function') {
        target.setPointerCapture(e.pointerId)
      }
    },
    [value, defaultValue, isFocused, localValue, min, max, onScrubStart, disabled],
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLInputElement>) => {
      const scrub = scrubRef.current
      if (!scrub) return

      if (!scrub.deadZoneUsed && Math.abs(e.clientX - scrub.startX) < DEAD_ZONE_PX) return
      scrub.deadZoneUsed = true

      const now = performance.now()
      const prevX = scrub.velocity.lastX
      const deltaX = e.clientX - prevX

      scrub.velocity = advanceScrubVelocity(scrub.velocity, e.clientX, now)
      scrub.smoothedScale = scrubScaleFromVelocity(scrub.velocity.smoothedVelocityPxPerSec, scrub.smoothedScale, {
        baseSensitivity: sensitivity,
      })

      const deltaValue = scrubValueDelta(
        deltaX,
        scrub.velocity.smoothedVelocityPxPerSec,
        scrub.smoothedScale,
        sensitivity,
      )
      const newValue = clampWithOptional(scrub.lastValue + deltaValue, min, max)
      scrub.lastValue = newValue
      setLocalValue(stringifyValue(newValue))
      onChange(newValue)
    },
    [onChange, sensitivity, min, max],
  )

  const endScrub = useCallback(
    (e: PointerEvent<HTMLInputElement>) => {
      const scrub = scrubRef.current
      const hadScrub = scrub?.deadZoneUsed ?? false
      scrubRef.current = null
      setIsScrubbing(false)
      onScrubEnd?.(hadScrub)
      const target = e.target as HTMLInputElement
      if (typeof target.releasePointerCapture === 'function') {
        target.releasePointerCapture(e.pointerId)
      }
      if (!hadScrub && e.currentTarget !== document.activeElement) {
        setLocalValue(stringifyValue(value))
      }
    },
    [onScrubEnd, value],
  )

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLInputElement>) => {
      endScrub(e)
    },
    [endScrub],
  )

  const handlePointerCancel = useCallback(
    (e: PointerEvent<HTMLInputElement>) => {
      endScrub(e)
    },
    [endScrub],
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (isFocused) {
        setLocalValue(e.target.value)
      } else {
        const parsed = parseNumberInput(e.target.value, defaultValue)
        const clamped = clampWithOptional(parsed, min, max)
        if (value === null || clamped !== value) {
          onBeforeCommit?.(clamped)
        }
        onChange(clamped)
      }
    },
    [onChange, min, max, isFocused, defaultValue, onBeforeCommit, value],
  )

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
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
      title={resolvedInputTitle}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      style={{
        width: '100%',
        minWidth: 0,
        cursor: disabled ? 'not-allowed' : 'ew-resize',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  )
}
