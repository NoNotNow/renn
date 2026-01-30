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
}: Vec3FieldProps) {
  const [xLabel, yLabel, zLabel] = axisLabels

  const handleX = (n: number) => onChange([n, value[1], value[2]])
  const handleY = (n: number) => onChange([value[0], n, value[2]])
  const handleZ = (n: number) => onChange([value[0], value[1], n])

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ marginBottom: 4, fontSize: '0.9em' }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label htmlFor={`${idPrefix}-x`} style={{ fontSize: '0.75em', color: '#666' }}>
            {xLabel}
          </label>
          <DraggableNumberField
            id={`${idPrefix}-x`}
            value={value[0]}
            onChange={handleX}
            min={min}
            max={max}
            step={step}
            sensitivity={sensitivity}
            label={`${label} ${xLabel}`}
          />
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label htmlFor={`${idPrefix}-y`} style={{ fontSize: '0.75em', color: '#666' }}>
            {yLabel}
          </label>
          <DraggableNumberField
            id={`${idPrefix}-y`}
            value={value[1]}
            onChange={handleY}
            min={min}
            max={max}
            step={step}
            sensitivity={sensitivity}
            label={`${label} ${yLabel}`}
          />
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label htmlFor={`${idPrefix}-z`} style={{ fontSize: '0.75em', color: '#666' }}>
            {zLabel}
          </label>
          <DraggableNumberField
            id={`${idPrefix}-z`}
            value={value[2]}
            onChange={handleZ}
            min={min}
            max={max}
            step={step}
            sensitivity={sensitivity}
            label={`${label} ${zLabel}`}
          />
        </div>
      </div>
    </div>
  )
}
