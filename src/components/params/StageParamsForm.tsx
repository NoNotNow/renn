import { useMemo } from 'react'
import type { TransformerConfig } from '@/types/transformer'
import { resolveStageParamSchema } from '@/params/resolveParamSchema'
import { setParamValue } from '@/params/paramValue'
import ParamForm from './ParamForm'

export interface StageParamsFormProps {
  stage: TransformerConfig
  /** Receives the complete next `params` object of the stage. Omit for read-only. */
  onParamsChange?: (params: Record<string, unknown>) => void
  layout?: 'strip' | 'form'
  /** Test id suffix to keep several forms on one screen apart. */
  testIdSuffix?: string
}

/** Stage adapter for the shared `ParamForm`: schema from the preset registry / `@params` block / inference. */
export default function StageParamsForm({ stage, onParamsChange, layout = 'form', testIdSuffix = '' }: StageParamsFormProps) {
  const schema = useMemo(
    () => resolveStageParamSchema(stage),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schema depends on type, code and the param keys only
    [stage.type, stage.code, JSON.stringify(stage.params ?? {})],
  )
  const values = stage.params ?? {}
  return (
    <ParamForm
      defs={schema.defs}
      values={values}
      layout={layout}
      allowAdd
      errors={schema.errors}
      testId={`stage-params-form${testIdSuffix}`}
      jsonTestIdPrefix={`stage-params-json${testIdSuffix}`}
      jsonHint='"params" only; merged into this stage.'
      onChange={onParamsChange ? (key, value) => onParamsChange(setParamValue(values, key, value)) : undefined}
      onReplace={onParamsChange}
    />
  )
}
