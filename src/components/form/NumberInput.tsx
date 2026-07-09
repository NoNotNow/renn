import { useCallback } from 'react'
import { uiLogger } from '@/utils/uiLogger'
import DraggableNumberField from '../DraggableNumberField'
import { sidebarRowStyle, sidebarLabelStyle, sidebarInputStyle } from '../sharedStyles'

export interface NumberInputProps {
  id: string
  label: string
  /** `null` = mixed multi-select (empty field). */
  value: number | null
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  disabled?: boolean
  entityId?: string
  propertyName?: string
  logComponent?: string
  /** Called immediately before `onChange` when blur commits a new value (not when unchanged). */
  onBeforeCommit?: () => void
  /** Native tooltip on the label (hover to read). */
  labelTitle?: string
  /** Optional scrub sensitivity override (units per pixel at low speed). */
  sensitivity?: number
  onScrubStart?: () => void
  onScrubEnd?: (hadScrub: boolean) => void
}

export default function NumberInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  defaultValue = 0,
  disabled = false,
  entityId,
  propertyName,
  logComponent = 'PropertyPanel',
  onBeforeCommit,
  labelTitle,
  sensitivity,
  onScrubStart,
  onScrubEnd,
}: NumberInputProps) {
  const handleBeforeCommit = useCallback(
    (committedValue: number) => {
      if (propertyName && entityId && (value === null || committedValue !== value)) {
        uiLogger.change(logComponent, `Change ${propertyName}`, {
          entityId,
          oldValue: value,
          newValue: committedValue,
        })
      }
      onBeforeCommit?.()
    },
    [onBeforeCommit, propertyName, entityId, logComponent, value],
  )

  return (
    <div style={sidebarRowStyle}>
      <label
        htmlFor={id}
        style={labelTitle ? { ...sidebarLabelStyle, cursor: 'help' } : sidebarLabelStyle}
        title={labelTitle}
      >
        {label}
      </label>
      <DraggableNumberField
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        disabled={disabled}
        sensitivity={sensitivity}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        onBeforeCommit={handleBeforeCommit}
        style={sidebarInputStyle}
      />
    </div>
  )
}
