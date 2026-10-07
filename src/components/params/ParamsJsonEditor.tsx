import { useMemo } from 'react'
import ValidatedJsonTextarea from '@/components/ValidatedJsonTextarea'
import { theme } from '@/config/theme'

export interface ParamsJsonEditorProps {
  value: Record<string, unknown>
  /** Replaces the whole params object. Omit for read-only. */
  onApply?: (params: Record<string, unknown>) => void
  hint?: string
  textareaTestId?: string
  applyTestId?: string
  pinApplyRow?: boolean
}

function validateParamsObject(parsed: unknown): { ok: true } | { ok: false; error: string } {
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return { ok: true }
  return { ok: false, error: 'Params must be a JSON object' }
}

/** The one raw-JSON escape hatch for a params object (pipe scope params or stage params). */
export default function ParamsJsonEditor({
  value,
  onApply,
  hint,
  textareaTestId = 'pipe-params-json',
  applyTestId = 'pipe-params-json-apply',
  pinApplyRow = true,
}: ParamsJsonEditorProps) {
  const json = useMemo(() => JSON.stringify(value, null, 2), [value])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hint ? <p style={{ margin: 0, fontSize: 11, color: theme.text.muted, lineHeight: 1.4 }}>{hint}</p> : null}
      <ValidatedJsonTextarea
        value={json}
        onApply={(parsed) => onApply?.(parsed as Record<string, unknown>)}
        validate={validateParamsObject}
        disabled={!onApply}
        applyVariant="text"
        applyLabel="Apply"
        pinApplyRow={pinApplyRow}
        textareaTestId={textareaTestId}
        applyTestId={applyTestId}
      />
    </div>
  )
}
