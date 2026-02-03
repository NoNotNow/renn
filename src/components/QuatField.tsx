import type { Quat } from '@/types/world'
import VectorField from './form/VectorField'

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
  return (
    <VectorField
      label={label}
      value={value}
      onChange={onChange}
      componentLabels={COMPONENT_LABELS}
      min={min}
      max={max}
      step={step}
      sensitivity={sensitivity}
      idPrefix={idPrefix}
      disabled={disabled}
    />
  )
}
