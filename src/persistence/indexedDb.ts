import { openDB, type IDBPDatabase } from 'idb'
import type { AssetRef, RennWorld, ModelPreset } from '@/types/world'
import type { ProjectMeta, LoadedProject, PersistenceAPI } from './types'
import { generateProjectId } from '@/utils/idGenerator'
import { DB_CONFIG } from '@/config/constants'
import { addAssetsToZipFolder } from '@/utils/assetExport'
import { collectReferencedAssetIds } from '@/utils/collectReferencedAssetIds'
import { rehydrateImportedAssetBlob, synthesizeAssetRefForExport } from '@/utils/rehydrateImportedAssetBlob'
import { validateWorldDocument } from '@/schema/validate'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'

const STORE_PROJECTS = DB_CONFIG.stores.projects
const STORE_ASSETS = DB_CONFIG.stores.assets
const STORE_MODEL_PRESETS = DB_CONFIG.stores.modelPresets
const STORE_PLAY_SESSION = DB_CONFIG.stores.playSession
const STORE_GLOBAL_BEHAVIOR = DB_CONFIG.stores.globalBehaviorLibrary

const GLOBAL_BEHAVIOR_ROW_ID = 'global-behavior-library' as const

type GlobalBehaviorLibraryRow = GlobalBehaviorLibrary & {
  id: typeof GLOBAL_BEHAVIOR_ROW_ID
  updatedAt: number
}

function isIndexedDbMissingObjectStoreError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('name' in err)) return false
  return (err as { name?: string }).name === 'NotFoundError'
}

/** Single row in `playSession` store (Builder → Play handoff). */
const PLAY_SESSION_RECORD_ID = 'play-session' as const

type PlaySessionRow = { id: typeof PLAY_SESSION_RECORD_ID; world: RennWorld }

/**
 * Returns the ArrayBuffer for a Blob. Uses blob.arrayBuffer() when available (e.g. browser/Node 18+),
 * otherwise FileReader (e.g. jsdom).
 */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return await blob.arrayBuffer()
  }
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

/** Stored asset record: either new format (arrayBuffer + mimeType) or legacy (blob). */
type StoredAsset = {
  assetId: string
  type?: string
  /** New format: binary data (reliable across Safari/IndexedDB). */
  arrayBuffer?: ArrayBuffer
  /** New format: MIME type for Blob reconstruction. */
  mimeType?: string
  /** Legacy: raw Blob (unreliable after IndexedDB round-trip in some browsers). */
  blob?: Blob
  previewBlob?: Blob | ArrayBuffer | null
  previewType?: string | null
}

/**
 * Reconstructs a Blob from a stored asset record.
 * Prefers arrayBuffer + mimeType (reliable); falls back to legacy blob for migration.
 */
function storedAssetToBlob(asset: StoredAsset): Blob | null {
  if (!asset?.assetId) return null
  if (asset.arrayBuffer != null && asset.mimeType != null) {
    return new Blob([asset.arrayBuffer], { type: asset.mimeType })
  }
  if (asset.blob instanceof Blob) {
    return asset.blob
  }
  return null
}

function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_CONFIG.name, DB_CONFIG.version, {
    upgrade(db, oldVersion, _newVersion, _transaction) {
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
      }
      
      // Migration from v1 (per-project assets) to v2 (global assets)
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_ASSETS)) {
        // For v1->v2 migration, we'll handle it after upgrade completes
        // Delete old store structure
        db.deleteObjectStore(STORE_ASSETS)
      }
      
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        // Create new global assets store
        const assetStore = db.createObjectStore(STORE_ASSETS, { keyPath: 'assetId' })
        assetStore.createIndex('byType', 'type', { unique: false })
      }

      // Global model presets (v3+). Create whenever missing: some DBs reached a version without
      // this store (e.g. upgrade skipped), and IndexedDB does not re-run upgrade until version bumps.
      if (!db.objectStoreNames.contains(STORE_MODEL_PRESETS)) {
        db.createObjectStore(STORE_MODEL_PRESETS, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(STORE_PLAY_SESSION)) {
        db.createObjectStore(STORE_PLAY_SESSION, { keyPath: 'id' })
      }

      // v8: bump forces upgrade for browsers that reached v7 before `globalBehaviorLibrary` existed —
      // without a version bump IndexedDB never re-ran this block for them.
      if (!db.objectStoreNames.contains(STORE_GLOBAL_BEHAVIOR)) {
        db.createObjectStore(STORE_GLOBAL_BEHAVIOR, { keyPath: 'id' })
      }
    },
    blocked() {
      console.warn('IndexedDB upgrade blocked - close other tabs')
    },
  })
}

