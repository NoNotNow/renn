import type { Vec3 } from '@/types/world'
import VectorField from './form/VectorField'

export interface Vec3FieldProps {
  label: string
  value: Vec3
  onChange: (v: Vec3) => void
  min?: number
  max?: number
  step?: number
  sensitivity?: number
  axisLabels?: [string, string, string]
  idPrefix?: string
  disabled?: boolean
  onScrubStart?: () => void
  onScrubEnd?: (hadScrub: boolean) => void
  onBeforeCommit?: () => void
}

const DEFAULT_AXIS_LABELS: [string, string, string] = ['X', 'Y', 'Z']

export default function Vec3Field({
  label,
  value,
  onChange,
  min,
  max,
  step,
  sensitivity,
  axisLabels = DEFAULT_AXIS_LABELS,
  idPrefix = 'vec3',
  disabled = false,
  onScrubStart,
  onScrubEnd,
  onBeforeCommit,
}: Vec3FieldProps) {
  return (
    <VectorField
      label={label}
      value={value}
      onChange={onChange}
      componentLabels={axisLabels}
      min={min}
      max={max}
      step={step}
      sensitivity={sensitivity}
      idPrefix={idPrefix}
      disabled={disabled}
      onScrubStart={onScrubStart}
      onScrubEnd={onScrubEnd}
      onBeforeCommit={onBeforeCommit}
    />
  )
}
