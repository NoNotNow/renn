import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import BuilderHeader from '@/components/BuilderHeader'
import PerformanceBoosterDialog from '@/components/PerformanceBoosterDialog'
import SaveDialog from '@/components/SaveDialog'
import EntitySidebar from '@/components/EntitySidebar'
import PropertySidebar from '@/components/PropertySidebar'
import { CopyProvider } from '@/contexts/CopyContext'
import { EditorUndoProvider, type EditorUndoApi } from '@/contexts/EditorUndoContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { cloneEntityFrom, createDefaultEntity, createBulkEntities, type AddableShapeType, type BulkEntityParams } from '@/data/entityDefaults'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { cycleCameraMode, DEFAULT_SCALE, type Vec3, type Rotation, type Entity, type TrimeshSimplificationConfig } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'
import type { TransformerConfig } from '@/types/transformer'
import {
  DEFAULT_TEXTURE_BRUSH_RGB,
  TEXTURE_BRUSH_RADIUS_MAX,
  TEXTURE_BRUSH_RADIUS_MIN,
  TEXTURE_PAINT_RADIUS_PX,
  type BuilderGizmoMode,
  type BuilderPoseCommitEntry,
  type TexturePaintStrokePayload,
} from '@/editor/transformGizmoController'
import { cloneEditorSnapshot, createEditorHistory, type EditorSnapshot } from '@/editor/editorHistory'
import { createTextureMakerHistory, type TextureMakerSnapshot } from '@/utils/textureMakerHistory'
import { downscaleImageBlob } from '@/utils/textureDownscale'
import { clampTrimeshSimplificationConfig } from '@/scripts/migrateWorld'
import {
  applyMeshSimplificationToEntityInWorld,
  persistSimplifiedMeshAssetFromWorld,
} from '@/utils/bakeSimplifiedModelAsset'
import {
  buildTextureDocument,
  compositeTextureLayers,
  createTransparentPngBlob,
  deserializeDoc,
  isCompositeMaterialMap,
  mergeLayerDown,
  readImageBitmapSize,
  removeLayerAt,
  reorderLayer,
  rasterizeBlobToDimensions,
  resizeTextureDocument,
  serializeDocToBlob,
  texDocAssetId,
  TEXTURE_NEW_DOCUMENT_DEFAULT_SIZE,
  TEXTURE_NEW_DOCUMENT_EDIT_FAMILY_STEM,
  type TextureDocument,
  type TextureLayer,
} from '@/utils/textureCompositor'
import { generateCompositeAssetId, generateTexLayerAssetId } from '@/utils/idGenerator'
import { resolvePaintStrokeWriteTarget, TEXTURE_LAYER_PREFIX } from '@/utils/paintAssetRouting'
import {
  countWorldAssetReferences,
  fileExtNoDotFromImageMime,
  inferEditFamilyFromMaterialMapId,
  nextEditedTextureAssetKey,
  sanitizeTextureStem,
} from '@/utils/textureAssetVersioning'
import TextureMaker from '@/components/TextureMaker/TextureMaker'

const EDITOR_HISTORY_MAX_DEPTH = 80

