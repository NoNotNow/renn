import type { CSSProperties } from 'react'
import DraggableNumberField from '../DraggableNumberField'

export interface VectorFieldProps<T extends number[]> {
  label: string
  /** `null` = mixed values (multi-select); empty inputs until user commits a number. */
  value: T | null
  onChange: (value: T) => void
  componentLabels: string[]
  min?: number
  max?: number
  step?: number
  sensitivity?: number
  idPrefix?: string
  disabled?: boolean
  onScrubStart?: () => void
  onScrubEnd?: (hadScrub: boolean) => void
  onBeforeCommit?: () => void
  /** Native tooltip on the group label row. */
  labelTitle?: string
  /** Optional per-component tooltip on axis/row labels; same length as `componentLabels`. */
  axisTitles?: string[]
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
  onScrubStart,
  onScrubEnd,
  onBeforeCommit,
  labelTitle,
  axisTitles,
}: VectorFieldProps<T>) {
  const handleComponentChange = (index: number) => (newValue: number) => {
    const template = (value ?? ([0, 0, 0] as unknown as T)) as T
    const newArray = [...template] as unknown as number[]
    newArray[index] = newValue
    onChange(newArray as T)
  }

  const gridColumns = `repeat(${componentLabels.length}, auto 1fr)`

  const headerStyle: CSSProperties = {
    marginBottom: 2,
    fontSize: '0.85em',
    color: '#c4cbd8',
    ...(labelTitle ? { cursor: 'help' } : {}),
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={headerStyle} title={labelTitle}>
        {label}
      </div>
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
            <span
              style={{
                fontSize: '0.7em',
                color: '#9aa4b2',
                ...(axisTitles?.[index] ? { cursor: 'help' } : {}),
              }}
              title={axisTitles?.[index]}
            >
              {compLabel}
            </span>
            <DraggableNumberField
              id={`${idPrefix}-${compLabel.toLowerCase()}`}
              value={value === null ? null : value[index]!}
              onChange={handleComponentChange(index)}
              min={min}
              max={max}
              step={step}
              sensitivity={sensitivity}
              label={`${label} ${compLabel}`}
              inputTitle={axisTitles?.[index]}
              disabled={disabled}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              onBeforeCommit={onBeforeCommit}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
