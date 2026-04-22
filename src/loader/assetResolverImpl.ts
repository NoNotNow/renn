import * as THREE from 'three'
import type { GLTF } from './assetResolver'

export interface AssetResolverOptions {
  /** When true, {@link loadVideoTexture} is used for material maps instead of {@link loadTexture}. */
  isVideoAsset?: (assetId: string) => boolean
  /** `VideoTexture.anisotropy` (1–16). Default 16. */
  videoTextureMaxAnisotropy?: number
}

/**
 * Asset resolver that creates blob URLs for assets.
 * IMPORTANT: Call dispose() when done to revoke blob URLs and prevent memory leaks.
 */
export interface DisposableAssetResolver {
  resolve: (assetId: string) => string | null
  loadTexture: (assetId: string, loader: THREE.TextureLoader) => Promise<THREE.Texture | null>
  loadVideoTexture: (assetId: string) => Promise<THREE.VideoTexture | null>
  isVideoAsset: (assetId: string) => boolean
  loadModel: (assetId: string, loader: any) => Promise<GLTF | null>
  /**
   * Pre-populate the texture cache for `assetId` with `texture` decoded from `blob`.
   * `loadTexture` will return the cached texture when called for the same blob identity,
   * bypassing the decode step. Used by the idle prefetch pass.
   */
  cacheTexture: (assetId: string, texture: THREE.Texture, blob: Blob) => void
  dispose: () => void
}

/**
 * Resolver that reads the current assets map on each resolve (e.g. SceneView `assets` prop updates).
 */
