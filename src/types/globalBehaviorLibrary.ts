import type { ScriptDef } from '@/types/world'
import type { TransformerDef, TransformerPipe } from '@/types/transformer'

/** Cross-project behavior templates stored in IndexedDB (not part of world JSON). */
export type GlobalBehaviorLibrary = {
  transformers: Record<string, TransformerDef>
  scripts: Record<string, ScriptDef>
  transformerPipes?: Record<string, TransformerPipe>
}

export const EMPTY_GLOBAL_BEHAVIOR_LIBRARY: GlobalBehaviorLibrary = {
  transformers: {},
  scripts: {},
  transformerPipes: {},
}
