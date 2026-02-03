import type { Vec3 } from '@/types/world'
import DraggableNumberField from './DraggableNumberField'

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
}: Vec3FieldProps) {
  const [xLabel, yLabel, zLabel] = axisLabels

  const handleX = (n: number) => onChange([n, value[1], value[2]])
  const handleY = (n: number) => onChange([value[0], n, value[2]])
  const handleZ = (n: number) => onChange([value[0], value[1], n])

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ marginBottom: 2, fontSize: '0.85em', color: '#c4cbd8' }}>{label}</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto 1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: '0.7em', color: '#9aa4b2' }}>{xLabel}</span>
        <DraggableNumberField
          id={`${idPrefix}-x`}
          value={value[0]}
          onChange={handleX}
          min={min}
          max={max}
          step={step}
          sensitivity={sensitivity}
          label={`${label} ${xLabel}`}
          disabled={disabled}
        />
        <span style={{ fontSize: '0.7em', color: '#9aa4b2' }}>{yLabel}</span>
        <DraggableNumberField
          id={`${idPrefix}-y`}
          value={value[1]}
          onChange={handleY}
          min={min}
          max={max}
          step={step}
          sensitivity={sensitivity}
          label={`${label} ${yLabel}`}
          disabled={disabled}
        />
        <span style={{ fontSize: '0.7em', color: '#9aa4b2' }}>{zLabel}</span>
        <DraggableNumberField
          id={`${idPrefix}-z`}
          value={value[2]}
          onChange={handleZ}
          min={min}
          max={max}
          step={step}
          sensitivity={sensitivity}
          label={`${label} ${zLabel}`}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