export function createAssetResolverFromGetter(
  getAssets: () => Map<string, Blob>,
  options?: AssetResolverOptions,
): DisposableAssetResolver {
  const isVideoAsset = options?.isVideoAsset ?? (() => false)
  const vAniso = options?.videoTextureMaxAnisotropy
  const videoAnisotropy =
    vAniso !== undefined && Number.isFinite(vAniso)
      ? Math.min(16, Math.max(1, Math.floor(vAniso)))
      : 16
  const urlCache = new Map<string, string>()
  /** Same id may receive a new Blob instance (e.g. texture paint overwrite); revoke stale URLs. */
  const blobRefById = new Map<string, Blob>()
  /**
   * Decoded-texture cache keyed by asset id. Entry is valid only when `blobRefById.get(id) === currentBlob`.
   * Populated by `loadTexture` (via createImageBitmap) and by the external idle-prefetch pass.
   * NOT used for VideoTextures (live `THREE.VideoTexture`).
   */
  const textureCache = new Map<string, THREE.Texture>()

  const resolve = (assetId: string): string | null => {
    const assets = getAssets()
    const blob = assets.get(assetId)
    if (!blob) {
      const staleUrl = urlCache.get(assetId)
      if (staleUrl) {
        try {
          URL.revokeObjectURL(staleUrl)
        } catch {
          /* ignore */
        }
        urlCache.delete(assetId)
      }
      blobRefById.delete(assetId)
      // Texture for this id is now stale; remove from cache so next load re-decodes.
      textureCache.delete(assetId)
      return null
    }

    const prevBlob = blobRefById.get(assetId)
    if (prevBlob !== undefined && prevBlob !== blob) {
      const staleUrl = urlCache.get(assetId)
      if (staleUrl) {
        try {
          URL.revokeObjectURL(staleUrl)
        } catch {
          /* ignore */
        }
        urlCache.delete(assetId)
      }
      // Blob changed — cached texture is stale (e.g. texture paint overwrite).
      textureCache.delete(assetId)
    }
    blobRefById.set(assetId, blob)

    let url = urlCache.get(assetId)
    if (!url) {
      try {
        url = URL.createObjectURL(blob)
        urlCache.set(assetId, url)
      } catch (error) {
        console.error(`Failed to create object URL for asset ${assetId}:`, error)
        return null
      }
    }
    return url
  }

  const loadTexture = async (assetId: string, loader: THREE.TextureLoader): Promise<THREE.Texture | null> => {
    const blob = getAssets().get(assetId)
    if (!blob) {
      console.warn(`[AssetResolver] Texture asset not in map: ${assetId}`)
      return null
    }

    // Return cached texture when the backing blob is unchanged (covers prefetch-populated entries
    // and subsequent world rebuilds with the same assets).
    const cachedBlob = blobRefById.get(assetId)
    const cached = textureCache.get(assetId)
    if (cached && cachedBlob === blob) {
      return cached
    }

    const blobInfo = { size: blob.size, type: blob.type || '(empty)' }
    try {
      let texture: THREE.Texture
      if (typeof createImageBitmap === 'function') {
        // Off-main-thread decode (Chrome: truly parallel; Firefox: faster than <img>).
        // `colorSpaceConversion: 'none'` preserves raw pixel data; we set SRGBColorSpace on the texture.
        const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' })
        texture = new THREE.Texture(bitmap)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
      } else {
        // Fallback for environments without createImageBitmap (old browsers, jsdom tests).
        const url = resolve(assetId)
        if (!url) return null
        texture = await new Promise<THREE.Texture>((resolveTex, reject) => {
          loader.load(url, (t) => resolveTex(t), undefined, (error) => reject(error))
        })
      }
      // Update blob ref and cache for subsequent loads / world rebuilds.
      blobRefById.set(assetId, blob)
      textureCache.set(assetId, texture)
      return texture
    } catch (error) {
      console.error(`Failed to load texture for asset ${assetId} (blob ${blobInfo.size} bytes, type ${blobInfo.type}):`, error)
      return null
    }
  }

  const cacheTexture = (assetId: string, texture: THREE.Texture, blob: Blob): void => {
    textureCache.set(assetId, texture)
    blobRefById.set(assetId, blob)
  }

  const loadVideoTexture = async (assetId: string): Promise<THREE.VideoTexture | null> => {
    const blob = getAssets().get(assetId)
    if (!blob) {
      console.warn(`[AssetResolver] Video asset not in map: ${assetId}`)
      return null
    }
    const url = resolve(assetId)
    if (!url) return null
    try {
      const video = document.createElement('video')
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.crossOrigin = 'anonymous'
      video.src = url
      await new Promise<void>((res, rej) => {
        const onErr = (): void => {
          cleanup()
          rej(new Error(`video load failed for ${assetId}`))
        }
        const cleanup = (): void => {
          video.removeEventListener('loadeddata', onReady)
          video.removeEventListener('error', onErr)
        }
        const onReady = (): void => {
          cleanup()
          res()
        }
        video.addEventListener('loadeddata', onReady, { once: true })
        video.addEventListener('error', onErr, { once: true })
        video.load()
      })
      await video.play().catch(() => {
        /* autoplay may require mute; already muted */
      })
      const tex = new THREE.VideoTexture(video)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = videoAnisotropy
      return tex
    } catch (error) {
      console.error(`Failed to load video texture for asset ${assetId}:`, error)
      return null
    }
  }

  const loadModel = async (assetId: string, loader: any): Promise<GLTF | null> => {
    const url = resolve(assetId)
    if (!url) return null

    try {
      const gltf = await new Promise<GLTF>((resolveGltf, reject) => {
        loader.load(
          url,
          (gltf: GLTF) => resolveGltf(gltf),
          undefined,
          (error: any) => reject(error)
        )
      })
      return gltf
    } catch (error) {
      console.error(`Failed to load model for asset ${assetId}:`, error)
      return null
    }
  }

  const dispose = (): void => {
    for (const url of urlCache.values()) {
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error('Failed to revoke object URL:', error)
      }
    }
    urlCache.clear()
    blobRefById.clear()
    for (const tex of textureCache.values()) {
      try {
        tex.dispose()
      } catch {
        /* ignore */
      }
    }
    textureCache.clear()
  }

  return { resolve, loadTexture, loadVideoTexture, isVideoAsset, loadModel, cacheTexture, dispose }
}

/**
 * Creates an asset resolver for a fixed map reference (tests, one-off loads).
 * Prefer {@link createAssetResolverFromGetter} when the map is replaced over time.
 */
export function createAssetResolver(
  assets: Map<string, Blob>,
  options?: AssetResolverOptions,
): DisposableAssetResolver {
  return createAssetResolverFromGetter(() => assets, options)
}
