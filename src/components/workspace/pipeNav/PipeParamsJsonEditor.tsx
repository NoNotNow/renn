import { useMemo } from 'react'
import type { TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import ValidatedJsonTextarea from '@/components/ValidatedJsonTextarea'
import { theme } from '@/config/theme'
import { resolvePipeBindingParams } from '@/utils/transformerPipeResolve'

export interface PipeParamsJsonEditorProps {
  pipe: TransformerPipe
  binding?: TransformerPipeBinding
  sharedDefaults?: boolean
  onParamsReplace?: (params: Record<string, unknown>) => void
}

function paramsJsonValue(
  pipe: TransformerPipe,
  binding: TransformerPipeBinding | undefined,
  sharedDefaults: boolean,
): string {
  const params =
    sharedDefaults || !binding ?
      (pipe.defaultParams ?? {})
    : resolvePipeBindingParams(binding, pipe)
  return JSON.stringify(params, null, 2)
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
  sharedDefaults = false,
  onParamsReplace,
}: PipeParamsJsonEditorProps) {
  const jsonValue = useMemo(
    () => paramsJsonValue(pipe, binding, sharedDefaults),
    [pipe, binding, sharedDefaults],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 11, color: theme.text.muted, lineHeight: 1.4 }}>
        {sharedDefaults ?
          'Shared pipe defaults (JSON). Add keys here; define paramDefs later for typed fields.'
        : 'Pipe configuration (JSON). Merged with shared defaults at runtime.'}
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
