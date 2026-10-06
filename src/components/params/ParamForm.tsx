import { useMemo, useState, type CSSProperties } from 'react'
import type { ParamDef, ParamType } from '@/types/paramSchema'
import { PARAM_TYPES } from '@/types/paramSchema'
import { theme } from '@/config/theme'
import { getParamValue } from '@/params/paramValue'
import ParamField, { type ParamFieldSource } from './ParamField'
import ParamsJsonEditor from './ParamsJsonEditor'

export interface ParamFormProps {
  defs: ParamDef[]
  /** Values stored at the edited scope. */
  values: Record<string, unknown>
  /** Values inherited from outer scopes (shown greyed-in as the effective value until overridden). */
  inheritedValues?: Record<string, unknown>
  /** What the JSON editor shows and replaces (defaults to `values`; the stage form passes the stage's own params). */
  jsonValues?: Record<string, unknown>
  /** Layer that supplies each key's value when it is not the stage's own (keyed by top-level key); drives the "from pipe" badge. */
  sources?: Record<string, ParamFieldSource>
  /** Where "Add" may write (e.g. the stage itself or this stage inside its pipe); a select shows when there are 2+. */
  addTargets?: { id: string; label: string }[]
  /** Called instead of `onChange` when an add target is chosen. */
  onAddAt?: (targetId: string, key: string, value: unknown) => void
  /** Set (`value`) or remove (`undefined`) one key at the edited scope. Omit for read-only. */
  onChange?: (key: string, value: unknown) => void
  /** Replace the whole params object (JSON toggle). Hides the toggle when omitted. */
  onReplace?: (params: Record<string, unknown>) => void
  layout?: 'strip' | 'form'
  /** Let the user add a param that has no def yet (key + type). */
  allowAdd?: boolean
  /** Problems found while reading the schema (e.g. a bad `@params` block). */
  errors?: string[]
  /** Shown above the JSON editor. */
  jsonHint?: string
  /** Start with the JSON editor open (e.g. when nothing declares a schema). */
  jsonOpenByDefault?: boolean
  /** Test id prefix for the JSON editor controls. */
  jsonTestIdPrefix?: string
  testId?: string
}

const DEFAULT_BY_TYPE: Record<ParamType, unknown> = {
  number: 0,
  integer: 0,
  string: '',
  boolean: false,
  enum: '',
  color: '#ffffff',
  entityId: '',
  vec2: [0, 0],
  vec3: [0, 0, 0],
  numberList: [],
  entityIdList: [],
  json: {},
}

const smallButton: CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  border: `1px solid ${theme.pipeNav.accentMuted}`,
  background: theme.bg.input,
  color: theme.text.secondary,
  fontSize: 11,
  cursor: 'pointer',
}

function groupDefs(defs: ParamDef[]): { name: string | null; advanced: boolean; items: ParamDef[] }[] {
  const out: { name: string | null; advanced: boolean; items: ParamDef[] }[] = []
  const find = (name: string | null, advanced: boolean) => {
    let g = out.find((x) => x.name === name && x.advanced === advanced)
    if (!g) {
      g = { name, advanced, items: [] }
      out.push(g)
    }
    return g
  }
  for (const d of defs) find(d.group ?? null, d.advanced === true).items.push(d)
  // ungrouped first, then groups in order of appearance, advanced after their basic group
  return out.sort((a, b) => Number(a.name !== null) - Number(b.name !== null))
}

function AddParamRow({
  onAdd,
  targets,
}: {
  onAdd: (key: string, type: ParamType, targetId?: string) => void
  targets?: { id: string; label: string }[]
}) {
  const [target, setTarget] = useState(targets?.[0]?.id)
  const [key, setKey] = useState('')
  const [type, setType] = useState<ParamType>('number')
  const trimmed = key.trim()
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
      <input
        data-testid="param-add-key"
        value={key}
        placeholder="new param key"
        onChange={(e) => setKey(e.target.value)}
        style={{ ...smallButton, cursor: 'text', width: 110, color: theme.text.primary }}
      />
      <select
        data-testid="param-add-type"
        value={type}
        onChange={(e) => setType(e.target.value as ParamType)}
        style={smallButton}
      >
        {PARAM_TYPES.filter((t) => t !== 'enum').map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {targets && targets.length > 1 ?
        <select
          data-testid="param-add-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          style={smallButton}
          title="Where the new param is written"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      : null}
      <button
        type="button"
        data-testid="param-add"
        disabled={trimmed === ''}
        style={smallButton}
        onClick={() => {
          onAdd(trimmed, type, target)
          setKey('')
        }}
      >
        Add
      </button>
    </div>
  )
}

