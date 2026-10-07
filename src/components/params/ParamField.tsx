import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ParamDef } from '@/types/paramSchema'
import { theme } from '@/config/theme'
import DraggableNumberField from '@/components/DraggableNumberField'
import { EntityIdListPicker, EntityIdPicker } from './EntityIdControl'
import { isIdList } from '@/params/inferParamDefs'
import { defLabel, isOverridden, numberStepFor, numericOr, outsideHint } from '@/params/paramValue'

export interface ParamFieldProps {
  def: ParamDef
  /** Value stored at this scope (`undefined` = not set here). */
  value: unknown
  /** Value inherited from an outer scope; shown when `value` is unset and marks the field "set here" once edited. */
  inherited?: unknown
  /** Called with the new value. Omit for a read-only field. */
  onChange?: (value: unknown) => void
  /** Remove the value at this scope (reset to inherited / default). Shows a reset button while overridden. */
  onReset?: () => void
  layout?: 'strip' | 'form'
  /**
   * Set when a layer above the stage's own params supplies `value` (pipe binding / nested scope / stage-member scope):
   * the field shows a "from pipe" badge, `title` lists the layer chain.
   */
  source?: ParamFieldSource
}

export interface ParamFieldSource {
  /** Layer that sets the value, e.g. "Route planner" or "pipe binding". */
  label: string
  /** Tooltip with the full layer chain. */
  title: string
  /** True for a pipe layer (badge shown); false for stage / preset (no badge). */
  overridden: boolean
}

const inputStyle: CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  border: `1px solid ${theme.pipeNav.accentMuted}`,
  background: theme.bg.input,
  color: theme.text.primary,
  fontSize: 11,
  boxSizing: 'border-box',
}

const MARK_STYLE: CSSProperties = { color: theme.pipeNav.accent }

