import { useMemo } from 'react'
import type { TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import ValidatedJsonTextarea from '@/components/ValidatedJsonTextarea'
import { theme } from '@/config/theme'
import { resolveEditableScopeParams } from '@/utils/pipeStageResolve'

export interface PipeParamsJsonEditorProps {
  pipe: TransformerPipe
  binding?: TransformerPipeBinding
  scopePath?: PipeNavPathSegment[]
  onParamsReplace?: (params: Record<string, unknown>) => void
}

function validateParamsObject(parsed: unknown): { ok: true } | { ok: false; error: string } {
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ok: true }
  }
  return { ok: false, error: 'Params must be a JSON object' }
}

export default function PipeParamsJsonEditor({
  pipe,
  binding,
  scopePath,
  onParamsReplace,
}: PipeParamsJsonEditorProps) {
  const jsonValue = useMemo(
    () => JSON.stringify(resolveEditableScopeParams(binding, pipe, scopePath), null, 2),
    [pipe, binding, scopePath],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 11, color: theme.text.muted, lineHeight: 1.4 }}>
        Pipe params (JSON) for this entity. Define paramDefs on the pipe for typed fields.
      </p>
      <ValidatedJsonTextarea
        value={jsonValue}
        onApply={(parsed) => onParamsReplace?.(parsed as Record<string, unknown>)}
        validate={validateParamsObject}
        disabled={!onParamsReplace}
        applyVariant="text"
        applyLabel="Apply"
        pinApplyRow
        textareaTestId="pipe-params-json"
        applyTestId="pipe-params-json-apply"
      />
    </div>
  )
}
