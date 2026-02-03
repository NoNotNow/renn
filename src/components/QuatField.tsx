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
  disabled?: boolean
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
  disabled = false,
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
    <div style={{ marginBottom: 6 }}>
      <div style={{ marginBottom: 2, fontSize: '0.85em', color: '#c4cbd8' }}>{label}</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto 1fr auto 1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {components.map(({ key, value: v, onChange: onCompChange, label: compLabel }) => (
          <div
            key={key}
            style={{ display: 'contents' }}
          >
            <span style={{ fontSize: '0.7em', color: '#9aa4b2' }}>{compLabel}</span>
            <DraggableNumberField
              id={`${idPrefix}-${key}`}
              value={v}
              onChange={onCompChange}
              min={min}
              max={max}
              step={step}
              sensitivity={sensitivity}
              label={`${label} ${compLabel}`}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
