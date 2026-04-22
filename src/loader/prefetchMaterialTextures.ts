import * as THREE from 'three'
import type { RennWorld } from '@/types/world'
import type { DisposableAssetResolver } from './assetResolverImpl'

/** Collect all `entity.material.map` asset IDs from a world (deduplicated). */
export function collectMaterialMapAssetIds(world: RennWorld): string[] {
  const ids = new Set<string>()
  for (const entity of world.entities) {
    const map = entity.material?.map
    if (map) ids.add(map)
  }
  return Array.from(ids)
}

export interface PrefetchDisposer {
  cancel(): void
}

/**
 * During idle time, decode each asset blob via `createImageBitmap` (off-main-thread in Chrome/Firefox)
 * and populate the resolver's texture cache. Textures cached here are returned immediately by
 * `loadTexture` on the next world rebuild, bypassing the decode step entirely.
 *
 * Returns a disposer — call `cancel()` in the effect cleanup to stop pending work.
 */
export function scheduleMaterialTextureDecodePrefetch(
  resolver: Pick<DisposableAssetResolver, 'cacheTexture'>,
  assetIds: string[],
  getBlob: (id: string) => Blob | undefined,
): PrefetchDisposer {
  if (typeof createImageBitmap !== 'function' || assetIds.length === 0) {
    return { cancel: () => {} }
  }

  let cancelled = false
  const idleHandles: number[] = []
  let idx = 0

  const scheduleNext = (): void => {
    if (cancelled || idx >= assetIds.length) return

    const processOne = async (): Promise<void> => {
      if (cancelled) return
      const assetId = assetIds[idx++]
      if (!assetId) {
        scheduleNext()
        return
      }

      const blob = getBlob(assetId)
      if (!blob) {
        scheduleNext()
        return
      }

      try {
        const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' })
        if (cancelled) {
          bitmap.close()
          return
        }
        const texture = new THREE.Texture(bitmap)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        resolver.cacheTexture(assetId, texture, blob)
      } catch {
        // Ignore decode errors; loadTexture will retry on demand.
      }
      scheduleNext()
    }

    if ('requestIdleCallback' in globalThis) {
      const handle = (globalThis as typeof globalThis & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
        () => { void processOne() },
        { timeout: 2000 },
      )
      idleHandles.push(handle)
    } else {
      setTimeout(() => { void processOne() }, 120)
    }
  }

  scheduleNext()

  return {
    cancel(): void {
      cancelled = true
      if ('cancelIdleCallback' in globalThis) {
        const cancelIdle = (globalThis as typeof globalThis & { cancelIdleCallback: (h: number) => void }).cancelIdleCallback
        for (const h of idleHandles) {
          cancelIdle(h)
        }
      }
    },
  }
}

/**
 * Traverse a loaded Three.js scene and upload all material textures to the GPU synchronously,
 * before the rAF loop starts. Prevents `Image Paint blob:` stalls mid-frame on the first render.
 *
 * Call once after `loadWorld()` resolves and before `requestAnimationFrame(animate)`.
 * VideoTextures are skipped (live streaming; not pre-uploadable).
 */
export function warmUpRendererTextures(renderer: THREE.WebGLRenderer, scene: THREE.Object3D): void {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (!(mat instanceof THREE.Material)) continue
      for (const key of Object.keys(mat)) {
        const val = (mat as unknown as Record<string, unknown>)[key]
        if (val instanceof THREE.Texture && !(val instanceof THREE.VideoTexture)) {
          try {
            renderer.initTexture(val)
          } catch {
            // Non-critical; skip textures that aren't ready for initTexture.
          }
        }
      }
    }
  })
}