export function createIndexedDbPersistence(): PersistenceAPI {
  return {
    async listProjects(): Promise<ProjectMeta[]> {
      const db = await getDB()
      const list = await db.getAll(STORE_PROJECTS) as ProjectMeta[]
      await db.close()
      return [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    },

    async loadProject(id: string): Promise<LoadedProject> {
      const db = await getDB()
      const row = await db.get(STORE_PROJECTS, id)
      if (!row) {
        await db.close()
        throw new Error(`Project not found: ${id}`)
      }
      const world = row.world as RennWorld
      // Load all global assets (not filtered by project)
      const assets = new Map<string, Blob>()
      const allAssets = (await db.getAll(STORE_ASSETS)) as StoredAsset[]
      for (const asset of allAssets) {
        const blob = storedAssetToBlob(asset)
        if (blob) assets.set(asset.assetId, blob)
      }
      await db.close()
      return { world, assets }
    },

    async saveProject(
      id: string,
      name: string,
      data: { world: RennWorld; assets: Map<string, Blob> }
    ): Promise<void> {
      let db: IDBPDatabase | null = null
      const worldSize = JSON.stringify(data.world).length
      let totalBlobBytes = 0
      for (const blob of data.assets.values()) {
        totalBlobBytes += blob?.size ?? 0
      }
      if (import.meta.env.DEV) console.log('[Persistence] saveProject start', { id, name, assetsCount: data.assets.size, worldSize, totalBlobBytes })

      try {
        db = await getDB()
        if (import.meta.env.DEV) console.log('[Persistence] DB opened')

        const updatedAt = Date.now()
        // Save project without assets (assets are stored globally)
        await db.put(STORE_PROJECTS, { id, name, world: data.world, updatedAt })
        if (import.meta.env.DEV) console.log('[Persistence] Project row written')

        // Save any new assets to global store (preserve existing previews)
        const existingAssets = await db.getAll(STORE_ASSETS)
        if (import.meta.env.DEV) console.log('[Persistence] Existing assets loaded', { count: existingAssets.length })

        const existingPreviews = new Map<string, { blob: Blob | ArrayBuffer | null; type: string | null }>()
        for (const asset of existingAssets) {
          const a = asset as StoredAsset
          if (a?.assetId) {
            const previewType = typeof a.previewType === 'string' ? a.previewType : null
            const previewBlob = a.previewBlob instanceof Blob || a.previewBlob instanceof ArrayBuffer
              ? a.previewBlob
              : null
            existingPreviews.set(a.assetId, { blob: previewBlob, type: previewType })
          }
        }
        const assetEntries = Array.from(data.assets.entries())
        for (let i = 0; i < assetEntries.length; i++) {
          const [assetId, blob] = assetEntries[i]
          const blobSize = blob?.size ?? 0
          if (import.meta.env.DEV) console.log('[Persistence] Writing asset', { index: i + 1, total: assetEntries.length, assetId, blobSize })
          const assetType = blob.type?.startsWith('image') ? 'texture' : 'model'
          const mimeType = blob.type || 'application/octet-stream'
          const existingPreview = existingPreviews.get(assetId) ?? { blob: null, type: null }
          const arrayBuffer = await blobToArrayBuffer(blob)
          await db.put(STORE_ASSETS, {
            assetId,
            arrayBuffer,
            mimeType,
            type: assetType,
            previewBlob: existingPreview.blob,
            previewType: existingPreview.type,
          })
          if (import.meta.env.DEV) console.log('[Persistence] Asset written', { assetId, blobSize })
        }
        if (import.meta.env.DEV) console.log('[Persistence] All assets written')

        await db.close()
        db = null
        if (import.meta.env.DEV) console.log('[Persistence] saveProject done')
      } catch (err) {
        const e = err as Error & { code?: number }
        console.error('[Persistence] saveProject error', {
          name: e?.name,
          message: e?.message,
          code: e?.code,
          stack: e?.stack,
          toString: err != null ? String(err) : undefined,
        })
        if (db) {
          try {
            db.close()
          } catch {
            // ignore close error
          }
        }
        throw err
      }
    },

    async deleteProject(id: string): Promise<void> {
      const db = await getDB()
      // Delete project only - assets persist globally
      await db.delete(STORE_PROJECTS, id)
      await db.close()
    },

    async exportProject(id: string): Promise<Blob> {
      const JSZip = (await import('jszip')).default
      const { world, assets } = await this.loadProject(id)
      const referenced = collectReferencedAssetIds(world)
      const exportedAssets = new Map<string, Blob>()
      for (const assetId of referenced) {
        const blob = assets.get(assetId)
        if (blob) exportedAssets.set(assetId, blob)
      }
      const worldAssets = world.assets ?? {}
      const prunedWorldAssets: Record<string, AssetRef> = {}
      for (const assetId of referenced) {
        const ref = worldAssets[assetId]
        if (ref) prunedWorldAssets[assetId] = ref
      }
      for (const assetId of exportedAssets.keys()) {
        if (!prunedWorldAssets[assetId]) {
          const b = exportedAssets.get(assetId)!
          prunedWorldAssets[assetId] = await synthesizeAssetRefForExport(assetId, b)
        }
      }
      const exportWorld: RennWorld = { ...world, assets: prunedWorldAssets }
      const zip = new JSZip()
      zip.file('world.json', JSON.stringify(exportWorld, null, 2))
      const assetsFolder = zip.folder('assets')!
      await addAssetsToZipFolder(assetsFolder, exportedAssets, prunedWorldAssets)
      return zip.generateAsync({ type: 'blob' })
    },

    async importProject(file: File): Promise<{ id: string }> {
      const JSZip = (await import('jszip')).default
      const { migrateWorldScripts, migrateWorldSimplificationFields, migrateCustomTransformerNames, migrateWorldRingShapesToCylinder, migrateEntityTransformersToRegistry } = await import(
        '@/scripts/migrateWorld'
      )
      const zip = await JSZip.loadAsync(file)
      const worldFile = zip.file('world.json')
      if (!worldFile) throw new Error('Invalid project: missing world.json')
      const worldJson: unknown = JSON.parse(await worldFile.async('string'))
      migrateWorldScripts(worldJson)
      migrateCustomTransformerNames(worldJson)
      migrateEntityTransformersToRegistry(worldJson)
      migrateWorldSimplificationFields(worldJson)
      migrateWorldRingShapesToCylinder(worldJson)
      validateWorldDocument(worldJson, { tolerateAdditionalProperties: true, logAdditionalProperties: true })
      const world = worldJson as RennWorld
      const assets = new Map<string, Blob>()
      const worldAssets = world.assets ?? {}
      for (const [assetId, ref] of Object.entries(worldAssets)) {
        const path = ref.path ?? `assets/${assetId}.bin`
        const f = zip.file(path)
        if (f) {
          let blob = await f.async('blob')
          blob = await rehydrateImportedAssetBlob(blob, ref, path)
          assets.set(assetId, blob)
        }
      }
      for (const path of Object.keys(zip.files)) {
        if (!path.startsWith('assets/') || path.endsWith('/')) continue
        const assetId = path.replace(/^assets\//, '').replace(/\.[^.]+$/, '')
        if (assets.has(assetId)) continue
        const f = zip.file(path)
        if (f) {
          const ref = worldAssets[assetId]
          let blob = await f.async('blob')
          blob = await rehydrateImportedAssetBlob(blob, ref, path)
          assets.set(assetId, blob)
        }
      }
      const id = generateProjectId()
      const name = file.name.replace(/\.zip$/i, '') || `Imported ${new Date().toLocaleString()}`
      const api = createIndexedDbPersistence()
      await api.saveProject(id, name, { world, assets })
      return { id }
    },

    async savePlaySessionWorld(world: RennWorld): Promise<void> {
      const db = await getDB()
      const row: PlaySessionRow = { id: PLAY_SESSION_RECORD_ID, world }
      await db.put(STORE_PLAY_SESSION, row)
      await db.close()
    },

    async loadPlaySessionWorld(): Promise<RennWorld | null> {
      const db = await getDB()
      const row = (await db.get(STORE_PLAY_SESSION, PLAY_SESSION_RECORD_ID)) as PlaySessionRow | undefined
      await db.close()
      return row?.world ?? null
    },

    // Global asset management methods
    async saveAsset(assetId: string, blob: Blob, previewBlob?: Blob | null): Promise<void> {
      const db = await getDB()
      const assetType = blob.type?.startsWith('image') ? 'texture' : 'model'
      const mimeType = blob.type || 'application/octet-stream'
      let resolvedPreview: Blob | ArrayBuffer | null = previewBlob ?? null
      let resolvedPreviewType: string | null = previewBlob?.type ?? null
      if (previewBlob === undefined) {
        const existing = await db.get(STORE_ASSETS, assetId) as StoredAsset | undefined
        if (existing?.previewBlob instanceof Blob || existing?.previewBlob instanceof ArrayBuffer) {
          resolvedPreview = existing.previewBlob
        } else {
          resolvedPreview = null
        }
        resolvedPreviewType = typeof existing?.previewType === 'string' ? existing.previewType : null
      }
      if (previewBlob instanceof Blob) {
        if (typeof previewBlob.arrayBuffer === 'function') {
          try {
            resolvedPreview = await previewBlob.arrayBuffer()
            resolvedPreviewType = previewBlob.type ?? 'image/png'
          } catch (error) {
            console.error('Failed to encode preview blob for storage:', error)
            resolvedPreview = previewBlob
            resolvedPreviewType = previewBlob.type ?? 'image/png'
          }
        } else {
          resolvedPreview = previewBlob
          resolvedPreviewType = previewBlob.type ?? 'image/png'
        }
      }
      try {
        const arrayBuffer = await blobToArrayBuffer(blob)
        await db.put(STORE_ASSETS, {
          assetId,
          arrayBuffer,
          mimeType,
          type: assetType,
          previewBlob: resolvedPreview,
          previewType: resolvedPreviewType,
        })
      } catch {
        await db.put(STORE_ASSETS, {
          assetId,
          blob,
          type: assetType,
          previewBlob: resolvedPreview,
          previewType: resolvedPreviewType,
        })
      }
      await db.close()
    },

    async deleteAsset(assetId: string): Promise<void> {
      const db = await getDB()
      await db.delete(STORE_ASSETS, assetId)
      await db.close()
    },

    async listAllAssets(): Promise<Array<{ assetId: string; type: string; size: number }>> {
      const db = await getDB()
      const allAssets = (await db.getAll(STORE_ASSETS)) as StoredAsset[]
      await db.close()
      return allAssets.map((asset) => ({
        assetId: asset.assetId,
        type: asset.type ?? 'unknown',
        size: asset.arrayBuffer?.byteLength ?? (asset.blob instanceof Blob ? asset.blob.size : 0),
      }))
    },

    async loadAllAssets(): Promise<Map<string, Blob>> {
      const db = await getDB()
      const assets = new Map<string, Blob>()
      const allAssets = (await db.getAll(STORE_ASSETS)) as StoredAsset[]
      for (const asset of allAssets) {
        const blob = storedAssetToBlob(asset)
        if (blob) assets.set(asset.assetId, blob)
      }
      await db.close()
      return assets
    },

    async loadAssetPreview(assetId: string): Promise<Blob | null> {
      const db = await getDB()
      const asset = await db.get(STORE_ASSETS, assetId)
      await db.close()
      const preview = asset?.previewBlob
      const previewType = typeof asset?.previewType === 'string' ? asset.previewType : 'image/png'
      if (preview instanceof Blob) {
        return preview
      }
      if (preview instanceof ArrayBuffer) {
        return new Blob([preview], { type: previewType })
      }
      if (preview && ArrayBuffer.isView(preview)) {
        const buffer = preview.buffer
        if (buffer instanceof ArrayBuffer) {
          return new Blob([buffer], { type: previewType })
        }
        return null
      }
      if (preview && typeof (preview as Blob).arrayBuffer === 'function') {
        try {
          const buffer = await (preview as Blob).arrayBuffer()
          return new Blob([buffer], { type: (preview as Blob).type ?? previewType })
        } catch {
          return null
        }
      }
      return null
    },

    async listModelPresets(): Promise<ModelPreset[]> {
      const db = await getDB()
      const rows = (await db.getAll(STORE_MODEL_PRESETS)) as ModelPreset[]
      await db.close()
      return [...rows].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    },

    async saveModelPreset(preset: ModelPreset): Promise<void> {
      const db = await getDB()
      await db.put(STORE_MODEL_PRESETS, preset)
      await db.close()
    },

    async deleteModelPreset(id: string): Promise<void> {
      const db = await getDB()
      await db.delete(STORE_MODEL_PRESETS, id)
      await db.close()
    },

    async loadGlobalBehaviorLibrary(): Promise<GlobalBehaviorLibrary> {
      try {
        const db = await getDB()
        try {
          const row = (await db.get(
            STORE_GLOBAL_BEHAVIOR,
            GLOBAL_BEHAVIOR_ROW_ID,
          )) as GlobalBehaviorLibraryRow | undefined
          if (!row) {
            return { ...EMPTY_GLOBAL_BEHAVIOR_LIBRARY }
          }
          return {
            transformers: row.transformers ?? {},
            scripts: row.scripts ?? {},
            transformerPipes: row.transformerPipes ?? {},
          }
        } finally {
          db.close()
        }
      } catch (e) {
        if (isIndexedDbMissingObjectStoreError(e)) {
          console.warn(
            `[Persistence] ${STORE_GLOBAL_BEHAVIOR} object store missing; returning empty library. Reload once after IndexedDB migrated to schema v${DB_CONFIG.version}.`,
          )
          return { ...EMPTY_GLOBAL_BEHAVIOR_LIBRARY }
        }
        throw e
      }
    },

    async saveGlobalBehaviorLibrary(library: GlobalBehaviorLibrary): Promise<void> {
      try {
        const db = await getDB()
        try {
          const row: GlobalBehaviorLibraryRow = {
            id: GLOBAL_BEHAVIOR_ROW_ID,
            transformers: library.transformers ?? {},
            scripts: library.scripts ?? {},
            transformerPipes: library.transformerPipes ?? {},
            updatedAt: Date.now(),
          }
          await db.put(STORE_GLOBAL_BEHAVIOR, row)
        } finally {
          db.close()
        }
      } catch (e) {
        if (isIndexedDbMissingObjectStoreError(e)) {
          console.warn(
            `[Persistence] Cannot save global behavior library until IndexedDB upgrades (schema v${DB_CONFIG.version}).`,
          )
          return
        }
        throw e
      }
    },
  }
}

/** Shared persistence instance for inspector and asset UI. */
export const defaultPersistence = createIndexedDbPersistence()
