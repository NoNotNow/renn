import { useMemo } from 'react'
import type { TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import { resolveInheritedScopeParams, resolveLocalScopeParams } from '@/utils/paramScopes'
import { resolvePipeParamSchema } from '@/params/resolveParamSchema'
import ParamForm from '@/components/params/ParamForm'

export interface PipeParamsStripProps {
  pipe: TransformerPipe
  binding?: TransformerPipeBinding
  scopePath?: PipeNavPathSegment[]
  onParamChange?: (key: string, value: unknown) => void
  /** Adds the JSON toggle (replace the whole scope params). */
  onParamsReplace?: (params: Record<string, unknown>) => void
  readOnly?: boolean
  layout?: 'strip' | 'form'
  /** Open the JSON editor first (used when the pipe declares no params). */
  jsonOpenByDefault?: boolean
  allowAdd?: boolean
}

/** Pipe-scope adapter for the shared `ParamForm`: schema = `pipe.paramDefs` + keys set on the binding. */
export default function PipeParamsStrip({
  pipe,
  binding,
  scopePath,
  onParamChange,
  onParamsReplace,
  readOnly = false,
  layout = 'strip',
  jsonOpenByDefault,
  allowAdd = false,
}: PipeParamsStripProps) {
  const values = useMemo(
    () => resolveLocalScopeParams(binding ?? { pipeId: pipe.id }, scopePath),
    [binding, pipe.id, scopePath],
  )
  const inherited = useMemo(() => resolveInheritedScopeParams(binding, scopePath), [binding, scopePath])
  const { defs } = useMemo(() => resolvePipeParamSchema(pipe, values), [pipe, values])
  if (defs.length === 0 && !allowAdd && !onParamsReplace) return null

  return (
    <ParamForm
      defs={defs}
      values={values}
      inheritedValues={inherited}
      layout={layout}
      allowAdd={allowAdd}
      jsonOpenByDefault={jsonOpenByDefault}
      jsonHint="Pipe params (JSON) for this entity."
      testId="pipe-params-form"
      onChange={readOnly ? undefined : onParamChange}
      onReplace={readOnly ? undefined : onParamsReplace}
    />
  )
}
