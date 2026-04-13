import type { Entity } from '@/types/world'

/** Unique `material.map` asset ids referenced by entities (world JSON). */
export function collectMaterialMapAssetIds(entities: readonly Entity[]): string[] {
  const seen = new Set<string>()
  for (const e of entities) {
    const mapId = e.material?.map
    if (mapId) seen.add(mapId)
  }
  return [...seen]
}

/**
 * Decode material map blobs during idle time so large image decodes are less likely to block rAF.
 * Uses `createImageBitmap` then `close()` to avoid retaining GPU memory; Three.js may still decode
 * again on first `TextureLoader` use, but work is less likely to coincide with animation frames.
 */
export function scheduleMaterialTextureDecodePrefetch(
  assetIds: readonly string[],
  getAssets: () => Map<string, Blob>,
  isCancelled: () => boolean,
): void {
  if (assetIds.length === 0) return

  let index = 0

  const runNext = (): void => {
    if (isCancelled() || index >= assetIds.length) return

    const idle = (cb: IdleRequestCallback): number => {
      if (typeof requestIdleCallback === 'function') {
        return requestIdleCallback(cb)
      }
      return window.setTimeout(() => {
        cb({
          didTimeout: false,
          timeRemaining: () => 8,
        } as IdleDeadline)
      }, 1) as unknown as number
    }

    idle(() => {
      if (isCancelled()) return
      const id = assetIds[index++]
      const blob = getAssets().get(id)
      const done = (): void => {
        runNext()
      }
      if (!blob) {
        done()
        return
      }
      if (blob.type.startsWith('video/')) {
        done()
        return
      }
      void createImageBitmap(blob)
        .then((bmp) => {
          bmp.close()
        })
        .catch(() => {
          /* ignore */
        })
        .finally(done)
    })
  }

  runNext()
}