function numberTitle(def: ParamDef): string | undefined {
  const parts: string[] = []
  if (def.description) parts.push(def.description)
  if (def.min !== undefined || def.max !== undefined) {
    parts.push(`Suggested range ${def.min ?? '-inf'} to ${def.max ?? 'inf'} (not enforced)`)
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

/** Number with scrub; min/max only steer a drag that started inside the range, typed values are never clamped. */
function NumberControl({
  def,
  shown,
  onChange,
  width = 64,
  testId,
}: {
  def: ParamDef
  shown: number
  onChange?: (v: number) => void
  width?: number
  testId?: string
}) {
  const { step, sensitivity } = numberStepFor(def, shown)
  const scrubStartInside = useRef(false)
  const scrubbing = useRef(false)
  const pending = useRef<number | null>(null)
  const [live, setLive] = useState<number | null>(null)
  const commit = (v: number) => onChange?.(def.type === 'integer' ? Math.round(v) : v)
  return (
    <span data-testid={testId} title={numberTitle(def)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <DraggableNumberField
        label={defLabel(def)}
        value={live ?? shown}
        onChange={(v) => {
          if (!scrubbing.current) {
            commit(v)
            return
          }
          // Drag: keep it local and write once on release, so a drag is one undo step.
          let next = v
          if (scrubStartInside.current) {
            if (def.min !== undefined) next = Math.max(def.min, next)
            if (def.max !== undefined) next = Math.min(def.max, next)
          }
          pending.current = next
          setLive(next)
        }}
        onScrubStart={() => {
          scrubbing.current = true
          scrubStartInside.current = !outsideHint(def, shown)
          pending.current = null
        }}
        onScrubEnd={(hadScrub) => {
          scrubbing.current = false
          if (hadScrub && pending.current !== null) commit(pending.current)
          pending.current = null
          setLive(null)
        }}
        step={step}
        sensitivity={sensitivity}
        disabled={!onChange}
        style={{ ...inputStyle, width }}
      />
      {def.unit ? <span style={{ color: theme.text.muted }}>{def.unit}</span> : null}
      {outsideHint(def, shown) ? (
        <span title={numberTitle(def)} style={{ color: theme.text.muted }}>
          ⚠
        </span>
      ) : null}
    </span>
  )
}

/** Text-like input that commits on blur / Enter (no write per keystroke). */
function DraftInput({
  text,
  onCommit,
  disabled,
  width,
  placeholder,
  testId,
  parseError,
}: {
  text: string
  onCommit: (text: string) => void
  disabled: boolean
  width: number
  placeholder?: string
  testId?: string
  parseError?: boolean
}) {
  const [draft, setDraft] = useState(text)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(text)
  }, [text, focused])
  const commit = () => {
    if (draft !== text) onCommit(draft)
  }
  return (
    <input
      type="text"
      data-testid={testId}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      style={{ ...inputStyle, width, ...(parseError ? { borderColor: theme.feedback.destructiveChipBorder } : null) }}
    />
  )
}

function asNumbers(v: unknown, len: number): number[] {
  const arr = Array.isArray(v) ? v : []
  return Array.from({ length: len }, (_, i) => numericOr(arr[i], 0))
}

function parseNumberList(text: string): number[] | null {
  const parts = text
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const nums = parts.map(Number)
  return nums.every((n) => Number.isFinite(n)) ? nums : null
}

function JsonControl({
  shown,
  onChange,
  disabled,
  testId,
}: {
  shown: unknown
  onChange?: (v: unknown) => void
  disabled: boolean
  testId?: string
}) {
  const text = shown === undefined ? '' : JSON.stringify(shown)
  const [bad, setBad] = useState(false)
  return (
    <DraftInput
      text={text}
      width={160}
      disabled={disabled}
      testId={testId}
      parseError={bad}
      onCommit={(t) => {
        if (t.trim() === '') {
          onChange?.(undefined)
          setBad(false)
          return
        }
        try {
          onChange?.(JSON.parse(t))
          setBad(false)
        } catch {
          setBad(true)
        }
      }}
    />
  )
}

/** One typed control for a `ParamDef`, shared by the pipe drawer and the stage settings forms. */
export default function ParamField({ def: declaredDef, value, inherited, onChange, onReset, layout = 'strip', source }: ParamFieldProps) {
  // `threatIds` is declared as json in older stage blocks: a string-array `...Ids` key is still an entity id list
  const def: ParamDef =
    declaredDef.type === 'json' && /(^|[a-z])Ids$/.test(declaredDef.key) && (value === undefined || isIdList(declaredDef.key, value)) ?
      { ...declaredDef, type: 'entityIdList' }
    : declaredDef
  const label = defLabel(def)
  const disabled = !onChange
  const fallback = inherited !== undefined ? inherited : def.default
  const shown = value !== undefined ? value : fallback
  const fromPipe = source?.overridden === true
  const setHere = value !== undefined && (fromPipe || inherited !== undefined || isOverridden(value, def))
  const testId = `param-field-${def.key}`

  const rowStyle: CSSProperties =
    layout === 'form' ?
      { display: 'flex', alignItems: 'center', gap: 8, width: '100%', color: theme.text.secondary }
    : { display: 'flex', alignItems: 'center', gap: 4, color: theme.text.secondary }

  const mark = setHere ? (
    <>
      <span
        style={MARK_STYLE}
        title={fromPipe ? 'Set by a pipe layer' : inherited !== undefined ? 'Set at this scope' : 'Differs from default'}
      >
        •
      </span>
      {onReset && onChange ? (
        <button
          type="button"
          data-testid={`param-reset-${def.key}`}
          title={fromPipe ? `Remove the override from ${source.label}` : inherited !== undefined ? 'Remove the override at this scope' : 'Reset to default'}
          onClick={onReset}
          style={{ ...inputStyle, padding: '0 4px', cursor: 'pointer', border: 'none', background: 'transparent' }}
        >
          ↺
        </button>
      ) : null}
    </>
  ) : null

  const badge = fromPipe ? (
    <span
      data-testid={`param-source-${def.key}`}
      title={source.title}
      style={{ ...MARK_STYLE, fontSize: 10, border: `1px solid ${theme.pipeNav.accentMuted}`, borderRadius: 8, padding: '0 5px', whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      from pipe: {source.label}
    </span>
  ) : null

  const labelNode = (
    <span style={layout === 'form' ? { flex: '0 0 40%', minWidth: 0 } : undefined} title={def.description}>
      {label}
    </span>
  )

  let control: ReactNode
  switch (def.type) {
    case 'boolean':
      control = (
        <input
          type="checkbox"
          data-testid={testId}
          checked={Boolean(shown)}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
      )
      break
    case 'number':
    case 'integer':
      control = (
        <NumberControl
          def={def}
          shown={numericOr(shown, def.default)}
          onChange={onChange}
          testId={testId}
          width={layout === 'form' ? 70 : 64}
        />
      )
      break
    case 'enum': {
      const options = def.options ?? []
      const current = options.findIndex((o) => o.value === shown)
      control = (
        <select
          data-testid={testId}
          value={current >= 0 ? String(current) : ''}
          disabled={disabled}
          onChange={(e) => {
            const opt = options[Number(e.target.value)]
            if (opt) onChange?.(opt.value)
          }}
          style={inputStyle}
        >
          {current < 0 ? <option value="">{shown === undefined ? '(unset)' : String(shown)}</option> : null}
          {options.map((o, i) => (
            <option key={String(o.value)} value={String(i)}>
              {o.label ?? String(o.value)}
            </option>
          ))}
        </select>
      )
      break
    }
    case 'color':
      control = (
        <input
          type="color"
          data-testid={testId}
          value={typeof shown === 'string' && /^#[0-9a-f]{6}$/i.test(shown) ? shown : '#ffffff'}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )
      break
    case 'vec2':
    case 'vec3': {
      const n = def.type === 'vec2' ? 2 : 3
      const nums = asNumbers(shown, n)
      control = (
        <span data-testid={testId} title={def.description} style={{ display: 'inline-flex', gap: 3 }}>
          {nums.map((c, i) => (
            <NumberControl
              key={i}
              def={{ ...def, type: 'number', unit: undefined, min: undefined, max: undefined }}
              shown={c}
              width={52}
              onChange={
                onChange ?
                  (v) => {
                    const next = [...nums]
                    next[i] = v
                    onChange(next)
                  }
                : undefined
              }
            />
          ))}
          {def.unit ? <span style={{ color: theme.text.muted }}>{def.unit}</span> : null}
        </span>
      )
      break
    }
    case 'numberList': {
      const arr = Array.isArray(shown) ? shown : []
      control = (
        <DraftInput
          text={arr.join(', ')}
          width={layout === 'form' ? 200 : 120}
          disabled={disabled}
          testId={testId}
          placeholder="comma separated"
          onCommit={(t) => {
            const parsed = parseNumberList(t)
            if (parsed) onChange?.(parsed)
          }}
        />
      )
      break
    }
    case 'entityIdList': {
      const arr = Array.isArray(shown) ? shown.map(String) : []
      control = (
        <EntityIdListPicker
          ids={arr}
          disabled={disabled}
          testId={testId}
          onChange={onChange}
          textInput={
            <DraftInput
              text={arr.join(', ')}
              width={layout === 'form' ? 200 : 120}
              disabled={disabled}
              testId={testId}
              placeholder="ids, comma separated"
              onCommit={(t) =>
                onChange?.(
                  t
                    .split(/[\s,]+/)
                    .map((x) => x.trim())
                    .filter((x) => x !== ''),
                )
              }
            />
          }
        />
      )
      break
    }
    case 'json':
      control = <JsonControl shown={shown} onChange={onChange} disabled={disabled} testId={testId} />
      break
    case 'entityId':
      control = (
        <EntityIdPicker
          id={String(shown ?? '')}
          disabled={disabled}
          testId={testId}
          onChange={onChange}
          textInput={
            <DraftInput
              text={String(shown ?? '')}
              width={layout === 'form' ? 200 : 100}
              disabled={disabled}
              testId={testId}
              onCommit={(t) => onChange?.(t)}
            />
          }
        />
      )
      break
    case 'string':
    default:
      control = (
        <DraftInput
          text={String(shown ?? '')}
          width={layout === 'form' ? 200 : 100}
          disabled={disabled}
          testId={testId}
          onCommit={(t) => onChange?.(t)}
        />
      )
  }

  // Booleans keep the checkbox-first order (label wraps it) as the pipe strip always had.
  if (def.type === 'boolean') {
    return (
      <label style={rowStyle} title={def.description}>
        {control}
        {label}
        {badge}
        {mark}
      </label>
    )
  }
  // The pickers hold their own buttons and result rows: a <label> would forward their clicks to the first control.
  const Row = def.type === 'entityId' || def.type === 'entityIdList' ? 'div' : 'label'
  return (
    <Row style={rowStyle}>
      {labelNode}
      {control}
      {badge}
      {mark}
    </Row>
  )
}
