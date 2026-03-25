import { useState, useCallback, useEffect } from 'react'
import { parseNumberInput } from '@/utils/numberUtils'
import { uiLogger } from '@/utils/uiLogger'
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
}: NumberInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [localValue, setLocalValue] = useState(() => (value === null ? '' : String(value)))

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value === null ? '' : String(value))
    }
  }, [value, isFocused])

  const displayValue = isFocused ? localValue : value === null ? '' : String(value)

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    setLocalValue(value === null ? '' : String(value))
  }, [value])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    const newValue = parseNumberInput(localValue, defaultValue)

    if (propertyName && entityId) {
      uiLogger.change(logComponent, `Change ${propertyName}`, {
        entityId,
        oldValue: value,
        newValue,
      })
    }

    if (value === null || newValue !== value) {
      onBeforeCommit?.()
    }
    onChange(newValue)
    setLocalValue(String(newValue))
  }, [localValue, value, defaultValue, onChange, onBeforeCommit, propertyName, entityId, logComponent])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isFocused) {
        setLocalValue(e.target.value)
      } else {
        const newValue = parseNumberInput(e.target.value, defaultValue)
        if (newValue !== value) {
          onBeforeCommit?.()
        }
        onChange(newValue)
      }
    },
    [isFocused, defaultValue, onChange, onBeforeCommit, value]
  )

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Return') {
      e.currentTarget.blur()
    }
  }, [])

  return (
    <div style={sidebarRowStyle}>
      <label htmlFor={id} style={sidebarLabelStyle}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={sidebarInputStyle}
        disabled={disabled}
      />
    </div>
  )
}
