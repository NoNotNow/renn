import type { Vec3 } from '@/types/world'
import VectorField from './form/VectorField'
import type { VectorEditMode } from '@/utils/vectorFieldEdit'
import type { VecComponentChange } from '@/utils/mixedInspectorEdit'

export interface Vec3FieldProps {
  label: string
  /** `null` when selected entities disagree (multi-select). */
  value: Vec3 | null
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
  onBeforeCommit?: (committedValue: number) => void
  /** Native tooltip on the group label row. */
  labelTitle?: string
  /** Optional per-axis tooltips; same order as axisLabels. */
  axisTitles?: [string, string, string]
  linkable?: boolean
  defaultLinked?: boolean
  allowRelative?: boolean
  defaultMode?: VectorEditMode
  /** Per-axis mixed flags (multi-select); see `VectorField`. */
  mixed?: readonly boolean[]
  onComponentChange?: (change: VecComponentChange) => void
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
  labelTitle,
  axisTitles,
  linkable,
  defaultLinked,
  allowRelative,
  defaultMode,
  mixed,
  onComponentChange,
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
      labelTitle={labelTitle}
      axisTitles={axisTitles}
      linkable={linkable}
      defaultLinked={defaultLinked}
      allowRelative={allowRelative}
      defaultMode={defaultMode}
      mixed={mixed}
      onComponentChange={onComponentChange}
    />
  )
}
