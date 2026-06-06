import type { PipeParamDef, TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import { theme } from '@/config/theme'
import { resolvePipeBindingParams } from '@/utils/transformerPipeResolve'

export interface PipeParamsStripProps {
  pipe: TransformerPipe
  binding?: TransformerPipeBinding
  onParamChange?: (key: string, value: unknown) => void
  readOnly?: boolean
}

export default function PipeParamsStrip({
  pipe,
  binding,
  onParamChange,
  readOnly = false,
}: PipeParamsStripProps) {
  const defs = pipe.paramDefs ?? []
  if (defs.length === 0) return null

  const resolved = resolvePipeBindingParams(binding ?? { pipeId: pipe.id }, pipe)

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
          defaultValue={pipe.defaultParams?.[def.key]}
          onChange={readOnly ? undefined : (v) => onParamChange?.(def.key, v)}
        />
      ))}
    </div>
  )
}

function PipeParamField({
  def,
  value,
  defaultValue,
  onChange,
}: {
  def: PipeParamDef
  value: unknown
  defaultValue: unknown
  onChange?: (v: unknown) => void
}) {
  const label = def.label ?? def.key
  const overridden = value !== undefined && value !== defaultValue

  if (def.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: theme.text.secondary }}>
        <input
          type="checkbox"
          checked={Boolean(value ?? defaultValue)}
          disabled={!onChange}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        {label}
        {overridden ? <span style={{ color: theme.pipeNav.accent }}>•</span> : null}
      </label>
    )
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: theme.text.secondary }}>
      <span>{label}</span>
      <input
        type={def.type === 'number' ? 'number' : 'text'}
        value={String(value ?? defaultValue ?? '')}
        disabled={!onChange}
        onChange={(e) => {
          const raw = e.target.value
          onChange?.(def.type === 'number' ? Number(raw) : raw)
        }}
        style={{
          width: def.type === 'number' ? 56 : 100,
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
