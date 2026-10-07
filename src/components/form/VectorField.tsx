import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import DraggableNumberField from '../DraggableNumberField'
import { EntityPanelIcons } from '../EntityPanelIcons'
import { entityPanelIconButtonStyle } from '../sharedStyles'
import { theme } from '@/config/theme'
import type { VecComponentChange } from '@/utils/mixedInspectorEdit'
import {
  activeLinkIndices,
  applyVectorComponentChange,
  canLink,
  displayComponentsForMode,
  type VectorEditMode,
} from '@/utils/vectorFieldEdit'

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
  onBeforeCommit?: (committedValue: number) => void
  /** Native tooltip on the group label row. */
  labelTitle?: string
  /** Optional per-component tooltip on axis/row labels; same length as `componentLabels`. */
  axisTitles?: string[]
  /** Show link/unlink toggle when two or more labeled components exist. Default true. */
  linkable?: boolean
  /** Initial linked state (e.g. scale groups often start linked). */
  defaultLinked?: boolean
  /** Allow switching between absolute and relative edit modes. Default true. */
  allowRelative?: boolean
  /** Initial edit mode. */
  defaultMode?: VectorEditMode
  /**
   * Multi-select: `mixed[i]` marks components the selected entities disagree on (shown empty with a
   * "Mixed" placeholder). `value` then carries the first entity's vector for the shared components.
   */
  mixed?: readonly boolean[]
  /**
   * Required with `mixed`: receives a single-component edit (set, or relative increment in relative
   * mode) so the parent can apply it to each entity's own vector. Linked editing is suspended while any
   * component is mixed, and `onChange` is not called.
   */
  onComponentChange?: (change: VecComponentChange) => void
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
  linkable = true,
  defaultLinked = false,
  allowRelative = true,
  defaultMode = 'absolute',
  mixed,
  onComponentChange,
}: VectorFieldProps<T>) {
  const linkIndices = useMemo(() => activeLinkIndices(componentLabels), [componentLabels])
  const showLinkToggle = linkable && canLink(componentLabels)

  const [editMode, setEditMode] = useState<VectorEditMode>(defaultMode)
  const [linked, setLinked] = useState(defaultLinked)
  const relativeBaselineRef = useRef<number[] | null>(null)
  const isScrubbingRef = useRef(false)
  /** Relative + mixed: last total delta emitted per component during the current scrub. */
  const relativeScrubLastRef = useRef<Record<number, number>>({})
  const hasMixed = onComponentChange !== undefined && mixed !== undefined && mixed.some(Boolean)
  const valueRef = useRef(value)
  valueRef.current = value

  const captureRelativeBaseline = useCallback(() => {
    const current = valueRef.current
    if (current === null) {
      relativeBaselineRef.current = null
      return
    }
    relativeBaselineRef.current = [...current]
  }, [])

  const switchMode = useCallback((next: VectorEditMode) => {
    flushSync(() => {
      if (document.activeElement instanceof HTMLInputElement) {
        document.activeElement.blur()
      }
    })
    if (next === 'relative') {
      captureRelativeBaseline()
    }
    setEditMode(next)
  }, [captureRelativeBaseline])

  const displayComponents = useMemo(() => {
    const base = displayComponentsForMode(value, editMode, componentLabels.length)
    if (editMode !== 'absolute' || !mixed) return base
    return base.map((v, i) => (mixed[i] ? null : v))
  }, [value, editMode, componentLabels.length, mixed])

  const handleComponentChange = (index: number) => (newValue: number) => {
    if (hasMixed) {
      let amount = newValue
      if (editMode === 'relative' && isScrubbingRef.current) {
        // Scrub reports the running total from scrub start; emit only the increment since the last move.
        amount = newValue - (relativeScrubLastRef.current[index] ?? 0)
        relativeScrubLastRef.current[index] = newValue
      }
      onComponentChange!({ index, value: amount, relative: editMode === 'relative' })
      return
    }
    const next = applyVectorComponentChange({
      current: value,
      relativeBaseline: relativeBaselineRef.current,
      index,
      newComponentValue: newValue,
      mode: editMode,
      linked: linked && showLinkToggle,
      linkIndices,
      length: componentLabels.length,
    })
    onChange(next as T)
    if (editMode === 'relative' && !isScrubbingRef.current) {
      relativeBaselineRef.current = [...next]
    }
  }

  const gridColumns = `repeat(${componentLabels.length}, auto 1fr)`

  const headerStyle: CSSProperties = {
    marginBottom: 2,
    fontSize: '0.85em',
    color: '#c4cbd8',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    ...(labelTitle ? { cursor: 'help' } : {}),
  }

  const modeButtonStyle = (active: boolean): CSSProperties => ({
    ...entityPanelIconButtonStyle,
    minWidth: 24,
    minHeight: 24,
    opacity: active ? 1 : 0.55,
    color: active ? theme.text.accentBlue : theme.text.muted,
    cursor: disabled ? 'not-allowed' : 'pointer',
  })

  const linkAriaLabel = linked ? `${label} unlink axes` : `${label} link axes`

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={headerStyle} title={labelTitle}>
        <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
        {allowRelative ? (
          <div style={{ display: 'flex', gap: 2 }} role="group" aria-label={`${label} edit mode`}>
            <button
              type="button"
              aria-label="Absolute values"
              aria-pressed={editMode === 'absolute'}
              title="Absolute — edit stored world/document values."
              disabled={disabled}
              onClick={() => switchMode('absolute')}
              style={modeButtonStyle(editMode === 'absolute')}
            >
              {EntityPanelIcons.absolute}
            </button>
            <button
              type="button"
              aria-label="Relative offsets"
              aria-pressed={editMode === 'relative'}
              title="Relative — fields show deltas added to the value when you switched modes."
              disabled={disabled}
              onClick={() => switchMode('relative')}
              style={modeButtonStyle(editMode === 'relative')}
            >
              {EntityPanelIcons.relative}
            </button>
          </div>
        ) : null}
        {showLinkToggle ? (
          <button
            type="button"
            aria-label={linkAriaLabel}
            aria-pressed={linked}
            title={
              linked
                ? 'Linked — changing one axis updates the others (uniform when equal, proportional delta otherwise).'
                : 'Unlinked — each axis edits independently.'
            }
            disabled={disabled}
            onClick={() => setLinked((prev) => !prev)}
            style={{
              ...modeButtonStyle(linked),
              color: linked ? theme.text.accentBlue : theme.text.muted,
            }}
          >
            {linked ? EntityPanelIcons.link : EntityPanelIcons.linkOff}
          </button>
        ) : null}
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
            {compLabel.trim() ? (
              <DraggableNumberField
                id={`${idPrefix}-${compLabel.toLowerCase()}`}
                value={value === null ? null : (displayComponents[index] ?? null)}
                onChange={handleComponentChange(index)}
                min={editMode === 'relative' ? undefined : min}
                max={editMode === 'relative' ? undefined : max}
                step={step}
                sensitivity={sensitivity}
                label={`${label} ${compLabel}`}
                inputTitle={
                  editMode === 'relative'
                    ? `Relative ${compLabel} offset (added to baseline when mode was enabled).`
                    : axisTitles?.[index]
                }
                disabled={disabled}
                onScrubStart={() => {
                  if (editMode === 'relative') captureRelativeBaseline()
                  isScrubbingRef.current = true
                  relativeScrubLastRef.current = {}
                  onScrubStart?.()
                }}
                onScrubEnd={(hadScrub) => {
                  isScrubbingRef.current = false
                  if (hadScrub && editMode === 'relative') {
                    const current = valueRef.current
                    relativeBaselineRef.current = current === null ? null : [...current]
                  }
                  onScrubEnd?.(hadScrub)
                }}
                onBeforeCommit={onBeforeCommit}
              />
            ) : (
              <span aria-hidden={true} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
