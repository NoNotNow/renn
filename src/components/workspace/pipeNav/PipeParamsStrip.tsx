import type { PipeParamDef, TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import { theme } from '@/config/theme'
import { resolveLocalScopeParams } from '@/utils/paramScopes'
import DraggableNumberField from '@/components/DraggableNumberField'

export interface PipeParamsStripProps {
  pipe: TransformerPipe
  binding?: TransformerPipeBinding
  scopePath?: PipeNavPathSegment[]
  onParamChange?: (key: string, value: unknown) => void
  readOnly?: boolean
}

export default function PipeParamsStrip({
  pipe,
  binding,
  scopePath,
  onParamChange,
  readOnly = false,
}: PipeParamsStripProps) {
  const defs = pipe.paramDefs ?? []
  if (defs.length === 0) return null

  const resolved = resolveLocalScopeParams(binding ?? { pipeId: pipe.id }, scopePath)

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        padding: '6px 8px',
        borderTop: `1px solid ${theme.pipeNav.accentMuted}`,
        fontSize: 11,
      }}
    >
      {defs.map((def) => (
        <PipeParamField
          key={def.key}
          def={def}
          value={resolved[def.key]}
          schemaDefault={def.default}
          onChange={readOnly ? undefined : (v) => onParamChange?.(def.key, v)}
        />
      ))}
    </div>
  )
}

function PipeParamField({
  def,
  value,
  schemaDefault,
  onChange,
}: {
  def: PipeParamDef
  value: unknown
  schemaDefault: unknown
  onChange?: (v: unknown) => void
}) {
  const label = def.label ?? def.key
  const displayValue = value ?? schemaDefault
  const overridden = value !== undefined && value !== schemaDefault

  if (def.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: theme.text.secondary }}>
        <input
          type="checkbox"
          checked={Boolean(displayValue)}
          disabled={!onChange}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        {label}
        {overridden ? <span style={{ color: theme.pipeNav.accent }}>•</span> : null}
      </label>
    )
  }

  if (def.type === 'number') {
    const numeric =
      typeof displayValue === 'number' && Number.isFinite(displayValue)
        ? displayValue
        : typeof schemaDefault === 'number' && Number.isFinite(schemaDefault)
          ? schemaDefault
          : 0
    const step = Math.abs(numeric) >= 10 ? 1 : 0.1
    const sensitivity = Math.abs(numeric) >= 10 ? 0.5 : 0.05
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: theme.text.secondary }}>
        <span>{label}</span>
        <DraggableNumberField
          label={label}
          value={numeric}
          onChange={(v) => onChange?.(v)}
          step={step}
          sensitivity={sensitivity}
          disabled={!onChange}
          style={{
            width: 64,
            padding: '2px 6px',
            borderRadius: 4,
            border: `1px solid ${theme.pipeNav.accentMuted}`,
            background: theme.bg.input,
            color: theme.text.primary,
            fontSize: 11,
          }}
        />
        {overridden ? <span style={{ color: theme.pipeNav.accent }}>•</span> : null}
      </label>
    )
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: theme.text.secondary }}>
      <span>{label}</span>
      <input
        type="text"
        value={String(displayValue ?? '')}
        disabled={!onChange}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: 100,
          padding: '2px 6px',
          borderRadius: 4,
          border: `1px solid ${theme.pipeNav.accentMuted}`,
          background: theme.bg.input,
          color: theme.text.primary,
          fontSize: 11,
        }}
      />
      {overridden ? <span style={{ color: theme.pipeNav.accent }}>•</span> : null}
    </label>
  )
}
