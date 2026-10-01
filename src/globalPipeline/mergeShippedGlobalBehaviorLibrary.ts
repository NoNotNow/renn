import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import {
  isShippedGlobalPipeId,
  isShippedGlobalTransformerId,
  type ShippedGlobalBehaviorLibraryBundle,
} from '@/globalPipeline/shippedGlobalBehaviorLibraryTypes'

const SHIPPED_CHECKSUM_META_KEY = '__shippedGlobalChecksum'

export type GlobalBehaviorLibraryWithMeta = GlobalBehaviorLibrary & {
  [SHIPPED_CHECKSUM_META_KEY]?: string
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Merge repo-shipped globals into IndexedDB library (refresh when checksum changes). */
export function mergeShippedGlobalBehaviorLibrary(
  stored: GlobalBehaviorLibrary,
  shipped: ShippedGlobalBehaviorLibraryBundle | null | undefined,
): GlobalBehaviorLibraryWithMeta {
  if (!shipped?.library) {
    return stored as GlobalBehaviorLibraryWithMeta
  }

  const meta = stored as GlobalBehaviorLibraryWithMeta
  if (meta[SHIPPED_CHECKSUM_META_KEY] === shipped.checksum) {
    return meta
  }

  const transformers = { ...stored.transformers }
  for (const [id, def] of Object.entries(shipped.library.transformers ?? {})) {
    if (!isShippedGlobalTransformerId(id)) continue
    transformers[id] = deepClone(def)
  }

  const transformerPipes = { ...(stored.transformerPipes ?? {}) }
  for (const [id, def] of Object.entries(shipped.library.transformerPipes ?? {})) {
    if (!isShippedGlobalPipeId(id)) continue
    transformerPipes[id] = deepClone(def)
  }

  return {
    ...stored,
    transformers,
    transformerPipes,
    [SHIPPED_CHECKSUM_META_KEY]: shipped.checksum,
  }
}

export function shippedGlobalBehaviorLibraryChanged(
  before: GlobalBehaviorLibrary,
  after: GlobalBehaviorLibrary,
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after)
}
