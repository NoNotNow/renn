import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { PersistenceAPI } from '@/persistence/types'

export interface UsePersistedAssetsResult {
  assets: Map<string, Blob>
  setAssets: Dispatch<SetStateAction<Map<string, Blob>>>
  updateAssets: (updater: (prev: Map<string, Blob>) => Map<string, Blob>) => Promise<void>
}

/**
 * Global asset blob map with fire-and-forget IndexedDB persistence when blobs change.
 */
export function usePersistedAssets(
  persistence: Pick<PersistenceAPI, 'saveAsset'>,
  markDirty: () => void,
): UsePersistedAssetsResult {
  const [assets, setAssets] = useState<Map<string, Blob>>(new Map())

  const updateAssets = useCallback(
    async (updater: (prev: Map<string, Blob>) => Map<string, Blob>) => {
      setAssets((prev) => {
        const next = updater(prev)
        for (const [assetId, blob] of next) {
          const prevBlob = prev.get(assetId)
          if (prevBlob === undefined || prevBlob !== blob) {
            persistence.saveAsset(assetId, blob).catch((err) => {
              console.error(`Failed to save asset ${assetId}:`, err)
            })
          }
        }
        return next
      })
      markDirty()
    },
    [persistence, markDirty],
  )

  return { assets, setAssets, updateAssets }
}