export default function Builder() {
  const {
    currentProject,
    world,
    assets,
    projects,
    version,
    newProject,
    loadProject,
    saveProject,
    saveProjectAs,
    saveToProject,
    deleteProject,
    refreshProjects,
    updateWorld,
    updateAssets,
    applyEditorSnapshot,
    documentEpoch,
    syncPosesFromScene,
    syncPosesToRefOnly,
    exportProject,
    copyWorldToClipboard,
    importProject,
    onFileChange,
    handlePlay,
    fileInputRef,
    cameraControl,
    cameraTarget,
    cameraMode,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
    editorFreePoseRef,
  } = useProjectContext()

  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])

  const handleSelectEntity = useCallback((id: string | null, options?: { additive?: boolean }) => {
    const additive = Boolean(options?.additive)
    setSelectedEntityIds((prev) => {
      if (id === null) return []
      if (!additive) return [id]
      const idx = prev.indexOf(id)
      if (idx >= 0) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
    if (id !== null) {
      uiLogger.click('Builder', 'Select entity', { entityId: id, additive })
    } else {
      uiLogger.click('Builder', 'Clear entity selection', {})
    }
  }, [])
  const [gizmoMode, setGizmoMode] = useState<BuilderGizmoMode>('translate')
  const [textureBrushRgb, setTextureBrushRgb] = useState<Vec3>(() => [...DEFAULT_TEXTURE_BRUSH_RGB])
  const [textureBrushAlpha, setTextureBrushAlpha] = useState(1)
  const [textureBrushRadiusPx, setTextureBrushRadiusPx] = useState(TEXTURE_PAINT_RADIUS_PX)
  const [shadowsEnabled, setShadowsEnabled] = useState(true)
  const [editNavigationMode, setEditNavigationMode] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [performanceBoosterOpen, setPerformanceBoosterOpen] = useState(false)
  const [perfPickMode, setPerfPickMode] = useState<'mesh' | 'texture' | null>(null)
  const [perfMeshEntityId, setPerfMeshEntityId] = useState<string | null>(null)
  const [perfTextureEntityId, setPerfTextureEntityId] = useState<string | null>(null)
  const [soundPlaybackCommand, setSoundPlaybackCommand] = useState<
    { action: 'play' | 'stop'; nonce: number } | null
  >(null)
  const [livePoses, setLivePoses] = useState<
    Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }> | null
  >(null)
  const sceneViewRef = useRef<SceneViewHandle>(null)
  const initialPosesRef = useRef<Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null>(null)
  const historyRef = useRef(createEditorHistory(EDITOR_HISTORY_MAX_DEPTH))
  const gestureSnapshotRef = useRef<EditorSnapshot | null>(null)
  const worldAssetsRef = useRef({ world, assets })
  worldAssetsRef.current = { world, assets }
  const [historyTick, setHistoryUi] = useState(0)
  const bumpHistoryUi = useCallback(() => setHistoryUi((n) => n + 1), [])
  const textureDocsRef = useRef<Map<string, TextureDocument>>(new Map())
  const selectedLayerByEntityRef = useRef<Map<string, string>>(new Map())
  const [textureStudioTick, setTextureStudioTick] = useState(0)
  const bumpTextureStudio = useCallback(() => setTextureStudioTick((t) => t + 1), [])
  const [textureMakerEntityId, setTextureMakerEntityId] = useState<string | null>(null)
  const [compositePreviewUrl, setCompositePreviewUrl] = useState<string | null>(null)
  /** Active layer for compositor paint + Texture Maker highlight. */
  const [textureMakerLayerId, setTextureMakerLayerId] = useState<string | null>(null)
  /** Snapshot when Texture Maker was opened (this session); used by Revert to original. */
  const textureMakerBaselineRef = useRef<{
    doc: TextureDocument
    blobs: Map<string, Blob>
  } | null>(null)
  const [textureMakerRevertReady, setTextureMakerRevertReady] = useState(false)

  /** Draft state for Texture Maker edits (preview only; final commit happens on Apply). */
  const [textureMakerDraftDoc, setTextureMakerDraftDoc] = useState<TextureDocument | null>(null)
  const [textureMakerDraftAssets, setTextureMakerDraftAssets] = useState<Map<string, Blob> | null>(null)
  const textureMakerDraftDocRef = useRef<TextureDocument | null>(null)
  const textureMakerDraftAssetsRef = useRef<Map<string, Blob> | null>(null)
  const textureMakerHistoryRef = useRef(createTextureMakerHistory(EDITOR_HISTORY_MAX_DEPTH))
  const textureMakerEntityIdRef = useRef<string | null>(null)
  const textureMakerLayerIdRef = useRef<string | null>(null)
  const [textureMakerHistoryTick, setTextureMakerHistoryUi] = useState(0)
  const bumpTextureMakerHistoryUi = useCallback(() => setTextureMakerHistoryUi((n) => n + 1), [])
  /** Dedupe concurrent async texture provisioning for the same entity (first 3D brush stroke). */
  const worldPaintPrepareRef = useRef<Map<string, Promise<{ mapAssetId: string; blob: Blob } | null>>>(
    new Map(),
  )

  useEffect(() => {
    textureMakerEntityIdRef.current = textureMakerEntityId
  }, [textureMakerEntityId])
  useEffect(() => {
    textureMakerLayerIdRef.current = textureMakerLayerId
  }, [textureMakerLayerId])

  useEffect(() => {
    historyRef.current.clear()
    textureMakerHistoryRef.current.clear()
    bumpHistoryUi()
    bumpTextureMakerHistoryUi()
  }, [documentEpoch, bumpHistoryUi, bumpTextureMakerHistoryUi])

  const pushHistory = useCallback(() => {
    const { world: w, assets: a } = worldAssetsRef.current
    historyRef.current.pushBeforeMutation(w, a)
    bumpHistoryUi()
  }, [bumpHistoryUi])

  const applyHistorySnapshot = useCallback(
    (snap: EditorSnapshot) => {
      initialPosesRef.current = null
      applyEditorSnapshot(snap)
      setSelectedEntityIds((ids) => ids.filter((id) => snap.world.entities.some((e) => e.id === id)))
      const nextCameraTarget =
        cameraTarget && snap.world.entities.some((e) => e.id === cameraTarget)
          ? cameraTarget
          : (snap.world.entities[0]?.id ?? '')
      setCameraTarget(nextCameraTarget)
      bumpHistoryUi()
    },
    [applyEditorSnapshot, bumpHistoryUi, cameraTarget, setCameraTarget]
  )

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
    const { world: w, assets: a } = worldAssetsRef.current
    const histPrev = historyRef.current.undo(w, a)
    if (histPrev) applyHistorySnapshot(histPrev)
  }, [applyHistorySnapshot, applyTextureMakerSnapshot])

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
    const { world: w, assets: a } = worldAssetsRef.current
    const histNext = historyRef.current.redo(w, a)
    if (histNext) applyHistorySnapshot(histNext)
  }, [applyHistorySnapshot, applyTextureMakerSnapshot])

  const editorUndoApi = useMemo<EditorUndoApi>(
    () => ({
      pushBeforeEdit: () => {
        pushHistory()
      },
      notifyScrubStart: () => {
        const { world: w, assets: a } = worldAssetsRef.current
        gestureSnapshotRef.current = cloneEditorSnapshot(w, a)
      },
      notifyScrubEnd: (hadScrub: boolean) => {
        if (hadScrub && gestureSnapshotRef.current) {
          historyRef.current.commitCoalescedGesture(gestureSnapshotRef.current)
          bumpHistoryUi()
        }
        gestureSnapshotRef.current = null
      },
    }),
    [pushHistory, bumpHistoryUi]
  )

  const persistTextureDoc = useCallback(
    async (
      entityId: string,
      doc: TextureDocument,
      patchAssets?: (next: Map<string, Blob>) => void,
    ) => {
      const prev = worldAssetsRef.current.assets
      const next = new Map(prev)
      patchAssets?.(next)
      const comp = await compositeTextureLayers(doc, next)
      next.set(doc.compositeAssetId, comp)
      next.set(texDocAssetId(doc.compositeAssetId), serializeDocToBlob(doc))
      await updateAssets(() => next)
      textureDocsRef.current.set(entityId, doc)
      bumpTextureStudio()
      requestAnimationFrame(() => {
        const ent = worldAssetsRef.current.world.entities.find((e) => e.id === entityId)
        if (ent) void sceneViewRef.current?.updateEntityMaterial(entityId, ent)
      })
    },
    [updateAssets, bumpTextureStudio],
  )

  /** Creates a blank 500×500 composite + sidecar when the entity has no `material.map`. Does not open Texture Maker. */
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
    [updateAssets, updateWorld, bumpTextureStudio],
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
    [pushHistory, updateAssets, updateWorld, bumpTextureStudio, provisionBlankCompositeTextureIfMissing],
  )

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
          /* ignore */
        }
      }
      if (!cancelled) bumpTextureStudio()
    })()
    return () => {
      cancelled = true
    }
  }, [world.entities, assets, bumpTextureStudio])

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
  }, [textureMakerEntityId, bumpTextureMakerHistoryUi])

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

  useEffect(() => {
    if (selectedEntityIds.length !== 1) {
      selectedLayerByEntityRef.current.clear()
      setTextureMakerLayerId(null)
      setTextureMakerEntityId(null)
    } else if (textureMakerEntityId != null && !selectedEntityIds.includes(textureMakerEntityId)) {
      setTextureMakerEntityId(null)
      setTextureMakerLayerId(null)
    }
  }, [selectedEntityIds, textureMakerEntityId])

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
    [textureStudioTick, textureMakerLayerId],
  )

  /** Ensures a paintable layer blob exists for the first 3D brush stroke on an untextured entity. */
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
    ],
  )

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
      patch: Partial<Pick<TextureLayer, 'opacity' | 'blendMode' | 'visible' | 'name' | 'dest'>>,
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
    [pushTextureMakerBeforeEdit, setTextureMakerDraftDoc],
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
    [pushTextureMakerBeforeEdit, setTextureMakerDraftDoc, setTextureMakerDraftAssets],
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
    [pushTextureMakerBeforeEdit, setTextureMakerDraftDoc],
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
    [pushTextureMakerBeforeEdit, textureMakerEntityId, setTextureMakerDraftAssets, setTextureMakerDraftDoc],
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
  }, [
    pushTextureMakerBeforeEdit,
    textureMakerEntityId,
    setTextureMakerDraftAssets,
    setTextureMakerDraftDoc,
  ])

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
    [pushTextureMakerBeforeEdit, textureMakerEntityId, setTextureMakerDraftAssets, setTextureMakerDraftDoc],
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
    for (const [id, blob] of baseline.blobs) {
      nextAssets.set(id, blob)
    }
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
  }, [textureMakerEntityId, pushHistory, updateAssets, updateWorld, bumpTextureStudio])

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
      const curSel = selectedLayerByEntityRef.current.get(eid)
      if (removedTop && curSel === removedTop.id) {
        const newBottom = result.doc.layers[index - 1]
        if (newBottom) {
          selectedLayerByEntityRef.current.set(eid, newBottom.id)
          setTextureMakerLayerId(newBottom.id)
        }
      }
    },
    [pushTextureMakerBeforeEdit, textureMakerEntityId, setTextureMakerDraftAssets, setTextureMakerDraftDoc],
  )

  /** Snapshot live registry poses so the next scene rebuild (entity add/remove/clone, etc.) does not reset physics-driven positions. */
  const captureScenePosesForNextRebuild = useCallback(() => {
    initialPosesRef.current = sceneViewRef.current?.getAllPoses() ?? null
  }, [])

  // Drawer states with localStorage persistence
  const [leftDrawerOpen, setLeftDrawerOpen] = useLocalStorageState('leftDrawerOpen', true)
  const [rightDrawerOpen, setRightDrawerOpen] = useLocalStorageState('rightDrawerOpen', true)
  const [showGameHud, setShowGameHud] = useLocalStorageState('builderShowGameHud', false)

  const sceneCameraConfig = useMemo(
    () => ({
      ...world.world.camera,
      control: cameraControl,
      target: cameraTarget,
      mode: cameraMode,
    }),
    [world.world.camera, cameraControl, cameraTarget, cameraMode]
  )

  useEffect(() => {
    const isEditableElement = (): boolean => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z') {
        if (isEditableElement()) return
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
        return
      }
      if (mod && e.key === 'y') {
        if (isEditableElement()) return
        e.preventDefault()
        handleRedo()
        return
      }
      if (e.key === 'Escape') {
        if (isEditableElement()) return
        e.preventDefault()
        setSelectedEntityIds([])
        return
      }
      if (mod && !e.shiftKey && e.code === 'KeyE') {
        if (isEditableElement()) return
        e.preventDefault()
        setEditNavigationMode((prev) => {
          const next = !prev
          uiLogger.change('Builder', 'Toggle edit navigation mode', { enabled: next })
          return next
        })
        return
      }
      if (e.code !== 'Digit0' && e.code !== 'Numpad0') return
      if (isEditableElement()) return
      e.preventDefault()
      setCameraMode((prev) => {
        const next = cycleCameraMode(prev)
        uiLogger.change('Builder', 'Change camera mode', { mode: next })
        return next
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setCameraMode, handleUndo, handleRedo, setSelectedEntityIds])

  const handleAddEntity = useCallback(
    (shapeType: AddableShapeType) => {
      pushHistory()
      const newEntity = createDefaultEntity(shapeType)
      uiLogger.select('Builder', 'Add entity', { shapeType, entityId: newEntity.id })
      captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, newEntity],
      }))
      setSelectedEntityIds([newEntity.id])
    },
    [updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleBulkAddEntities = useCallback(
    (params: BulkEntityParams) => {
      pushHistory()
      const newEntities = createBulkEntities(params)
      uiLogger.select('Builder', 'Bulk add entities', { 
        count: params.count, 
        shape: params.shape,
        bodyType: params.bodyType,
      })
      captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, ...newEntities],
      }))
      // Select the first created entity
      if (newEntities.length > 0) {
        setSelectedEntityIds([newEntities[0]!.id])
      }
    },
    [updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleDeleteEntities = useCallback(
    (entityIds: string[]) => {
      if (entityIds.length === 0) return
      const idSet = new Set(entityIds)
      const locked = entityIds.filter((id) => world.entities.find((e) => e.id === id)?.locked)
      if (locked.length > 0) {
        alert('Cannot delete: one or more selected entities are locked. Unlock them first.')
        return
      }
      pushHistory()
      captureScenePosesForNextRebuild()
      const newEntities = world.entities.filter((e) => !idSet.has(e.id))
      updateWorld((prev) => ({ ...prev, entities: newEntities }))
      setSelectedEntityIds((sel) => sel.filter((id) => !idSet.has(id)))
      if (cameraTarget && idSet.has(cameraTarget)) {
        setCameraTarget(newEntities[0]?.id ?? '')
      }
      uiLogger.delete('Builder', 'Delete entities', { entityIds, count: entityIds.length })
    },
    [world.entities, cameraTarget, updateWorld, setCameraTarget, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleGizmoModeChange = useCallback((mode: BuilderGizmoMode) => {
    setGizmoMode(mode)
    uiLogger.change('Builder', 'Gizmo mode', { mode })
  }, [])

  const handleEntityPoseCommit = useCallback(
    (commits: BuilderPoseCommitEntry[]) => {
      if (commits.length === 0) return
      pushHistory()
      for (const { entityId, pose } of commits) {
        sceneViewRef.current?.updateEntityPose(entityId, {
          position: pose.position,
          rotation: pose.rotation,
          scale: pose.scale,
        })
      }
      const byId = new Map(commits.map((c) => [c.entityId, c.pose] as const))
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => {
          const pose = byId.get(e.id)
          if (!pose) return e
          return {
            ...e,
            position: pose.position,
            rotation: pose.rotation,
            scale: pose.scale,
            ...(pose.shape !== undefined ? { shape: pose.shape } : {}),
            ...(pose.modelScale !== undefined ? { modelScale: pose.modelScale } : {}),
          }
        }),
      }))
      uiLogger.change('Builder', 'Gizmo pose commit', { count: commits.length, entityIds: commits.map((c) => c.entityId) })
    },
    [updateWorld, pushHistory]
  )

  const handleNew = useCallback(() => {
    if (currentProject.isDirty && !confirm('Discard unsaved changes?')) return
    newProject()
  }, [currentProject.isDirty, newProject])

  const handleOpen = useCallback(
    (id: string) => {
      if (currentProject.isDirty && !confirm('Discard unsaved changes?')) return
      loadProject(id)
    },
    [currentProject.isDirty, loadProject]
  )

  const handleReload = useCallback(() => {
    if (!currentProject.id) return
    if (currentProject.isDirty && !confirm('Discard unsaved changes and reload from storage?')) return
    loadProject(currentProject.id)
  }, [currentProject.id, currentProject.isDirty, loadProject])

  const getCurrentPose = useCallback(
    (id: string): { position: Vec3; rotation: Rotation; scale: Vec3 } => {
      const reg = sceneViewRef.current?.getAllPoses()
      const savedPose = reg?.get(id)
      if (savedPose) return savedPose
      const entity = world.entities.find((e) => e.id === id)
      return {
        position: entity?.position ?? [0, 0, 0],
        rotation: entity?.rotation ?? [0, 0, 0],
        scale: entity?.scale ?? DEFAULT_SCALE,
      }
    },
    [world.entities]
  )

  const handleCloneEntity = useCallback(
    (entityId: string) => {
      pushHistory()
      const source = world.entities.find((e) => e.id === entityId)
      if (!source) return
      const pose = getCurrentPose(entityId)
      const cloned = cloneEntityFrom(source, pose)
      uiLogger.click('Builder', 'Clone entity', { sourceId: entityId, newId: cloned.id })
      captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: [...prev.entities, cloned],
      }))
      setSelectedEntityIds([cloned.id])
    },
    [world.entities, getCurrentPose, updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleEntityPoseChange = useCallback(
    (ids: string[], pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => {
      for (const id of ids) {
        sceneViewRef.current?.updateEntityPose(id, pose)
      }
    },
    []
  )

  const handleEntityPhysicsChange = useCallback((ids: string[], patch: Partial<Entity>) => {
    for (const id of ids) {
      sceneViewRef.current?.updateEntityPhysics(id, patch)
    }
    const idSet = new Set(ids)
    updateWorld((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
    }))
  }, [updateWorld])

  const handleEntityMaterialChange = useCallback((ids: string[], patch: Partial<Entity>) => {
    for (const id of ids) {
      const base = world.entities.find((e) => e.id === id)
      if (base) void sceneViewRef.current?.updateEntityMaterial(id, { ...base, ...patch })
    }
    const idSet = new Set(ids)
    updateWorld((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
    }))
  }, [world.entities, updateWorld])

  const handleEntityShapeChange = useCallback(
    (ids: string[], patch: Partial<Entity>) => {
      let needRebuild = false
      for (const id of ids) {
        const updatedEntity = { ...world.entities.find((e) => e.id === id)!, ...patch }
        const applied = sceneViewRef.current?.updateEntityShape(id, updatedEntity) ?? false
        if (!applied) needRebuild = true
      }
      const idSet = new Set(ids)
      if (needRebuild) captureScenePosesForNextRebuild()
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
      }))
    },
    [world.entities, updateWorld, captureScenePosesForNextRebuild]
  )

  const handleEntityModelTransformChange = useCallback(
    (ids: string[], patch: { modelRotation?: [number, number, number]; modelScale?: [number, number, number] }) => {
      for (const id of ids) {
        sceneViewRef.current?.updateEntityModelTransform(id, patch)
      }
      const idSet = new Set(ids)
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => (idSet.has(e.id) ? { ...e, ...patch } : e)),
      }))
    },
    [updateWorld]
  )

  const handleRefreshFromPhysics = useCallback(
    (entityIds: string[]) => {
      const m = new Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }>()
      for (const id of entityIds) {
        m.set(id, getCurrentPose(id))
      }
      syncPosesFromScene(m)
    },
    [getCurrentPose, syncPosesFromScene]
  )

  const handleWorldChange = useCallback((newWorld: typeof world) => {
    captureScenePosesForNextRebuild()
    updateWorld(() => newWorld)
  }, [updateWorld, captureScenePosesForNextRebuild])

  const handleEntityTransformersChange = useCallback(
    (entityIds: string[], transformers: TransformerConfig[]) => {
      pushHistory()
      const idSet = new Set(entityIds)
      const nextEntities = world.entities.map((e) =>
        idSet.has(e.id) ? { ...e, transformers } : e
      )
      const nextWorld = { ...world, entities: nextEntities }
      const keyBefore = getSceneDependencyKey(world)
      const keyAfter = getSceneDependencyKey(nextWorld)
      if (keyBefore !== keyAfter) {
        captureScenePosesForNextRebuild()
      }
      updateWorld(() => nextWorld)
      if (keyBefore === keyAfter) {
        for (const id of entityIds) {
          sceneViewRef.current?.syncEntityTransformers(id, transformers)
        }
      }
    },
    [world, updateWorld, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleAssetsChange = useCallback((newAssets: typeof assets) => {
    updateAssets(() => newAssets)
  }, [updateAssets])

  // Poll scene poses so the inspector stays in sync with physics/scripts (display only; never calls onWorldChange).
  // ~220ms limits wakeups vs 100ms while keeping labels usable (see agent-context/performance-work.md §8).
  useEffect(() => {
    const interval = setInterval(() => {
      const poses = sceneViewRef.current?.getAllPoses() ?? null
      if (poses && poses.size > 0) {
        setLivePoses(poses)
      }
    }, 220)
    return () => clearInterval(interval)
  }, [])

  // Warn before leaving if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (currentProject.isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [currentProject.isDirty])

  const syncPosesThen = useCallback(
    async (fn: () => Promise<void>) => {
      const allPoses = sceneViewRef.current?.getAllPoses()
      if (allPoses) {
        syncPosesToRefOnly(allPoses)
        await fn()
        syncPosesFromScene(allPoses)
      } else {
        await fn()
      }
    },
    [syncPosesFromScene, syncPosesToRefOnly]
  )

  const handleSave = useCallback(async () => {
    if (!currentProject.id) {
      setShowSaveDialog(true)
      return
    }
    await syncPosesThen(saveProject)
  }, [currentProject.id, syncPosesThen, saveProject])

  const handleSaveAs = useCallback(() => {
    setShowSaveDialog(true)
  }, [])

  const handleSaveDialogSaveNew = useCallback(
    async (name: string) => {
      await syncPosesThen(() => saveProjectAs(name))
      setShowSaveDialog(false)
    },
    [syncPosesThen, saveProjectAs]
  )

  const handleSaveDialogOverwrite = useCallback(
    async (id: string) => {
      await syncPosesThen(() => saveToProject(id))
      setShowSaveDialog(false)
    },
    [syncPosesThen, saveToProject]
  )

  const saveDialogDefaultName =
    currentProject.name !== 'Untitled' ? currentProject.name : `World ${projects.length + 1}`

  const handleResetCamera = useCallback(() => {
    sceneViewRef.current?.resetCamera()
    updateWorld((prev) => {
      const prevCam = prev.world.camera
      if (!prevCam) return prev
      const { editorFreePose: _removed, ...rest } = prevCam
      return {
        ...prev,
        world: { ...prev.world, camera: rest },
      }
    })
    uiLogger.click('Builder', 'Reset camera to default position')
  }, [updateWorld])

  const handleApplyDebugForce = useCallback(
    (force: Vec3) => {
      if (selectedEntityIds.length === 0) {
        alert('Bitte wähle zuerst ein oder mehrere Entities aus, um eine Force anzuwenden.')
        return
      }
      const nonDynamic: string[] = []
      for (const id of selectedEntityIds) {
        const entity = world.entities.find((e) => e.id === id)
        if (!entity) continue
        if (entity.bodyType !== 'dynamic') {
          nonDynamic.push(entity.name ?? id)
          continue
        }
        sceneViewRef.current?.applyDebugForce(id, force, 1.0)
      }
      if (nonDynamic.length > 0 && nonDynamic.length === selectedEntityIds.length) {
        alert(`Kein dynamic Entity in der Auswahl. Nicht-dynamic: ${nonDynamic.join(', ')}`)
        return
      }
      if (nonDynamic.length > 0) {
        alert(`Force auf dynamic Entities angewendet. Übersprungen (nicht dynamic): ${nonDynamic.join(', ')}`)
      }
      uiLogger.click('Builder', 'Apply debug force', {
        entityIds: selectedEntityIds,
        force,
        duration: 1.0,
      })
    },
    [selectedEntityIds, world.entities]
  )

  const handleApplyMeshSimplification = useCallback(
    async (entityId: string, config: TrimeshSimplificationConfig) => {
      const safe = clampTrimeshSimplificationConfig({ ...config, enabled: true })
      pushHistory()
      captureScenePosesForNextRebuild()
      const nextWorld = applyMeshSimplificationToEntityInWorld(world, entityId, safe)
      updateWorld(() => nextWorld)
      try {
        const result = await persistSimplifiedMeshAssetFromWorld(nextWorld, assets, entityId)
        if (!result.ok) {
          if (result.reason === 'bake-unchanged') {
            console.warn(
              '[PerformanceBooster] Bake produced unchanged geometry; simplification config kept on entity'
            )
          }
          return
        }
        await updateAssets(() => result.assets)
        updateWorld(() => result.world)
      } catch (err) {
        console.error('[PerformanceBooster] Failed to persist simplified mesh', err)
        alert('Failed to bake simplified mesh to assets. Simplification settings remain.')
      }
    },
    [world, assets, updateWorld, updateAssets, captureScenePosesForNextRebuild, pushHistory]
  )

  const handleApplyTextureDownscale = useCallback(
    async (entityId: string, maxEdgePx: number) => {
      const entity = world.entities.find((e) => e.id === entityId)
      const mapId = entity?.material?.map
      if (!mapId) throw new Error('No texture on entity')
      const blob = assets.get(mapId)
      if (!blob) throw new Error('Texture asset missing')
      const newBlob = await downscaleImageBlob(blob, maxEdgePx)
      pushHistory()
      await updateAssets((prev) => {
        const next = new Map(prev)
        next.set(mapId, newBlob)
        return next
      })
    },
    [world.entities, assets, updateAssets, pushHistory]
  )

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
            const entity = worldAssetsRef.current.world.entities.find((e) => e.id === payload.entityId)
            if (entity) void sceneViewRef.current?.updateEntityMaterial(payload.entityId, entity)
          })
          return
        }
      }

      const { writeAssetId, entityShouldPointToWriteId } = resolvePaintStrokeWriteTarget(payload.mapAssetId)
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
              ? {
                  ...e,
                  material: { ...e.material, map: writeAssetId },
                }
              : e,
          ),
        }))
      }
      requestAnimationFrame(() => {
        const entity = worldAssetsRef.current.world.entities.find((e) => e.id === payload.entityId)
        if (entity) void sceneViewRef.current?.updateEntityMaterial(payload.entityId, entity)
      })
    },
    [updateAssets, updateWorld, bumpTextureStudio],
  )

  const handleTextureMakerStudioPaintStrokeEnd = useCallback(
    async (payload: TexturePaintStrokePayload) => {
      // Texture Maker edits are draft-only: update the draft layer raster(s) but do not composite/apply to the entity.
      const doc = textureMakerDraftDocRef.current
      const draftAssets = textureMakerDraftAssetsRef.current
      if (!doc || !draftAssets) return
      if (!doc.layers.some((l) => l.assetId === payload.mapAssetId)) return
      const nextAssets = new Map(draftAssets)
      nextAssets.set(payload.mapAssetId, payload.newBlob)
      textureMakerDraftAssetsRef.current = nextAssets
      setTextureMakerDraftAssets(nextAssets)
    },
    [setTextureMakerDraftAssets],
  )

  const handleTextureBrushRadiusPxChange = useCallback((px: number) => {
    const n = Math.round(px)
    if (!Number.isFinite(n)) return
    setTextureBrushRadiusPx(Math.min(TEXTURE_BRUSH_RADIUS_MAX, Math.max(TEXTURE_BRUSH_RADIUS_MIN, n)))
  }, [])

  const handleTextureBrushAlphaChange = useCallback((a: number) => {
    if (!Number.isFinite(a)) return
    setTextureBrushAlpha(Math.min(1, Math.max(0, a)))
  }, [])

  const textureBrushDisabled = useMemo(() => {
    if (selectedEntityIds.length !== 1) return true
    const eid = selectedEntityIds[0]!
    const e = world.entities.find((x) => x.id === eid)
    if (!e) return true
    const mapId = e.material?.map
    // No map yet: still enable paint tool so the brush popover (e.g. Open texture maker) is available;
    // 3D viewport painting starts once material.map exists.
    if (!mapId) return false
    if (!assets.get(mapId)) return true
    void textureStudioTick
    if (isCompositeMaterialMap(mapId)) {
      const doc = textureDocsRef.current.get(eid)
      if (!doc || doc.layers.length === 0) return true
    }
    return false
  }, [selectedEntityIds, world.entities, assets, textureStudioTick])

  useEffect(() => {
    if (gizmoMode === 'paint' && textureBrushDisabled) {
      setGizmoMode('translate')
    }
  }, [gizmoMode, textureBrushDisabled])

  void historyTick
  void textureMakerHistoryTick
  const textureMakerStacksActive =
    textureMakerEntityId != null && textureMakerDraftDoc != null && textureMakerDraftAssets != null
  const canUndoHistory =
    (textureMakerStacksActive && textureMakerHistoryRef.current.canUndo()) ||
    historyRef.current.canUndo()
  const canRedoHistory =
    (textureMakerStacksActive && textureMakerHistoryRef.current.canRedo()) ||
    historyRef.current.canRedo()

  const textureMakerDoc =
    textureMakerEntityId != null ? textureDocsRef.current.get(textureMakerEntityId) ?? null : null

  const onOpenTextureStudioFromToolbar =
    selectedEntityIds.length === 1
      ? () => {
          const id = selectedEntityIds[0]!
          void activateTextureStudioForEntity(id)
        }
      : undefined

  return (
    <EditorUndoProvider value={editorUndoApi}>
    <CopyProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <BuilderHeader
        projects={projects}
        onLeftSidebarToggle={() => setLeftDrawerOpen((prev) => !prev)}
        currentProject={currentProject}
        gizmoMode={gizmoMode}
        onGizmoModeChange={handleGizmoModeChange}
        textureBrushDisabled={textureBrushDisabled}
        textureBrushColorHex={colorToHex(textureBrushRgb)}
        onTextureBrushColorHexChange={(hex) => setTextureBrushRgb(hexToColor(hex))}
        textureBrushAlpha={textureBrushAlpha}
        onTextureBrushAlphaChange={handleTextureBrushAlphaChange}
        textureBrushRadiusPx={textureBrushRadiusPx}
        onTextureBrushRadiusPxChange={handleTextureBrushRadiusPxChange}
        shadowsEnabled={shadowsEnabled}
        onNew={handleNew}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExport={exportProject}
        onCopyWorld={copyWorldToClipboard}
        onImport={importProject}
        onOpen={handleOpen}
        onRefresh={refreshProjects}
        onReload={handleReload}
        onDeleteProject={deleteProject}
        onPlay={handlePlay}
        onShadowsChange={setShadowsEnabled}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        onResetCamera={handleResetCamera}
        onApplyDebugForce={handleApplyDebugForce}
        canUndo={canUndoHistory}
        canRedo={canRedoHistory}
        onUndo={handleUndo}
        onRedo={handleRedo}
        editNavigationMode={editNavigationMode}
        onEditNavigationModeToggle={() => {
          setEditNavigationMode((prev) => {
            const next = !prev
            uiLogger.click('Builder', 'Toggle edit navigation mode (menu)', { enabled: next })
            return next
          })
        }}
        showGameHud={showGameHud}
        onGameHudToggle={() => {
          setShowGameHud((prev) => {
            const next = !prev
            uiLogger.click('Builder', 'Toggle game HUD (menu)', { enabled: next })
            return next
          })
        }}
        onOpenPerformanceBooster={() => {
          setPerformanceBoosterOpen(true)
          uiLogger.click('Builder', 'Open Performance booster', {})
        }}
        onOpenTextureStudio={onOpenTextureStudioFromToolbar}
      />

      {showSaveDialog && (
        <SaveDialog
          projects={projects}
          defaultName={saveDialogDefaultName}
          onSaveNew={handleSaveDialogSaveNew}
          onOverwrite={handleSaveDialogOverwrite}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}

      <PerformanceBoosterDialog
        isOpen={performanceBoosterOpen}
        onClose={() => {
          setPerformanceBoosterOpen(false)
          setPerfPickMode(null)
          setPerfMeshEntityId(null)
          setPerfTextureEntityId(null)
        }}
        world={world}
        assets={assets}
        sceneViewRef={sceneViewRef}
        sceneVersion={version}
        meshTargetEntityId={perfMeshEntityId}
        textureTargetEntityId={perfTextureEntityId}
        onMeshTargetSelected={setPerfMeshEntityId}
        onTextureTargetSelected={setPerfTextureEntityId}
        onRequestPickMesh={() => setPerfPickMode('mesh')}
        onRequestPickTexture={() => setPerfPickMode('texture')}
        onApplyMesh={handleApplyMeshSimplification}
        onApplyTexture={handleApplyTextureDownscale}
      />

      <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
        {editNavigationMode && (
          <div
            role="status"
            aria-label="Edit-Modus aktiv"
            title="Edit-Modus: Navigation"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 200,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#e11d48',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Canvas takes full width */}
        <main style={{ width: '100%', height: '100%' }}>
          <ErrorBoundary
            fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#171a22', color: '#e6e9f2' }}>
                <div style={{ textAlign: 'center' }}>
                  <h2>Scene Error</h2>
                  <p>The 3D scene encountered an error. Try reloading the project.</p>
                </div>
              </div>
            }
          >
            <SceneView
              ref={sceneViewRef}
              world={world}
              cameraConfig={sceneCameraConfig}
              assets={assets}
              version={version}
              runPhysics
              runScripts
              shadowsEnabled={shadowsEnabled}
              selectedEntityIds={selectedEntityIds}
              onSelectEntity={handleSelectEntity}
              onEntityPoseCommit={handleEntityPoseCommit}
              gizmoMode={gizmoMode}
              initialPosesRef={initialPosesRef}
              onPosesRestored={syncPosesFromScene}
              editNavigationMode={editNavigationMode}
              editorFreePoseRef={editorFreePoseRef}
              soundPlaybackCommand={soundPlaybackCommand}
              performancePick={
                perfPickMode
                  ? {
                      mode: perfPickMode,
                      onEntityPicked: (id: string) => {
                        if (perfPickMode === 'mesh') setPerfMeshEntityId(id)
                        if (perfPickMode === 'texture') setPerfTextureEntityId(id)
                        setPerfPickMode(null)
                      },
                    }
                  : null
              }
              showGameHud={showGameHud}
              onCurrentAvatarChange={(id) => {
                if (id) setCameraTarget(id)
              }}
              onTexturePaintStrokeEnd={handleTexturePaintStrokeEnd}
              pushUndoBeforePaintStroke={() => editorUndoApi.pushBeforeEdit()}
              textureBrushRgb={textureBrushRgb}
              textureBrushAlpha={textureBrushAlpha}
              textureBrushRadiusPx={textureBrushRadiusPx}
              getPaintTargetAssetId={getPaintTargetAssetId}
              prepareWorldPaintStroke={prepareWorldPaintStroke}
            />
          </ErrorBoundary>
        </main>

        {/* Sidebars overlay on top */}
        <EntitySidebar
          entities={world.entities}
          selectedEntityIds={selectedEntityIds}
          cameraControl={cameraControl}
          cameraTarget={cameraTarget}
          cameraMode={cameraMode}
          world={world}
          onSelectEntity={handleSelectEntity}
          onAddEntity={handleAddEntity}
          onBulkAddEntities={handleBulkAddEntities}
          onCameraControlChange={setCameraControl}
          onCameraTargetChange={setCameraTarget}
          onCameraModeChange={setCameraMode}
          onWorldChange={handleWorldChange}
          onSoundPlaybackCommand={(action) =>
            setSoundPlaybackCommand({ action, nonce: Date.now() + Math.random() })
          }
          getAvatarFocusSnapshot={() => sceneViewRef.current?.getAvatarFocusSnapshot() ?? null}
          isOpen={leftDrawerOpen}
          onToggle={() => setLeftDrawerOpen(!leftDrawerOpen)}
        />

        <PropertySidebar
          world={world}
          assets={assets}
          selectedEntityIds={selectedEntityIds}
          onWorldChange={handleWorldChange}
          onAssetsChange={handleAssetsChange}
          onDeleteEntities={handleDeleteEntities}
          onCloneEntity={handleCloneEntity}
          onEntityPoseChange={handleEntityPoseChange}
          onEntityPhysicsChange={handleEntityPhysicsChange}
          onEntityMaterialChange={handleEntityMaterialChange}
          onEntityShapeChange={handleEntityShapeChange}
          onEntityModelTransformChange={handleEntityModelTransformChange}
          onEntityTransformersChange={handleEntityTransformersChange}
          onRefreshFromPhysics={handleRefreshFromPhysics}
          livePoses={livePoses}
          isOpen={rightDrawerOpen}
          onToggle={() => setRightDrawerOpen(!rightDrawerOpen)}
          onOpenTextureStudio={activateTextureStudioForEntity}
        />

        {textureMakerEntityId && textureMakerDoc ? (
          <TextureMaker
            entityId={textureMakerEntityId}
            doc={textureMakerDraftDoc ?? textureMakerDoc}
            compositePreviewUrl={compositePreviewUrl}
            selectedLayerId={textureMakerLayerId}
            onClose={() => {
              textureMakerHistoryRef.current.clear()
              bumpTextureMakerHistoryUi()
              setTextureMakerEntityId(null)
              setTextureMakerLayerId(null)
              setTextureMakerRevertReady(false)
              setTextureMakerDraftDoc(null)
              setTextureMakerDraftAssets(null)
              textureMakerDraftDocRef.current = null
              textureMakerDraftAssetsRef.current = null
            }}
            revertToOriginalAvailable={textureMakerRevertReady}
            onRevertToOriginal={handleTextureMakerRevertToOriginal}
            onApplyTextureMaker={() => void handleTextureMakerApply()}
            onSelectLayer={handleTextureMakerSelectLayer}
            onPatchLayer={handleTextureMakerPatchLayer}
            onReorderLayer={handleTextureMakerReorderLayer}
            onRemoveLayer={handleTextureMakerRemoveLayer}
            onAddEmptyLayer={handleTextureMakerAddEmptyLayer}
            onImportLayer={handleTextureMakerImportLayer}
            onMergeDown={handleTextureMakerMergeDown}
            onResizeDocument={handleTextureMakerResizeDocument}
            textureBrushRgb={textureBrushRgb}
            textureBrushAlpha={textureBrushAlpha}
            textureBrushRadiusPx={textureBrushRadiusPx}
            onTextureBrushColorHexChange={(hex) => setTextureBrushRgb(hexToColor(hex))}
            onTextureBrushAlphaChange={setTextureBrushAlpha}
            onTextureBrushRadiusPxChange={setTextureBrushRadiusPx}
            studioAssets={textureMakerDraftAssets ?? assets}
            pushUndoBeforePaintStroke={pushTextureMakerBeforeEdit}
            onStudioPaintStrokeEnd={handleTextureMakerStudioPaintStrokeEnd}
          />
        ) : null}
      </div>
    </div>
    </CopyProvider>
    </EditorUndoProvider>
  )
}
