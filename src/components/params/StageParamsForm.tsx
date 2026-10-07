import { useMemo } from 'react'
import type { TransformerConfig } from '@/types/transformer'
import type { ParamLayer } from '@/utils/paramScopes'
import { resolveStageParamSchema } from '@/params/resolveParamSchema'
import { setParamValue } from '@/params/paramValue'
import {
  effectiveValues,
  layerChainTooltip,
  layerBadgeName,
  resolveEffectiveParams,
} from '@/params/effectiveParams'
import ParamForm from './ParamForm'
import type { ParamFieldSource } from './ParamField'

/**
 * The pipe layers above a stage for one entity. When given, the form shows the value that is effective at runtime
 * (not just `stage.params`) and writes an edit to the layer that currently supplies the key.
 */
export interface StageParamContext {
  /** Runtime layers, lowest first (`EntityStageRuntime.paramLayersForMember`); the `stage` layer is replaced by the live stage. */
  layers: ParamLayer[]
  /** Write the complete next `params` of one pipe layer (binding / nested scope / stage member). */
  onLayerParamsChange: (layer: ParamLayer, params: Record<string, unknown>) => void
}

export interface StageParamsFormProps {
  stage: TransformerConfig
  /** Receives the complete next `params` object of the stage. Omit for read-only. */
  onParamsChange?: (params: Record<string, unknown>) => void
  layout?: 'strip' | 'form'
  /** Test id suffix to keep several forms on one screen apart. */
  testIdSuffix?: string
  /** Pipe layers above this stage for the current entity (omit for the plain stage-defaults view). */
  paramContext?: StageParamContext
}

const STAGE_TARGET = 'stage'
const MEMBER_TARGET = 'member'

/** Stage adapter for the shared `ParamForm`: schema from the preset registry / `@params` block / inference. */
export default function StageParamsForm({
  stage,
  onParamsChange,
  layout = 'form',
  testIdSuffix = '',
  paramContext,
}: StageParamsFormProps) {
  const stageValues = stage.params ?? {}
  const pipeLayers = useMemo(
    () => (paramContext?.layers ?? []).filter((l) => l.kind !== 'stage'),
    [paramContext?.layers],
  )
  const effective = useMemo(
    () =>
      paramContext ?
        resolveEffectiveParams([
          { kind: 'stage', label: stage.name ?? 'stage', scopeKey: '', path: [], params: stage.params ?? {} },
          ...pipeLayers,
        ])
      : undefined,
    [paramContext, pipeLayers, stage.name, stage.params],
  )
  const values = useMemo(() => (effective ? effectiveValues(effective) : (stage.params ?? {})), [effective, stage.params])
  const schema = useMemo(
    () => resolveStageParamSchema(effective ? { ...stage, params: values } : stage),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schema depends on type, code and the param keys only
    [stage.type, stage.code, JSON.stringify(values)],
  )
  const sources = useMemo(() => {
    if (!effective) return undefined
    const out: Record<string, ParamFieldSource> = {}
    for (const [key, e] of Object.entries(effective)) {
      if (!e.overridden) continue
      const stageValue = (stage.params ?? {})[key]
      out[key] = {
        label: layerBadgeName(e.source),
        overridden: true,
        title:
          layerChainTooltip(e) +
          (stageValue !== undefined ? '\nThe stage value has no effect on this entity.' : '') +
          '\nEditing writes to the winning layer; reset removes its override.',
      }
    }
    return out
  }, [effective, stage.params])

  const memberLayer = pipeLayers.find((l) => l.kind === 'member')
  const writeStage = (key: string, value: unknown) => onParamsChange?.(setParamValue(stageValues, key, value))
  const writeLayer = (layer: ParamLayer, key: string, value: unknown) =>
    paramContext?.onLayerParamsChange(layer, setParamValue(layer.params, key, value))

  return (
    <ParamForm
      defs={schema.defs}
      values={values}
      jsonValues={stageValues}
      sources={sources}
      layout={layout}
      allowAdd
      addTargets={
        memberLayer && onParamsChange ?
          [
            { id: STAGE_TARGET, label: 'On the stage' },
            { id: MEMBER_TARGET, label: 'This stage, this entity' },
          ]
        : undefined
      }
      onAddAt={(target, key, value) =>
        target === MEMBER_TARGET && memberLayer ? writeLayer(memberLayer, key, value) : writeStage(key, value)
      }
      errors={schema.errors}
      testId={`stage-params-form${testIdSuffix}`}
      jsonTestIdPrefix={`stage-params-json${testIdSuffix}`}
      jsonHint='"params" only; merged into this stage.'
      onChange={
        onParamsChange ?
          (key, value) => {
            const eff = effective?.[key.split('.')[0]!]
            if (eff?.overridden) writeLayer(eff.source, key, value)
            else writeStage(key, value)
          }
        : undefined
      }
      onReplace={onParamsChange}
    />
  )
}
