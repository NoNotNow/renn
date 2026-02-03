import DraggableNumberField from '../DraggableNumberField'

export interface VectorFieldProps<T extends number[]> {
  label: string
  value: T
  onChange: (value: T) => void
  componentLabels: string[]
  min?: number
  max?: number
  step?: number
  sensitivity?: number
  idPrefix?: string
  disabled?: boolean
}

export default function VectorField<T extends number[]>({
  label,
  value,
  onChange,
  componentLabels,
  min,
  max,
  step,
  sensitivity,
  idPrefix = 'vector',
  disabled = false,
}: VectorFieldProps<T>) {
  const handleComponentChange = (index: number) => (newValue: number) => {
    const newArray = [...value] as T
    newArray[index] = newValue
    onChange(newArray)
  }

  const gridColumns = `repeat(${componentLabels.length}, auto 1fr)`

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ marginBottom: 2, fontSize: '0.85em', color: '#c4cbd8' }}>{label}</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridColumns,
          alignItems: 'center',
          gap: 6,
        }}
      >
        {componentLabels.map((compLabel, index) => (
          <div key={index} style={{ display: 'contents' }}>
            <span style={{ fontSize: '0.7em', color: '#9aa4b2' }}>{compLabel}</span>
            <DraggableNumberField
              id={`${idPrefix}-${compLabel.toLowerCase()}`}
              value={value[index]}
              onChange={handleComponentChange(index)}
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
