import type { EpisodeMetrics } from '@/avEvolution/core/fitness'
import type { EvaluateFn } from '@/avEvolution/core/evolution'
import type { Params } from '@/avEvolution/core/genes'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { updateWorldFromGlobalLibrary } from '@/globalPipeline/globalOrigin'
import type { ShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/shippedGlobalBehaviorLibraryTypes'
import type { RennWorld } from '@/types/world'
import { mazeEpisodeByKey, runMazeEpisode, type EpisodeOptions } from './episode'

/**
 * Source world of the evolution: the raw example world JSON (the one holding the AV car) upgraded to the shipped global
 * library code, exactly what the Builder does on open. Both inputs are plain JSON, injected by the caller (node: read
 * from disk; browser / worker: fetched), so this module has no fs / network access.
 */
export function prepareSourceWorld(rawWorld: RennWorld, shippedBundle: ShippedGlobalBehaviorLibraryBundle): RennWorld {
  const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, shippedBundle)
  return updateWorldFromGlobalLibrary(JSON.parse(JSON.stringify(rawWorld)) as RennWorld, library).world
}

/**
 * Serial evaluator for ONE thread / worker: episodes run strictly one after the other (the determinism patch of
 * Math.random / Date.now is global), so it is safe to call concurrently - calls queue up.
 */
export function createEvaluator(sourceWorld: RennWorld, opts: EpisodeOptions = {}): EvaluateFn {
  let chain: Promise<unknown> = Promise.resolve()
  return (params: Params, episodeKeys: string[]) => {
    const run = async (): Promise<EpisodeMetrics[]> => {
      const out: EpisodeMetrics[] = []
      for (const key of episodeKeys) out.push(await runMazeEpisode(sourceWorld, params, mazeEpisodeByKey(key), opts))
      return out
    }
    const p = chain.then(run, run)
    chain = p.catch(() => undefined)
    return p
  }
}
