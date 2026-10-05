import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { ParamDef } from '@/types/paramSchema'
import { effectiveCustomTransformerCode } from '@/transformers/customCodeTransformer'
import { isPresetTransformerType } from '@/transformers/transformerPresets'
import { mergeDeclaredAndInferred } from './inferParamDefs'
import { parseParamsDecl } from './parseParamsDecl'
import { presetParamDefs } from './presetParamSchemas'

export interface ResolvedParamSchema {
  defs: ParamDef[]
  source: 'preset' | 'declared' | 'inferred'
  /** Problems parsing a stage's `@params` block (shown as a small warning). */
  errors: string[]
}

/**
 * Schema for one stage: preset registry, else the stage's `@params` block, always topped up with defs inferred
 * from the stage's current param values, so every key gets a usable field.
 */
export function resolveStageParamSchema(stage: TransformerConfig): ResolvedParamSchema {
  const values = stage.params ?? {}
  if (isPresetTransformerType(stage.type) && stage.type !== 'custom') {
    return { defs: mergeDeclaredAndInferred(presetParamDefs(stage.type), values), source: 'preset', errors: [] }
  }
  const { defs, errors } = parseParamsDecl(stage.code ?? effectiveCustomTransformerCode(stage))
  return {
    defs: mergeDeclaredAndInferred(defs, values),
    source: defs.length > 0 ? 'declared' : 'inferred',
    errors,
  }
}

/** Schema for a pipe binding at one scope: `pipe.paramDefs` plus defs inferred from the keys actually set. */
export function resolvePipeParamSchema(
  pipe: Pick<TransformerPipe, 'paramDefs'>,
  values: Record<string, unknown>,
): ResolvedParamSchema {
  const declared = pipe.paramDefs ?? []
  return {
    defs: mergeDeclaredAndInferred(declared, values),
    source: declared.length > 0 ? 'declared' : 'inferred',
    errors: [],
  }
}
