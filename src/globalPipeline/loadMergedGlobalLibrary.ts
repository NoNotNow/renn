import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import { defaultPersistence } from '@/persistence/indexedDb'
import { fetchShippedGlobalBehaviorLibrary } from '@/globalPipeline/fetchShippedGlobalBehaviorLibrary'
import {
  mergeShippedGlobalBehaviorLibrary,
  shippedGlobalBehaviorLibraryChanged,
} from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'

/** The user's global library (IndexedDB) with the repo-shipped entries merged in; persists the merge when it changed. */
export async function loadMergedGlobalLibrary(): Promise<GlobalBehaviorLibrary> {
  const [stored, shipped] = await Promise.all([
    defaultPersistence.loadGlobalBehaviorLibrary(),
    fetchShippedGlobalBehaviorLibrary(),
  ])
  const merged = mergeShippedGlobalBehaviorLibrary(stored, shipped)
  if (shipped && shippedGlobalBehaviorLibraryChanged(stored, merged)) {
    await defaultPersistence.saveGlobalBehaviorLibrary(merged)
  }
  return merged
}
