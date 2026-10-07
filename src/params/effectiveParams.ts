import { mergeParamScopeLayers, type ParamLayer } from '@/utils/paramScopes'

/** One key of a stage's effective params: the winning value and which layer set it. */
export interface EffectiveParam {
  value: unknown
  /** The layer whose value wins (highest layer that sets the key). */
  source: ParamLayer
  /** Every layer that sets the key, lowest first (the last entry is `source`). */
  chain: { layer: ParamLayer; value: unknown }[]
  /** True when a layer above the stage's own params wins (the stage value, if any, has no effect here). */
  overridden: boolean
}

export type EffectiveParams = Record<string, EffectiveParam>

/**
 * Per top-level key: the effective value plus the layer that set it. `layers` is the runtime's own layer list
 * (`EntityStageRuntime.paramLayersAt` / `paramLayersForMember`, lowest first); the values are exactly
 * `mergeParamScopeLayers` of it, which is what the runtime hands the stage.
 * `presetParams` (optional) is slid in as the lowest layer for callers that know the preset values.
 */
export function resolveEffectiveParams(layers: ParamLayer[], presetParams?: Record<string, unknown>): EffectiveParams {
  const all: ParamLayer[] =
    presetParams && Object.keys(presetParams).length > 0 ?
      [{ kind: 'preset', label: 'preset', scopeKey: '', path: [], params: presetParams }, ...layers]
    : layers
  const merged = mergeParamScopeLayers(all.map((l) => l.params))
  const out: EffectiveParams = {}
  for (const key of Object.keys(merged)) {
    const chain = all
      .filter((l) => l.params[key] !== undefined)
      .map((layer) => ({ layer, value: layer.params[key] }))
    const top = chain[chain.length - 1]!
    out[key] = {
      value: merged[key],
      source: top.layer,
      chain,
      overridden: top.layer.kind !== 'stage' && top.layer.kind !== 'preset',
    }
  }
  return out
}

/** Effective values only (same object the runtime merge produces). */
export function effectiveValues(effective: EffectiveParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, e] of Object.entries(effective)) out[k] = e.value
  return out
}

/** Compact badge text: "binding", the nested pipe's name, or "this stage" (the full chain is in the tooltip). */
export function layerBadgeName(layer: ParamLayer): string {
  return layer.kind === 'binding' ? 'binding' : layer.kind === 'member' ? 'this stage' : layer.kind === 'scope' ? layer.label : layer.kind
}

/** Origin text for tooltips: "AV autopilot (binding)", "Route planner (this stage)", "stage", "preset". */
export function layerDisplayName(layer: ParamLayer): string {
  switch (layer.kind) {
    case 'binding':
      return `${layer.label} (binding)`
    case 'scope':
      return layer.label
    case 'member':
      return `${layer.label} (this stage)`
    case 'preset':
      return 'preset'
    default:
      return 'stage'
  }
}

/** Tooltip: the value at every layer that sets the key, lowest to highest, winner marked. */
export function layerChainTooltip(e: EffectiveParam): string {
  const lines = e.chain.map(
    (c, i) => `${i === e.chain.length - 1 ? '> ' : '  '}${layerDisplayName(c.layer)}: ${JSON.stringify(c.value)}`,
  )
  return `Effective for this entity (highest layer wins):\n${lines.join('\n')}`
}