/**
 * Typed params form from a schema: used by the pipe drawer, the stage settings drawer and the entity
 * transformer list. Pure presentation: callers decide where a changed key is written.
 */
export default function ParamForm({
  defs,
  values,
  inheritedValues,
  jsonValues,
  sources,
  addTargets,
  onAddAt,
  onChange,
  onReplace,
  layout = 'strip',
  allowAdd = false,
  errors,
  jsonHint,
  jsonOpenByDefault = false,
  jsonTestIdPrefix = 'pipe-params-json',
  testId = 'param-form',
}: ParamFormProps) {
  const [showJson, setShowJson] = useState(jsonOpenByDefault)
  const groups = useMemo(() => groupDefs(defs), [defs])

  const field = (def: ParamDef) => (
    <ParamField
      key={def.key}
      def={def}
      layout={layout}
      value={getParamValue(values, def.key)}
      inherited={inheritedValues ? getParamValue(inheritedValues, def.key) : undefined}
      source={sources?.[def.key.split('.')[0]!]}
      onChange={onChange ? (v) => onChange(def.key, v) : undefined}
      onReset={onChange ? () => onChange(def.key, undefined) : undefined}
    />
  )

  const flowStyle: CSSProperties =
    layout === 'form' ?
      { display: 'flex', flexDirection: 'column', gap: 6 }
    : { display: 'flex', flexWrap: 'wrap', gap: 8 }

  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 11,
        ...(layout === 'strip' ?
          { padding: '6px 8px', borderTop: `1px solid ${theme.pipeNav.accentMuted}` }
        : null),
      }}
    >
      {errors && errors.length > 0 ? (
        <div data-testid="param-schema-errors" style={{ color: theme.text.muted }}>
          {errors.map((e) => (
            <div key={e}>⚠ {e}</div>
          ))}
        </div>
      ) : null}
      {defs.length === 0 ? (
        <div style={{ color: theme.text.muted }}>
          No parameters set{allowAdd ? ' yet. Add one below, or declare them with @params in the stage code.' : '.'}
        </div>
      ) : null}
      {groups.map((g) => {
        const body = <div style={flowStyle}>{g.items.map(field)}</div>
        if (g.name === null && !g.advanced) return <div key="main">{body}</div>
        const title = g.advanced ? `${g.name ?? 'Advanced'}${g.name ? ' (advanced)' : ''}` : g.name
        return (
          <details key={`${g.name}|${g.advanced}`} open={!g.advanced} style={{ color: theme.text.secondary }}>
            <summary style={{ cursor: 'pointer', marginBottom: 4 }}>{title}</summary>
            {body}
          </details>
        )
      })}
      {allowAdd && onChange ?
        <AddParamRow
          targets={addTargets}
          onAdd={(key, type, targetId) =>
            onAddAt && targetId ? onAddAt(targetId, key, DEFAULT_BY_TYPE[type]) : onChange(key, DEFAULT_BY_TYPE[type])
          }
        />
      : null}
      {onReplace ?
        <div>
          <button
            type="button"
            data-testid="param-json-toggle"
            style={smallButton}
            onClick={() => setShowJson((v) => !v)}
          >
            {showJson ? 'Hide JSON' : 'JSON'}
          </button>
          {showJson ?
            <div style={{ marginTop: 6 }}>
              <ParamsJsonEditor
                value={jsonValues ?? values}
                onApply={onReplace}
                hint={jsonHint}
                textareaTestId={jsonTestIdPrefix}
                applyTestId={`${jsonTestIdPrefix}-apply`}
              />
            </div>
          : null}
        </div>
      : null}
    </div>
  )
}
