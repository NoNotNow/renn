import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { SceneViewHandle } from '@/components/SceneView'
import type { EditorSnapshot } from '@/editor/editorHistory'
import type { TexturePaintStrokePayload } from '@/editor/transformGizmoController'
import { TEXTURE_LAYER_PREFIX } from '@/utils/paintAssetRouting'
import { resolvePaintStrokeWriteTarget } from '@/utils/paintAssetRouting'
import { createTextureMakerHistory, type TextureMakerSnapshot } from '@/utils/textureMakerHistory'
import {
  buildTextureDocument,
  compositeTextureLayers,
  createTransparentPngBlob,
  deserializeDoc,
  isCompositeMaterialMap,
  mergeLayerDown,
  rasterizeBlobToDimensions,
  readImageBitmapSize,
  removeLayerAt,
  reorderLayer,
  resizeTextureDocument,
  serializeDocToBlob,
  texDocAssetId,
  TEXTURE_NEW_DOCUMENT_DEFAULT_SIZE,
  TEXTURE_NEW_DOCUMENT_EDIT_FAMILY_STEM,
  type TextureDocument,
  type TextureLayer,
} from '@/utils/textureCompositor'
import {
  countWorldAssetReferences,
  fileExtNoDotFromImageMime,
  inferEditFamilyFromMaterialMapId,
  nextEditedTextureAssetKey,
  sanitizeTextureStem,
} from '@/utils/textureAssetVersioning'
import {
  generateCompositeAssetId,
  generateTexLayerAssetId,
} from '@/utils/idGenerator'
import type { RennWorld } from '@/types/world'
import type { WorldAssetsRef } from '@/hooks/useEditorHistory'
import type React from 'react'

export interface UseTextureMakerSessionParams {
  world: RennWorld
  assets: Map<string, Blob>
  worldAssetsRef: WorldAssetsRef
  sceneViewRef: React.RefObject<SceneViewHandle>
  selectedEntityIds: string[]
  documentEpoch: number
  pushHistory: () => void
  tryEditorUndo: () => EditorSnapshot | null
  tryEditorRedo: () => EditorSnapshot | null
  applyHistorySnapshot: (snap: EditorSnapshot) => void
  updateWorld: (fn: (prev: RennWorld) => RennWorld) => void
  updateAssets: (fn: (prev: Map<string, Blob>) => Map<string, Blob>) => void
  maxDepth: number
}

export interface UseTextureMakerSessionResult {
  textureMakerEntityId: string | null
  textureMakerLayerId: string | null
  textureMakerDraftDoc: TextureDocument | null
  textureMakerDraftAssets: Map<string, Blob> | null
  textureMakerRevertReady: boolean
  compositePreviewUrl: string | null
  textureMakerDoc: TextureDocument | null
  textureMakerStacksActive: boolean
  textureMakerHistoryTick: number
  canUndoTextureMaker: boolean
  canRedoTextureMaker: boolean
  textureBrushDisabled: boolean
  textureDocsRef: React.MutableRefObject<Map<string, TextureDocument>>
  textureStudioTick: number
  activateTextureStudioForEntity: (id: string) => Promise<void>
  provisionBlankCompositeTextureIfMissing: (id: string) => Promise<void>
  getPaintTargetAssetId: (id: string) => string | null
  prepareWorldPaintStroke: (
    id: string,
  ) => Promise<{ mapAssetId: string; blob: Blob } | null>
  handleClose: () => void
  handleUndo: () => void
  handleRedo: () => void
  handleTexturePaintStrokeEnd: (payload: TexturePaintStrokePayload) => Promise<void>
  handleTextureMakerSelectLayer: (layerId: string) => void
  handleTextureMakerPatchLayer: (
    layerId: string,
    patch: Partial<Pick<TextureLayer, 'opacity' | 'blendMode' | 'visible' | 'name' | 'dest'>>,
  ) => void
  handleTextureMakerResizeDocument: (newW: number, newH: number) => Promise<void>
  handleTextureMakerReorderLayer: (fromIndex: number, toIndex: number) => Promise<void>
  handleTextureMakerRemoveLayer: (index: number) => Promise<void>
  handleTextureMakerAddEmptyLayer: () => Promise<void>
  handleTextureMakerImportLayer: (file: File) => Promise<void>
  handleTextureMakerRevertToOriginal: () => Promise<void>
  handleTextureMakerApply: () => Promise<void>
  handleTextureMakerMergeDown: (index: number) => Promise<void>
  handleTextureMakerStudioPaintStrokeEnd: (
    payload: TexturePaintStrokePayload,
  ) => Promise<void>
  pushTextureMakerBeforeEdit: () => void
}

/**
 * Owns all Texture Maker panel state, draft documents, per-session history,
 * and the handlers wired to the TextureMaker component and 3D viewport paint.
 * Extracted from Builder.tsx to keep that file focused on scene/editor orchestration.
 */
