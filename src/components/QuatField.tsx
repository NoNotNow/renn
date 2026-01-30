import type { Quat } from '@/types/world'
import DraggableNumberField from './DraggableNumberField'

export interface QuatFieldProps {
  label: string
  value: Quat
  onChange: (q: Quat) => void
  min?: number
  max?: number
  step?: number
  sensitivity?: number
  idPrefix?: string
}

const COMPONENT_LABELS: [string, string, string, string] = ['x', 'y', 'z', 'w']

export default function QuatField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  sensitivity,
  idPrefix = 'quat',
}: QuatFieldProps) {
  const handleX = (n: number) => onChange([n, value[1], value[2], value[3]])
  const handleY = (n: number) => onChange([value[0], n, value[2], value[3]])
  const handleZ = (n: number) => onChange([value[0], value[1], n, value[3]])
  const handleW = (n: number) => onChange([value[0], value[1], value[2], n])

  const components = [
    { key: 'x', value: value[0], onChange: handleX, label: COMPONENT_LABELS[0] },
    { key: 'y', value: value[1], onChange: handleY, label: COMPONENT_LABELS[1] },
    { key: 'z', value: value[2], onChange: handleZ, label: COMPONENT_LABELS[2] },
    { key: 'w', value: value[3], onChange: handleW, label: COMPONENT_LABELS[3] },
  ]

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ marginBottom: 4, fontSize: '0.9em' }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {components.map(({ key, value: v, onChange: onCompChange, label: compLabel }) => (
          <div
            key={key}
            style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <label
              htmlFor={`${idPrefix}-${key}`}
              style={{ fontSize: '0.75em', color: '#666' }}
            >
              {compLabel}
            </label>
            <DraggableNumberField
              id={`${idPrefix}-${key}`}
              value={v}
              onChange={onCompChange}
              min={min}
              max={max}
              step={step}
              sensitivity={sensitivity}
              label={`${label} ${compLabel}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