export function useTextureMakerSession({
  world,
  assets,
  worldAssetsRef,
  sceneViewRef,
  selectedEntityIds,
  documentEpoch,
  pushHistory,
  tryEditorUndo,
  tryEditorRedo,
  applyHistorySnapshot,
  updateWorld,
  updateAssets,
  maxDepth,
}: UseTextureMakerSessionParams): UseTextureMakerSessionResult {
  // ─── Refs ─────────────────────────────────────────────────────────────────
  const textureDocsRef = useRef<Map<string, TextureDocument>>(new Map())
  const selectedLayerByEntityRef = useRef<Map<string, string>>(new Map())
  const textureMakerBaselineRef = useRef<{
    doc: TextureDocument
    blobs: Map<string, Blob>
  } | null>(null)
  const textureMakerDraftDocRef = useRef<TextureDocument | null>(null)
  const textureMakerDraftAssetsRef = useRef<Map<string, Blob> | null>(null)
  const textureMakerHistoryRef = useRef(createTextureMakerHistory(maxDepth))
  const textureMakerEntityIdRef = useRef<string | null>(null)
  const textureMakerLayerIdRef = useRef<string | null>(null)
  /** Dedupe concurrent async texture provisioning for the same entity. */
  const worldPaintPrepareRef = useRef<
    Map<string, Promise<{ mapAssetId: string; blob: Blob } | null>>
  >(new Map())

  // ─── State ────────────────────────────────────────────────────────────────
  const [textureStudioTick, setTextureStudioTick] = useState(0)
  const bumpTextureStudio = useCallback(() => setTextureStudioTick((t) => t + 1), [])
  const [textureMakerEntityId, setTextureMakerEntityId] = useState<string | null>(null)
  const [compositePreviewUrl, setCompositePreviewUrl] = useState<string | null>(null)
  const [textureMakerLayerId, setTextureMakerLayerId] = useState<string | null>(null)
  const [textureMakerRevertReady, setTextureMakerRevertReady] = useState(false)
  const [textureMakerDraftDoc, setTextureMakerDraftDoc] =
    useState<TextureDocument | null>(null)
  const [textureMakerDraftAssets, setTextureMakerDraftAssets] =
    useState<Map<string, Blob> | null>(null)
  const [textureMakerHistoryTick, setTextureMakerHistoryUi] = useState(0)
  const bumpTextureMakerHistoryUi = useCallback(
    () => setTextureMakerHistoryUi((n) => n + 1),
    [],
  )

  // ─── Ref sync effects ────────────────────────────────────────────────────
  useEffect(() => {
    textureMakerEntityIdRef.current = textureMakerEntityId
  }, [textureMakerEntityId])

  useEffect(() => {
    textureMakerLayerIdRef.current = textureMakerLayerId
  }, [textureMakerLayerId])

  // Clear texture maker history when a new document is loaded
  useEffect(() => {
    textureMakerHistoryRef.current.clear()
    bumpTextureMakerHistoryUi()
  }, [documentEpoch, bumpTextureMakerHistoryUi])

  // ─── Load texture docs from assets when world/assets change ──────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const e of world.entities) {
        const m = e.material?.map
        if (!m || !isCompositeMaterialMap(m)) continue
        const sidecar = assets.get(texDocAssetId(m))
        if (!sidecar) continue
        try {
          const d = await deserializeDoc(sidecar)
          if (!cancelled) {
            textureDocsRef.current.set(e.id, d)
            if (!selectedLayerByEntityRef.current.has(e.id)) {
              const top = d.layers[d.layers.length - 1]
              if (top) selectedLayerByEntityRef.current.set(e.id, top.id)
            }
          }
        } catch {
          /* ignore corrupt sidecar */
        }
      }
      if (!cancelled) bumpTextureStudio()
    })()
    return () => {
      cancelled = true
    }
  }, [world.entities, assets, bumpTextureStudio])

  // ─── Draft init when entity opens ────────────────────────────────────────
  useLayoutEffect(() => {
    if (!textureMakerEntityId) {
      textureMakerBaselineRef.current = null
      setTextureMakerRevertReady(false)
      setTextureMakerDraftDoc(null)
      setTextureMakerDraftAssets(null)
      textureMakerDraftDocRef.current = null
      textureMakerDraftAssetsRef.current = null
      textureMakerHistoryRef.current.clear()
      bumpTextureMakerHistoryUi()
      return
    }
    const doc = textureDocsRef.current.get(textureMakerEntityId)
    if (!doc || doc.layers.length === 0) {
      setTextureMakerRevertReady(false)
      setTextureMakerDraftDoc(null)
      setTextureMakerDraftAssets(null)
      textureMakerDraftDocRef.current = null
      textureMakerDraftAssetsRef.current = null
      return
    }
    const a = worldAssetsRef.current.assets
    const blobs = new Map<string, Blob>()
    const draftDoc = JSON.parse(JSON.stringify(doc)) as TextureDocument
    const draftAssets = new Map<string, Blob>()
    for (const l of doc.layers) {
      const b = a.get(l.assetId)
      if (!b) {
        textureMakerBaselineRef.current = null
        setTextureMakerRevertReady(false)
        setTextureMakerDraftDoc(null)
        setTextureMakerDraftAssets(null)
        textureMakerDraftDocRef.current = null
        textureMakerDraftAssetsRef.current = null
        return
      }
      blobs.set(l.assetId, b.slice(0, b.size, b.type))
      draftAssets.set(l.assetId, b.slice(0, b.size, b.type))
    }
    textureMakerBaselineRef.current = {
      doc: JSON.parse(JSON.stringify(doc)) as TextureDocument,
      blobs,
    }
    textureMakerDraftDocRef.current = draftDoc
    textureMakerDraftAssetsRef.current = draftAssets
    setTextureMakerDraftDoc(draftDoc)
    setTextureMakerDraftAssets(draftAssets)
    setTextureMakerRevertReady(true)
    textureMakerHistoryRef.current.clear()
    bumpTextureMakerHistoryUi()
  }, [textureMakerEntityId, worldAssetsRef, bumpTextureMakerHistoryUi])

  // ─── Composite preview URL ────────────────────────────────────────────────
  useEffect(() => {
    if (!textureMakerEntityId) {
      setCompositePreviewUrl((u) => {
        if (u) URL.revokeObjectURL(u)
        return null
      })
      return
    }
    const doc = textureDocsRef.current.get(textureMakerEntityId)
    const cid = doc?.compositeAssetId
    const blob = cid ? assets.get(cid) : undefined
    if (!blob) {
      setCompositePreviewUrl((u) => {
        if (u) URL.revokeObjectURL(u)
        return null
      })
      return
    }
    const url = URL.createObjectURL(blob)
    setCompositePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [textureMakerEntityId, assets, textureStudioTick])

  // ─── Auto-close when selection changes ───────────────────────────────────
  useEffect(() => {
    if (selectedEntityIds.length !== 1) {
      selectedLayerByEntityRef.current.clear()
      setTextureMakerLayerId(null)
      setTextureMakerEntityId(null)
    } else if (
      textureMakerEntityId != null &&
      !selectedEntityIds.includes(textureMakerEntityId)
    ) {
      setTextureMakerEntityId(null)
      setTextureMakerLayerId(null)
    }
  }, [selectedEntityIds, textureMakerEntityId])

  // ─── Restore selected layer from ref when studio ticks ───────────────────
  useEffect(() => {
    if (!textureMakerEntityId) return
    const d = textureDocsRef.current.get(textureMakerEntityId)
    if (!d || d.layers.length === 0) return
    const fromRef = selectedLayerByEntityRef.current.get(textureMakerEntityId)
    const valid = Boolean(fromRef && d.layers.some((l) => l.id === fromRef))
    if (valid && fromRef) {
      setTextureMakerLayerId(fromRef)
      return
    }
    const top = d.layers[d.layers.length - 1]!
    selectedLayerByEntityRef.current.set(textureMakerEntityId, top.id)
    setTextureMakerLayerId(top.id)
  }, [textureMakerEntityId, textureStudioTick])

  // ─── Snapshot helpers ─────────────────────────────────────────────────────
  const applyTextureMakerSnapshot = useCallback(
    (snap: TextureMakerSnapshot) => {
      const eid = textureMakerEntityIdRef.current
      textureMakerDraftDocRef.current = snap.doc
      textureMakerDraftAssetsRef.current = snap.assets
      setTextureMakerDraftDoc(snap.doc)
      setTextureMakerDraftAssets(snap.assets)
      if (eid) {
        const sel = snap.selectedLayerId
        const valid = Boolean(sel && snap.doc.layers.some((l) => l.id === sel))
        if (valid && sel) {
          selectedLayerByEntityRef.current.set(eid, sel)
          setTextureMakerLayerId(sel)
        } else {
          const top = snap.doc.layers[snap.doc.layers.length - 1]
          if (top) {
            selectedLayerByEntityRef.current.set(eid, top.id)
            setTextureMakerLayerId(top.id)
          }
        }
      }
      bumpTextureStudio()
      bumpTextureMakerHistoryUi()
    },
    [bumpTextureStudio, bumpTextureMakerHistoryUi],
  )

  const pushTextureMakerBeforeEdit = useCallback(() => {
    const eid = textureMakerEntityIdRef.current
    if (!eid) return
    const doc = textureMakerDraftDocRef.current
    const draftAssets = textureMakerDraftAssetsRef.current
    if (!doc || !draftAssets) return
    const sel = textureMakerLayerIdRef.current
    textureMakerHistoryRef.current.pushBeforeMutation(doc, draftAssets, sel)
    bumpTextureMakerHistoryUi()
  }, [bumpTextureMakerHistoryUi])

  // ─── Combined undo / redo ─────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const eid = textureMakerEntityIdRef.current
    const doc = textureMakerDraftDocRef.current
    const draftAssets = textureMakerDraftAssetsRef.current
    const sel = textureMakerLayerIdRef.current
    if (eid && doc && draftAssets) {
      const prev = textureMakerHistoryRef.current.undo(doc, draftAssets, sel)
      if (prev) {
        applyTextureMakerSnapshot(prev)
        return
      }
    }
    const histPrev = tryEditorUndo()
    if (histPrev) applyHistorySnapshot(histPrev)
  }, [tryEditorUndo, applyHistorySnapshot, applyTextureMakerSnapshot])

  const handleRedo = useCallback(() => {
    const eid = textureMakerEntityIdRef.current
    const doc = textureMakerDraftDocRef.current
    const draftAssets = textureMakerDraftAssetsRef.current
    const sel = textureMakerLayerIdRef.current
    if (eid && doc && draftAssets) {
      const next = textureMakerHistoryRef.current.redo(doc, draftAssets, sel)
      if (next) {
        applyTextureMakerSnapshot(next)
        return
      }
    }
    const histNext = tryEditorRedo()
    if (histNext) applyHistorySnapshot(histNext)
  }, [tryEditorRedo, applyHistorySnapshot, applyTextureMakerSnapshot])

  // ─── Close ────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    textureMakerHistoryRef.current.clear()
    bumpTextureMakerHistoryUi()
    setTextureMakerEntityId(null)
    setTextureMakerLayerId(null)
    setTextureMakerRevertReady(false)
    setTextureMakerDraftDoc(null)
    setTextureMakerDraftAssets(null)
    textureMakerDraftDocRef.current = null
    textureMakerDraftAssetsRef.current = null
  }, [bumpTextureMakerHistoryUi])

  // ─── Provisioning ─────────────────────────────────────────────────────────
  const provisionBlankCompositeTextureIfMissing = useCallback(
    async (entityId: string) => {
      const w = worldAssetsRef.current.world
      const a = worldAssetsRef.current.assets
      const entity = w.entities.find((e) => e.id === entityId)
      if (!entity) return
      if (entity.material?.map) return

      const width = TEXTURE_NEW_DOCUMENT_DEFAULT_SIZE
      const height = TEXTURE_NEW_DOCUMENT_DEFAULT_SIZE
      const compositeAssetId = generateCompositeAssetId()
      const bgLayerAssetId = generateTexLayerAssetId()
      const paintLayerAssetId = generateTexLayerAssetId()
      const bgBlob = await createTransparentPngBlob(width, height)
      const paintBlob = await createTransparentPngBlob(width, height)
      const docNew = buildTextureDocument({
        compositeAssetId,
        width,
        height,
        backgroundLayerAssetId: bgLayerAssetId,
        paintLayerAssetId: paintLayerAssetId,
        editFamilyStem: TEXTURE_NEW_DOCUMENT_EDIT_FAMILY_STEM,
        editFamilyFileExt: 'png',
      })
      const next = new Map(a)
      next.set(bgLayerAssetId, bgBlob)
      next.set(paintLayerAssetId, paintBlob)
      const comp = await compositeTextureLayers(docNew, next)
      next.set(compositeAssetId, comp)
      next.set(texDocAssetId(compositeAssetId), serializeDocToBlob(docNew))
      await updateAssets(() => next)
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) =>
          e.id === entityId ? { ...e, material: { ...e.material, map: compositeAssetId } } : e,
        ),
      }))
      textureDocsRef.current.set(entityId, docNew)
      const paintL = docNew.layers[1]
      if (paintL) {
        selectedLayerByEntityRef.current.set(entityId, paintL.id)
      }
      bumpTextureStudio()
      requestAnimationFrame(() => {
        const ent = worldAssetsRef.current.world.entities.find((e) => e.id === entityId)
        if (ent) void sceneViewRef.current?.updateEntityMaterial(entityId, ent)
      })
    },
    [updateAssets, updateWorld, bumpTextureStudio, worldAssetsRef, sceneViewRef],
  )

  const activateTextureStudioForEntity = useCallback(
    async (entityId: string) => {
      pushHistory()
      const w = worldAssetsRef.current.world
      const a = worldAssetsRef.current.assets
      const entity = w.entities.find((e) => e.id === entityId)
      if (!entity) return
      const mapId = entity.material?.map

      if (!mapId) {
        await provisionBlankCompositeTextureIfMissing(entityId)
        setTextureMakerEntityId(entityId)
        const docNew = textureDocsRef.current.get(entityId)
        const paintL = docNew?.layers[1]
        if (paintL) {
          selectedLayerByEntityRef.current.set(entityId, paintL.id)
          setTextureMakerLayerId(paintL.id)
        }
        return
      }

      if (isCompositeMaterialMap(mapId)) {
        const sidecar = a.get(texDocAssetId(mapId))
        if (sidecar) {
          try {
            const docLoaded = await deserializeDoc(sidecar)
            textureDocsRef.current.set(entityId, docLoaded)
            const top = docLoaded.layers[docLoaded.layers.length - 1]
            if (top) {
              selectedLayerByEntityRef.current.set(entityId, top.id)
              setTextureMakerLayerId(top.id)
            }
          } catch {
            /* ignore corrupt sidecar */
          }
        }
        setTextureMakerEntityId(entityId)
        bumpTextureStudio()
        return
      }

      const sourceBlob = a.get(mapId)
      if (!sourceBlob) return
      const { width, height } = await readImageBitmapSize(sourceBlob)
      const compositeAssetId = generateCompositeAssetId()
      const bgLayerAssetId = generateTexLayerAssetId()
      const paintLayerAssetId = generateTexLayerAssetId()
      const bgBlob = await rasterizeBlobToDimensions(sourceBlob, width, height)
      const paintBlob = await createTransparentPngBlob(width, height)
      const { stem, extNoDot } = inferEditFamilyFromMaterialMapId(mapId, sourceBlob.type)
      const docNew = buildTextureDocument({
        compositeAssetId,
        width,
        height,
        backgroundLayerAssetId: bgLayerAssetId,
        paintLayerAssetId: paintLayerAssetId,
        editFamilyStem: stem,
        editFamilyFileExt: extNoDot,
      })
      const next = new Map(a)
      next.set(bgLayerAssetId, bgBlob)
      next.set(paintLayerAssetId, paintBlob)
      const comp = await compositeTextureLayers(docNew, next)
      next.set(compositeAssetId, comp)
      next.set(texDocAssetId(compositeAssetId), serializeDocToBlob(docNew))
      await updateAssets(() => next)
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) =>
          e.id === entityId ? { ...e, material: { ...e.material, map: compositeAssetId } } : e,
        ),
      }))
      textureDocsRef.current.set(entityId, docNew)
      const paintL = docNew.layers[1]
      if (paintL) {
        selectedLayerByEntityRef.current.set(entityId, paintL.id)
        setTextureMakerLayerId(paintL.id)
      }
      setTextureMakerEntityId(entityId)
      bumpTextureStudio()
      requestAnimationFrame(() => {
        const ent = worldAssetsRef.current.world.entities.find((e) => e.id === entityId)
        if (ent) void sceneViewRef.current?.updateEntityMaterial(entityId, ent)
      })
    },
    [
      pushHistory,
      updateAssets,
      updateWorld,
      bumpTextureStudio,
      provisionBlankCompositeTextureIfMissing,
      worldAssetsRef,
      sceneViewRef,
    ],
  )

  // ─── Paint target resolution ──────────────────────────────────────────────
  const getPaintTargetAssetId = useCallback(
    (entityId: string): string | null => {
      void textureStudioTick
      void textureMakerLayerId
      const ent = worldAssetsRef.current.world.entities.find((x) => x.id === entityId)
      const mid = ent?.material?.map
      if (!mid || !isCompositeMaterialMap(mid)) return null
      const doc = textureDocsRef.current.get(entityId)
      if (!doc) return null
      const sel = selectedLayerByEntityRef.current.get(entityId)
      const layer = sel
        ? doc.layers.find((l) => l.id === sel)
        : doc.layers[doc.layers.length - 1]
      return layer?.assetId ?? null
    },
    [textureStudioTick, textureMakerLayerId, worldAssetsRef],
  )

  const prepareWorldPaintStroke = useCallback(
    async (entityId: string): Promise<{ mapAssetId: string; blob: Blob } | null> => {
      void textureStudioTick
      void textureMakerLayerId
      const ent = worldAssetsRef.current.world.entities.find((e) => e.id === entityId)
      if (!ent) return null

      const paintTargetId = getPaintTargetAssetId(entityId)
      const mapId = ent.material?.map
      const sourceId = paintTargetId ?? mapId ?? null
      if (sourceId) {
        const blob = worldAssetsRef.current.assets.get(sourceId)
        if (blob) return { mapAssetId: sourceId, blob }
      }

      const inFlight = worldPaintPrepareRef.current.get(entityId)
      if (inFlight) return inFlight

      const p = (async (): Promise<{ mapAssetId: string; blob: Blob } | null> => {
        try {
          pushHistory()
          await provisionBlankCompositeTextureIfMissing(entityId)
          const ent2 = worldAssetsRef.current.world.entities.find((e) => e.id === entityId)
          const mapId2 = ent2?.material?.map
          if (!mapId2 || !isCompositeMaterialMap(mapId2)) return null
          const doc = textureDocsRef.current.get(entityId)
          if (!doc || doc.layers.length < 2) return null
          const paintLayer = doc.layers[1]!
          const blob = worldAssetsRef.current.assets.get(paintLayer.assetId)
          if (!blob) return null
          bumpTextureStudio()
          return { mapAssetId: paintLayer.assetId, blob }
        } finally {
          worldPaintPrepareRef.current.delete(entityId)
        }
      })()
      worldPaintPrepareRef.current.set(entityId, p)
      return p
    },
    [
      getPaintTargetAssetId,
      pushHistory,
      provisionBlankCompositeTextureIfMissing,
      bumpTextureStudio,
      textureStudioTick,
      textureMakerLayerId,
      worldAssetsRef,
    ],
  )

  // ─── 3D viewport paint stroke ─────────────────────────────────────────────
  const handleTexturePaintStrokeEnd = useCallback(
    async (payload: TexturePaintStrokePayload) => {
      if (payload.mapAssetId.startsWith(TEXTURE_LAYER_PREFIX)) {
        const doc = textureDocsRef.current.get(payload.entityId)
        if (doc?.layers.some((l) => l.assetId === payload.mapAssetId)) {
          const next = new Map(worldAssetsRef.current.assets)
          next.set(payload.mapAssetId, payload.newBlob)
          const comp = await compositeTextureLayers(doc, next)
          next.set(doc.compositeAssetId, comp)
          next.set(texDocAssetId(doc.compositeAssetId), serializeDocToBlob(doc))
          await updateAssets(() => next)
          bumpTextureStudio()
          requestAnimationFrame(() => {
            const entity = worldAssetsRef.current.world.entities.find(
              (e) => e.id === payload.entityId,
            )
            if (entity) void sceneViewRef.current?.updateEntityMaterial(payload.entityId, entity)
          })
          return
        }
      }

      const { writeAssetId, entityShouldPointToWriteId } = resolvePaintStrokeWriteTarget(
        payload.mapAssetId,
      )
      await updateAssets((prev) => {
        const next = new Map(prev)
        next.set(writeAssetId, payload.newBlob)
        return next
      })
      if (entityShouldPointToWriteId) {
        updateWorld((prev) => ({
          ...prev,
          entities: prev.entities.map((e) =>
            e.id === payload.entityId
              ? { ...e, material: { ...e.material, map: writeAssetId } }
              : e,
          ),
        }))
      }
      requestAnimationFrame(() => {
        const entity = worldAssetsRef.current.world.entities.find(
          (e) => e.id === payload.entityId,
        )
        if (entity) void sceneViewRef.current?.updateEntityMaterial(payload.entityId, entity)
      })
    },
    [updateAssets, updateWorld, bumpTextureStudio, worldAssetsRef, sceneViewRef],
  )

  // ─── TextureMaker panel handlers ─────────────────────────────────────────
  const handleTextureMakerSelectLayer = useCallback(
    (layerId: string) => {
      const eid = textureMakerEntityId
      if (!eid) return
      selectedLayerByEntityRef.current.set(eid, layerId)
      setTextureMakerLayerId(layerId)
    },
    [textureMakerEntityId],
  )

  const handleTextureMakerPatchLayer = useCallback(
    (
      layerId: string,
      patch: Partial<
        Pick<TextureLayer, 'opacity' | 'blendMode' | 'visible' | 'name' | 'dest'>
      >,
    ) => {
      const doc = textureMakerDraftDocRef.current
      if (!doc) return
      pushTextureMakerBeforeEdit()
      const nextDoc: TextureDocument = {
        ...doc,
        layers: doc.layers.map((l) => {
          if (l.id !== layerId) return l
          if ('dest' in patch && patch.dest === undefined) {
            const { dest: _omit, ...rest } = { ...l, ...patch }
            return rest as TextureLayer
          }
          return { ...l, ...patch }
        }),
      }
      textureMakerDraftDocRef.current = nextDoc
      setTextureMakerDraftDoc(nextDoc)
    },
    [pushTextureMakerBeforeEdit],
  )

  const handleTextureMakerResizeDocument = useCallback(
    async (newW: number, newH: number) => {
      const doc = textureMakerDraftDocRef.current
      const prevAssets = textureMakerDraftAssetsRef.current
      if (!doc || !prevAssets) return
      pushTextureMakerBeforeEdit()
      const { doc: nextDoc, layerBlobs } = await resizeTextureDocument(doc, newW, newH, prevAssets)
      if (layerBlobs.size === 0) return
      const nextAssets = new Map(prevAssets)
      for (const [aid, blob] of layerBlobs) nextAssets.set(aid, blob)
      textureMakerDraftDocRef.current = nextDoc
      textureMakerDraftAssetsRef.current = nextAssets
      setTextureMakerDraftDoc(nextDoc)
      setTextureMakerDraftAssets(nextAssets)
    },
    [pushTextureMakerBeforeEdit],
  )

  const handleTextureMakerReorderLayer = useCallback(
    async (fromIndex: number, toIndex: number) => {
      const doc = textureMakerDraftDocRef.current
      if (!doc) return
      pushTextureMakerBeforeEdit()
      const nextDoc = reorderLayer(doc, fromIndex, toIndex)
      textureMakerDraftDocRef.current = nextDoc
      setTextureMakerDraftDoc(nextDoc)
    },
    [pushTextureMakerBeforeEdit],
  )

  const handleTextureMakerRemoveLayer = useCallback(
    async (index: number) => {
      const eid = textureMakerEntityId
      if (!eid) return
      const doc = textureMakerDraftDocRef.current
      const draftAssets = textureMakerDraftAssetsRef.current
      if (!doc || !draftAssets || doc.layers.length <= 1) return
      pushTextureMakerBeforeEdit()
      const removed = doc.layers[index]
      if (!removed) return
      const nextDoc = removeLayerAt(doc, index)
      const nextAssets = new Map(draftAssets)
      nextAssets.delete(removed.assetId)
      textureMakerDraftDocRef.current = nextDoc
      textureMakerDraftAssetsRef.current = nextAssets
      setTextureMakerDraftDoc(nextDoc)
      setTextureMakerDraftAssets(nextAssets)
      const cur = selectedLayerByEntityRef.current.get(eid)
      if (cur === removed.id) {
        const fallback = nextDoc.layers[Math.min(index, nextDoc.layers.length - 1)]
        if (fallback) {
          selectedLayerByEntityRef.current.set(eid, fallback.id)
          setTextureMakerLayerId(fallback.id)
        }
      }
    },
    [pushTextureMakerBeforeEdit, textureMakerEntityId],
  )

  const handleTextureMakerAddEmptyLayer = useCallback(async () => {
    const eid = textureMakerEntityId
    if (!eid) return
    const doc = textureMakerDraftDocRef.current
    const draftAssets = textureMakerDraftAssetsRef.current
    if (!doc || !draftAssets) return
    pushTextureMakerBeforeEdit()
    const layerId = generateTexLayerAssetId()
    const assetId = generateTexLayerAssetId()
    const blob = await createTransparentPngBlob(doc.width, doc.height)
    const nextDoc: TextureDocument = {
      ...doc,
      layers: [
        ...doc.layers,
        {
          id: layerId,
          name: `Layer ${doc.layers.length + 1}`,
          assetId,
          opacity: 1,
          blendMode: 'normal',
          visible: true,
        },
      ],
    }
    const nextAssets = new Map(draftAssets)
    nextAssets.set(assetId, blob)
    textureMakerDraftDocRef.current = nextDoc
    textureMakerDraftAssetsRef.current = nextAssets
    setTextureMakerDraftDoc(nextDoc)
    setTextureMakerDraftAssets(nextAssets)
    selectedLayerByEntityRef.current.set(eid, layerId)
    setTextureMakerLayerId(layerId)
  }, [pushTextureMakerBeforeEdit, textureMakerEntityId])

  const handleTextureMakerImportLayer = useCallback(
    async (file: File) => {
      const eid = textureMakerEntityId
      if (!eid) return
      const doc = textureMakerDraftDocRef.current
      const draftAssets = textureMakerDraftAssetsRef.current
      if (!doc || !draftAssets) return
      pushTextureMakerBeforeEdit()
      const buf = await file.arrayBuffer()
      const fileBlob = new Blob([buf], { type: file.type || 'application/octet-stream' })
      const raster = await rasterizeBlobToDimensions(fileBlob, doc.width, doc.height)
      const layerId = generateTexLayerAssetId()
      const assetId = generateTexLayerAssetId()
      const nextDoc: TextureDocument = {
        ...doc,
        layers: [
          ...doc.layers,
          {
            id: layerId,
            name: file.name.replace(/\.[^/.]+$/, '') || 'Import',
            assetId,
            opacity: 1,
            blendMode: 'normal',
            visible: true,
          },
        ],
      }
      const nextAssets = new Map(draftAssets)
      nextAssets.set(assetId, raster)
      textureMakerDraftDocRef.current = nextDoc
      textureMakerDraftAssetsRef.current = nextAssets
      setTextureMakerDraftDoc(nextDoc)
      setTextureMakerDraftAssets(nextAssets)
      selectedLayerByEntityRef.current.set(eid, layerId)
      setTextureMakerLayerId(layerId)
    },
    [pushTextureMakerBeforeEdit, textureMakerEntityId],
  )

  const handleTextureMakerRevertToOriginal = useCallback(async () => {
    const eid = textureMakerEntityId
    if (!eid) return
    const baseline = textureMakerBaselineRef.current
    if (!baseline) return
    if (
      !window.confirm(
        'Revert all layers and document settings to how they were when you opened Texture Maker? This cannot be undone except with Undo.',
      )
    ) {
      return
    }
    pushTextureMakerBeforeEdit()
    const restoredDoc = JSON.parse(JSON.stringify(baseline.doc)) as TextureDocument
    const nextAssets = new Map<string, Blob>()
    for (const [id, blob] of baseline.blobs) nextAssets.set(id, blob)
    textureMakerDraftDocRef.current = restoredDoc
    textureMakerDraftAssetsRef.current = nextAssets
    setTextureMakerDraftDoc(restoredDoc)
    setTextureMakerDraftAssets(nextAssets)
    const sel = selectedLayerByEntityRef.current.get(eid)
    const selValid = sel ? restoredDoc.layers.some((l) => l.id === sel) : false
    if (!selValid) {
      const top = restoredDoc.layers[restoredDoc.layers.length - 1]
      if (top) {
        selectedLayerByEntityRef.current.set(eid, top.id)
        setTextureMakerLayerId(top.id)
      }
    } else if (sel) {
      setTextureMakerLayerId(sel)
    }
  }, [pushTextureMakerBeforeEdit, textureMakerEntityId])

  const handleTextureMakerApply = useCallback(async () => {
    const eid = textureMakerEntityId
    if (!eid) return
    const doc = textureMakerDraftDocRef.current
    const draftAssets = textureMakerDraftAssetsRef.current
    if (!doc || !draftAssets) return
    const baseDoc = textureDocsRef.current.get(eid)

    pushHistory()
    const w0 = worldAssetsRef.current.world
    const prevAssets = worldAssetsRef.current.assets
    const next = new Map(prevAssets)

    const draftLayerAssetIds = new Set<string>()
    for (const aid of draftAssets.keys()) draftLayerAssetIds.add(aid)
    for (const l of baseDoc?.layers ?? []) {
      if (!doc.layers.some((x) => x.assetId === l.assetId)) {
        next.delete(l.assetId)
      }
    }
    for (const [aid, blob] of draftAssets) next.set(aid, blob)

    const baked = await compositeTextureLayers(doc, next)
    const extActual = fileExtNoDotFromImageMime(baked.type)
    const entity = w0.entities.find((x) => x.id === eid)
    const stem =
      doc.editFamilyStem ?? sanitizeTextureStem((entity?.name ?? '').trim() || 'texture')
    const newAssetId = nextEditedTextureAssetKey(next.keys(), stem, extActual)
    next.set(newAssetId, baked)

    const oldComposite = doc.compositeAssetId
    const oldTexDoc = texDocAssetId(oldComposite)
    const oldLayerIds = doc.layers.map((l) => l.assetId)
    const worldAfter = {
      ...w0,
      entities: w0.entities.map((x) =>
        x.id === eid ? { ...x, material: { ...x.material, map: newAssetId } } : x,
      ),
    }
    for (const rid of [oldComposite, oldTexDoc, ...oldLayerIds]) {
      if (countWorldAssetReferences(worldAfter, rid) === 0) {
        next.delete(rid)
      }
    }

    await updateAssets(() => next)
    updateWorld(() => worldAfter)
    textureDocsRef.current.delete(eid)
    bumpTextureStudio()
    setTextureMakerEntityId(null)
    setTextureMakerLayerId(null)
    setTextureMakerRevertReady(false)
    setTextureMakerDraftDoc(null)
    setTextureMakerDraftAssets(null)
    textureMakerDraftDocRef.current = null
    textureMakerDraftAssetsRef.current = null
    requestAnimationFrame(() => {
      const ent = worldAssetsRef.current.world.entities.find((x) => x.id === eid)
      if (ent) void sceneViewRef.current?.updateEntityMaterial(eid, ent)
    })
  }, [
    textureMakerEntityId,
    pushHistory,
    updateAssets,
    updateWorld,
    bumpTextureStudio,
    worldAssetsRef,
    sceneViewRef,
  ])

  const handleTextureMakerMergeDown = useCallback(
    async (index: number) => {
      const eid = textureMakerEntityId
      if (!eid) return
      const doc = textureMakerDraftDocRef.current
      const draftAssets = textureMakerDraftAssetsRef.current
      if (!doc || !draftAssets || index < 1) return
      pushTextureMakerBeforeEdit()
      const result = await mergeLayerDown(doc, index, draftAssets)
      const nextAssets = new Map(draftAssets)
      nextAssets.set(result.bottomAssetId, result.mergedBlob)
      nextAssets.delete(result.removedTopAssetId)
      textureMakerDraftDocRef.current = result.doc
      textureMakerDraftAssetsRef.current = nextAssets
      setTextureMakerDraftDoc(result.doc)
      setTextureMakerDraftAssets(nextAssets)
      const removedTop = doc.layers[index]
      const cur = selectedLayerByEntityRef.current.get(eid)
      if (removedTop && cur === removedTop.id) {
        const newBottom = result.doc.layers[index - 1]
        if (newBottom) {
          selectedLayerByEntityRef.current.set(eid, newBottom.id)
          setTextureMakerLayerId(newBottom.id)
        }
      }
    },
    [pushTextureMakerBeforeEdit, textureMakerEntityId],
  )

  const handleTextureMakerStudioPaintStrokeEnd = useCallback(
    async (payload: TexturePaintStrokePayload) => {
      const doc = textureMakerDraftDocRef.current
      const draftAssets = textureMakerDraftAssetsRef.current
      if (!doc || !draftAssets) return
      if (!doc.layers.some((l) => l.assetId === payload.mapAssetId)) return
      const nextAssets = new Map(draftAssets)
      nextAssets.set(payload.mapAssetId, payload.newBlob)
      textureMakerDraftAssetsRef.current = nextAssets
      setTextureMakerDraftAssets(nextAssets)
    },
    [],
  )

  // ─── Derived values ───────────────────────────────────────────────────────
  const textureBrushDisabled = useMemo(() => {
    if (selectedEntityIds.length !== 1) return true
    const eid = selectedEntityIds[0]!
    const e = world.entities.find((x) => x.id === eid)
    if (!e) return true
    const mapId = e.material?.map
    if (!mapId) return false
    if (!assets.get(mapId)) return true
    void textureStudioTick
    if (isCompositeMaterialMap(mapId)) {
      const doc = textureDocsRef.current.get(eid)
      if (!doc || doc.layers.length === 0) return true
    }
    return false
  }, [selectedEntityIds, world.entities, assets, textureStudioTick])

  const textureMakerStacksActive =
    textureMakerEntityId != null &&
    textureMakerDraftDoc != null &&
    textureMakerDraftAssets != null

  const textureMakerDoc =
    textureMakerEntityId != null
      ? textureDocsRef.current.get(textureMakerEntityId) ?? null
      : null

  void textureMakerHistoryTick
  const canUndoTextureMaker =
    textureMakerStacksActive && textureMakerHistoryRef.current.canUndo()
  const canRedoTextureMaker =
    textureMakerStacksActive && textureMakerHistoryRef.current.canRedo()

  return {
    textureMakerEntityId,
    textureMakerLayerId,
    textureMakerDraftDoc,
    textureMakerDraftAssets,
    textureMakerRevertReady,
    compositePreviewUrl,
    textureMakerDoc,
    textureMakerStacksActive,
    textureMakerHistoryTick,
    canUndoTextureMaker,
    canRedoTextureMaker,
    textureBrushDisabled,
    textureDocsRef,
    textureStudioTick,
    activateTextureStudioForEntity,
    provisionBlankCompositeTextureIfMissing,
    getPaintTargetAssetId,
    prepareWorldPaintStroke,
    handleClose,
    handleUndo,
    handleRedo,
    handleTexturePaintStrokeEnd,
    handleTextureMakerSelectLayer,
    handleTextureMakerPatchLayer,
    handleTextureMakerResizeDocument,
    handleTextureMakerReorderLayer,
    handleTextureMakerRemoveLayer,
    handleTextureMakerAddEmptyLayer,
    handleTextureMakerImportLayer,
    handleTextureMakerRevertToOriginal,
    handleTextureMakerApply,
    handleTextureMakerMergeDown,
    handleTextureMakerStudioPaintStrokeEnd,
    pushTextureMakerBeforeEdit,
  }
}
