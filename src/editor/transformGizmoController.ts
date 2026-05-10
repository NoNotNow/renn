import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { findEntityRootForPicking } from '@/utils/entityPicking'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { Entity, Rotation, Shape, Vec3 } from '@/types/world'
import { quaternionToEuler } from '@/utils/rotationUtils'
import { stripVisualBase } from '@/utils/visualBaseQuaternion'
import { paintTextureBlob } from '@/utils/texturePaint'

const _gizmoScratchQuat = new THREE.Quaternion()

/** Floor for each scale axis while dragging; matches rapierPhysics tolerances (~1e-4). */
export const GIZMO_MIN_AXIS_SCALE = 1e-4

export const BUILDER_SELECTION_PIVOT_NAME = '__builder_selection_pivot__'

/**
 * World-space centroid of selected entities that are unlocked and have a registry pose.
 * Matches the multi-select gizmo pivot (one entity → its position).
 */
export function averageUnlockedSelectionWorldPosition(
  reg: RenderItemRegistry | null,
  selectedIds: readonly string[],
  getEntity: (id: string) => Entity | undefined,
): Vec3 | null {
  if (!reg || selectedIds.length === 0) return null
  let sx = 0
  let sy = 0
  let sz = 0
  let n = 0
  for (const id of selectedIds) {
    const e = getEntity(id)
    if (!e || e.locked) continue
    const pos = reg.getPosition(id)
    if (!pos) continue
    sx += pos[0]
    sy += pos[1]
    sz += pos[2]
    n += 1
  }
  if (n === 0) return null
  return [sx / n, sy / n, sz / n]
}

export function clampGizmoScaleAxes(x: number, y: number, z: number): Vec3 {
  return [
    Math.max(GIZMO_MIN_AXIS_SCALE, x),
    Math.max(GIZMO_MIN_AXIS_SCALE, y),
    Math.max(GIZMO_MIN_AXIS_SCALE, z),
  ]
}

function logicalRotationFromMeshWorldQuaternion(mesh: THREE.Mesh, worldQuat: THREE.Quaternion): Rotation {
  return quaternionToEuler(stripVisualBase(worldQuat, mesh, _gizmoScratchQuat))
}

export type BuilderGizmoMode = 'translate' | 'rotate' | 'scale' | 'paint' | 'visualize'

/**
 * World-space width for the variable overlay bar group (scale of columns + bar height mapping).
 */
export const BUILDER_VARIABLE_OVERLAY_GROUP_WIDTH = 3

/** Default brush radius in texture pixels (Builder paint tool). */
export const TEXTURE_PAINT_RADIUS_PX = 6

/** Min/max brush radius in texture pixels (Builder UI slider). */
export const TEXTURE_BRUSH_RADIUS_MIN = 1
export const TEXTURE_BRUSH_RADIUS_MAX = 800

/** Default brush RGBA when no `getBrushRgba` is provided (matches legacy default). */
export const DEFAULT_TEXTURE_BRUSH_RGBA: readonly [number, number, number, number] = [0.12, 0.12, 0.14, 1]

/** Default brush RGB (0–1) for Builder UI / SceneView prop. */
export const DEFAULT_TEXTURE_BRUSH_RGB: Vec3 = [0.12, 0.12, 0.14]

export interface TexturePaintStrokePayload {
  entityId: string
  mapAssetId: string
  newBlob: Blob
}

export interface BuilderPoseCommit {
  position: Vec3
  rotation: Rotation
  scale: Vec3
  /** Present after scale gizmo bake or when syncing from registry; updates world document shape. */
  shape?: Shape
  modelScale?: Vec3
}

export interface BuilderPoseCommitEntry {
  entityId: string
  pose: BuilderPoseCommit
}

export interface InstallBuilderPickAndGizmoParams {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  getRegistry: () => RenderItemRegistry | null
  getEntity: (id: string) => Entity | undefined
  getSelectedIds: () => string[]
  getGizmoMode: () => BuilderGizmoMode
  onSelectEntity: (id: string | null, options?: { additive?: boolean }) => void
  onPoseCommit: (commits: BuilderPoseCommitEntry[]) => void
  /** Set true while user drags a gizmo handle (for camera orbit gating). */
  setGizmoDragging: (dragging: boolean) => void
  /** When set, brush mode can paint albedo textures on the selected entity. */
  texturePaint?: {
    getAssets: () => Map<string, Blob>
    /** RGBA in 0–1 (alpha from Builder brush opacity). */
    getBrushRgba: () => readonly [number, number, number, number]
    /** Texture-space radius in pixels; clamped to [TEXTURE_BRUSH_RADIUS_MIN, TEXTURE_BRUSH_RADIUS_MAX]. */
    getBrushRadiusPx?: () => number
    /** When set (e.g. layer compositor), paint this asset id instead of `entity.material.map`. */
    getPaintTargetAssetId?: (entityId: string) => string | null
    /**
     * When no paintable blob exists yet (e.g. no `material.map`), create a default composite texture
     * and return the layer asset + blob to paint. Used for first 3D brush stroke on an untextured entity.
     */
    prepareWorldPaintStroke?: (entityId: string) => Promise<{ mapAssetId: string; blob: Blob } | null>
    pushUndoBeforePaintStroke: () => void
    onStrokeEnd: (payload: TexturePaintStrokePayload) => void | Promise<void>
  }
}

type MultiDragState = {
  pivotStartWorld: THREE.Matrix4
  meshStartWorld: Map<string, THREE.Matrix4>
  ids: string[]
}

/**
 * Installs TransformControls (translate / rotate / scale) and click-to-select on the canvas.
 * Selection listener is registered after TransformControls.connect() so pointerdown on handles
 * sets dragging before selection runs.
 */
export function installBuilderPickAndGizmo(
  p: InstallBuilderPickAndGizmoParams
): { dispose: () => void; syncAttach: () => void } {
  const controls = new TransformControls(p.camera, p.domElement)
  controls.setMode('translate')
  /** Align gizmo axes with the attached object (single selection only). */
  controls.setSpace('local')

  const helper = controls.getHelper()
  p.scene.add(helper)

  const pivot = new THREE.Group()
  pivot.name = BUILDER_SELECTION_PIVOT_NAME
  p.scene.add(pivot)

  const getEntityMeshes = (): THREE.Object3D[] =>
    p.scene.children.filter((o) => o.userData?.entityId != null)

  const getGizmoTargetIds = (): string[] =>
    p.getSelectedIds().filter((id) => {
      const e = p.getEntity(id)
      return Boolean(e && !e.locked)
    })

  const ndc = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const deltaMat = new THREE.Matrix4()
  const invPivotStart = new THREE.Matrix4()
  const decompPos = new THREE.Vector3()
  const decompQuat = new THREE.Quaternion()
  const decompScale = new THREE.Vector3()

  let multiDragState: MultiDragState | null = null

  type PaintStrokeState = {
    pointerId: number
    entityId: string
    mapAssetId: string
    workingBlob: Blob
  }
  let paintStroke: PaintStrokeState | null = null
  let pendingPaintUv: { u: number; v: number } | null = null
  let paintFlushRaf = 0

  const setNdcFromEvent = (e: PointerEvent): void => {
    const rect = p.domElement.getBoundingClientRect()
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  const mirrorAttachedPoseToRegistry = (): void => {
    const obj = controls.object
    if (!(obj instanceof THREE.Mesh)) return
    const id = obj.name
    const reg = p.getRegistry()
    if (!id || !reg) return
    const item = reg.get(id)
    if (!item) return
    const mode = p.getGizmoMode()
    if (mode === 'paint' || mode === 'visualize') return
    if (mode === 'scale') {
      const [sx, sy, sz] = clampGizmoScaleAxes(obj.scale.x, obj.scale.y, obj.scale.z)
      if (sx !== obj.scale.x || sy !== obj.scale.y || sz !== obj.scale.z) {
        obj.scale.set(sx, sy, sz)
      }
      reg.patchScale(id, [sx, sy, sz])
    } else {
      reg.setPosition(id, [obj.position.x, obj.position.y, obj.position.z])
      reg.setRotation(id, item.getRotation())
    }
  }

  const applyMultiTransformToRegistry = (): void => {
    if (!multiDragState) return
    const reg = p.getRegistry()
    if (!reg) return
    pivot.updateMatrixWorld(true)
    const pCurr = pivot.matrixWorld
    invPivotStart.copy(multiDragState.pivotStartWorld).invert()
    deltaMat.copy(pCurr).multiply(invPivotStart)

    for (const id of multiDragState.ids) {
      const m0 = multiDragState.meshStartWorld.get(id)
      if (!m0) continue
      const m1 = new THREE.Matrix4().copy(deltaMat).multiply(m0)
      m1.decompose(decompPos, decompQuat, decompScale)
      const mesh = p.scene.getObjectByName(id)
      if (!(mesh instanceof THREE.Mesh)) continue
      reg.setPosition(id, [decompPos.x, decompPos.y, decompPos.z])
      reg.setRotation(id, logicalRotationFromMeshWorldQuaternion(mesh, decompQuat))
      const [sx, sy, sz] = clampGizmoScaleAxes(decompScale.x, decompScale.y, decompScale.z)
      reg.patchScale(id, [sx, sy, sz])
    }
  }

  const syncAttach = (): void => {
    const mode = p.getGizmoMode()
    if (mode === 'paint' || mode === 'visualize') {
      controls.detach()
      return
    }

    const targetIds = getGizmoTargetIds()
    if (targetIds.length === 0) {
      controls.detach()
      return
    }

    if (targetIds.length === 1) {
      const id = targetIds[0]!
      const obj = p.scene.getObjectByName(id)
      if (obj instanceof THREE.Mesh) {
        const gizmoMode = p.getGizmoMode()
        if (gizmoMode === 'translate' || gizmoMode === 'rotate' || gizmoMode === 'scale') {
          controls.setMode(gizmoMode)
        }
        controls.setSpace('local')
        if (controls.object !== obj) {
          controls.attach(obj)
        }
      } else {
        controls.detach()
      }
      return
    }

    // Multi: pivot at average position, world-space gizmo
    const reg = p.getRegistry()
    if (!reg) {
      controls.detach()
      return
    }
    const center = averageUnlockedSelectionWorldPosition(reg, targetIds, p.getEntity)
    if (!center) {
      controls.detach()
      return
    }
    pivot.position.set(center[0], center[1], center[2])
    pivot.quaternion.identity()
    pivot.scale.set(1, 1, 1)
    pivot.updateMatrixWorld(true)

    const gizmoMode = p.getGizmoMode()
    if (gizmoMode === 'translate' || gizmoMode === 'rotate' || gizmoMode === 'scale') {
      controls.setMode(gizmoMode)
    }
    controls.setSpace('world')
    if (controls.object !== pivot) {
      controls.attach(pivot)
    }
  }

  const onObjectChange = (): void => {
    if (controls.object === pivot) {
      applyMultiTransformToRegistry()
      return
    }
    mirrorAttachedPoseToRegistry()
  }

  const onMouseDown = (): void => {
    p.setGizmoDragging(true)
    if (controls.object === pivot) {
      const reg = p.getRegistry()
      if (!reg) return
      const ids = getGizmoTargetIds()
      pivot.updateMatrixWorld(true)
      const pivotStartWorld = pivot.matrixWorld.clone()
      const meshStartWorld = new Map<string, THREE.Matrix4>()
      for (const id of ids) {
        const mesh = p.scene.getObjectByName(id)
        if (mesh instanceof THREE.Mesh) {
          mesh.updateMatrixWorld(true)
          meshStartWorld.set(id, mesh.matrixWorld.clone())
        }
      }
      multiDragState = { pivotStartWorld, meshStartWorld, ids }
    }
  }

  const onMouseUp = (): void => {
    p.setGizmoDragging(false)
    const reg = p.getRegistry()
    if (!reg) return

    if (controls.object === pivot) {
      const mode = p.getGizmoMode()
      const ids = multiDragState?.ids ?? getGizmoTargetIds()
      const commits: BuilderPoseCommitEntry[] = []
      for (const id of ids) {
        if (mode === 'scale') {
          const baked = reg.applyGizmoScaleBake(id)
          if (!baked) {
            reg.commitScalePhysics(id)
          }
        }
        const item = reg.get(id)
        const pos = reg.getPosition(id)
        const rot = reg.getRotation(id)
        const scale = reg.getScale(id)
        if (pos && rot && scale && item) {
          commits.push({
            entityId: id,
            pose: {
              position: pos,
              rotation: rot,
              scale,
              shape: item.entity.shape,
              modelScale: item.entity.modelScale,
            },
          })
        }
      }
      if (commits.length > 0) {
        p.onPoseCommit(commits)
      }
      multiDragState = null
      return
    }

    const obj = controls.object
    if (!(obj instanceof THREE.Mesh)) return
    const id = obj.name
    if (!id || !reg) return
    const mode = p.getGizmoMode()
    if (mode === 'paint' || mode === 'visualize') return
    if (mode === 'scale') {
      const baked = reg.applyGizmoScaleBake(id)
      if (!baked) {
        reg.commitScalePhysics(id)
      }
    }
    const item = reg.get(id)
    const pos = reg.getPosition(id)
    const rot = reg.getRotation(id)
    const scale = reg.getScale(id)
    if (pos && rot && scale && item) {
      p.onPoseCommit([
        {
          entityId: id,
          pose: {
            position: pos,
            rotation: rot,
            scale,
            shape: item.entity.shape,
            modelScale: item.entity.modelScale,
          },
        },
      ])
    }
  }

  const getStrokeColor = (): readonly [number, number, number, number] =>
    p.texturePaint?.getBrushRgba?.() ?? DEFAULT_TEXTURE_BRUSH_RGBA

  const getStrokeRadiusPx = (): number => {
    const g = p.texturePaint?.getBrushRadiusPx
    const raw = typeof g === 'function' ? g() : TEXTURE_PAINT_RADIUS_PX
    const n = Math.round(Number(raw))
    if (!Number.isFinite(n)) return TEXTURE_PAINT_RADIUS_PX
    return Math.min(TEXTURE_BRUSH_RADIUS_MAX, Math.max(TEXTURE_BRUSH_RADIUS_MIN, n))
  }

  const flushPaintMove = (): void => {
    paintFlushRaf = 0
    if (!paintStroke || !pendingPaintUv) return
    const { u, v } = pendingPaintUv
    pendingPaintUv = null
    void paintTextureBlob(paintStroke.workingBlob, {
      u,
      v,
      radiusPx: getStrokeRadiusPx(),
      color: getStrokeColor(),
    })
      .then((next) => {
        if (paintStroke) paintStroke.workingBlob = next
      })
      .catch((err) => {
        console.error('[texture paint]', err)
      })
  }

  const schedulePaintMoveFlush = (): void => {
    if (paintFlushRaf !== 0) return
    paintFlushRaf = window.requestAnimationFrame(() => {
      flushPaintMove()
    })
  }

  const endPaintStroke = async (): Promise<void> => {
    if (paintFlushRaf !== 0) {
      window.cancelAnimationFrame(paintFlushRaf)
      paintFlushRaf = 0
    }
    pendingPaintUv = null
    const st = paintStroke
    paintStroke = null
    if (!st || !p.texturePaint) return
    try {
      p.domElement.releasePointerCapture(st.pointerId)
    } catch {
      /* ignore */
    }
    await p.texturePaint.onStrokeEnd({
      entityId: st.entityId,
      mapAssetId: st.mapAssetId,
      newBlob: st.workingBlob,
    })
  }

  const onPaintPointerMove = (e: PointerEvent): void => {
    if (!paintStroke || e.pointerId !== paintStroke.pointerId) return
    setNdcFromEvent(e)
    p.scene.updateMatrixWorld(true)
    raycaster.setFromCamera(ndc, p.camera)
    const hits = raycaster.intersectObjects(getEntityMeshes(), true)
    const h = hits[0]
    const root = h?.object ? findEntityRootForPicking(h.object) : null
    const hid = root?.userData.entityId as string | undefined
    if (!h?.uv || hid !== paintStroke.entityId) return
    pendingPaintUv = { u: h.uv.x, v: h.uv.y }
    schedulePaintMoveFlush()
  }

  const onPaintPointerEnd = (e: PointerEvent): void => {
    if (!paintStroke || e.pointerId !== paintStroke.pointerId) return
    void endPaintStroke()
  }

  controls.addEventListener('objectChange', onObjectChange)
  controls.addEventListener('mouseDown', onMouseDown)
  controls.addEventListener('mouseUp', onMouseUp)

  controls.connect()

  const onSelectPointerDown = (e: PointerEvent): void => {
    if (e.button === 1) return
    if (controls.dragging) return

    setNdcFromEvent(e)
    p.scene.updateMatrixWorld(true)
    raycaster.setFromCamera(ndc, p.camera)
    const hits = raycaster.intersectObjects(getEntityMeshes(), true)
    const hit = hits[0]
    const entityRoot = hit?.object ? findEntityRootForPicking(hit.object) : null

    const paintMode = p.getGizmoMode() === 'paint'
    const tp = p.texturePaint

    if (paintMode && tp) {
      const selected = p.getSelectedIds()
      if (
        selected.length === 1 &&
        entityRoot &&
        hit?.uv &&
        (entityRoot.userData.entityId as string) === selected[0]
      ) {
        const sid = selected[0]!
        const entity = p.getEntity(sid)
        const mapId = entity?.material?.map
        const paintTargetId = tp.getPaintTargetAssetId?.(sid) ?? null
        const paintSourceId = paintTargetId ?? mapId
        const blob = paintSourceId ? tp.getAssets().get(paintSourceId) : undefined

        const beginPaintStroke = (sourceId: string, strokeBlob: Blob): void => {
          tp.pushUndoBeforePaintStroke()
          paintStroke = {
            pointerId: e.pointerId,
            entityId: sid,
            mapAssetId: sourceId,
            workingBlob: strokeBlob,
          }
          try {
            p.domElement.setPointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
          const uv = hit.uv
          if (!uv) return
          void paintTextureBlob(strokeBlob, {
            u: uv.x,
            v: uv.y,
            radiusPx: getStrokeRadiusPx(),
            color: getStrokeColor(),
          })
            .then((next) => {
              if (paintStroke?.pointerId === e.pointerId) paintStroke.workingBlob = next
            })
            .catch((err) => {
              console.error('[texture paint]', err)
            })
        }

        if (paintSourceId && blob) {
          beginPaintStroke(paintSourceId, blob)
          return
        }

        let cancelled = false
        const onEarlyEnd = (): void => {
          cancelled = true
        }
        p.domElement.addEventListener('pointerup', onEarlyEnd, { once: true })
        p.domElement.addEventListener('pointercancel', onEarlyEnd, { once: true })
        void (tp.prepareWorldPaintStroke?.(sid) ?? Promise.resolve(null)).then((prep) => {
          p.domElement.removeEventListener('pointerup', onEarlyEnd)
          p.domElement.removeEventListener('pointercancel', onEarlyEnd)
          if (cancelled || !prep || p.getGizmoMode() !== 'paint') return
          beginPaintStroke(prep.mapAssetId, prep.blob)
        })
        return
      }
      if (!entityRoot) {
        return
      }
    } else if (!entityRoot) {
      p.onSelectEntity(null)
      return
    }

    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    p.onSelectEntity(entityRoot.userData.entityId as string, { additive })
  }

  p.domElement.addEventListener('pointerdown', onSelectPointerDown)
  p.domElement.addEventListener('pointermove', onPaintPointerMove)
  p.domElement.addEventListener('pointerup', onPaintPointerEnd)
  p.domElement.addEventListener('pointercancel', onPaintPointerEnd)

  syncAttach()

  const dispose = (): void => {
    if (paintFlushRaf !== 0) {
      window.cancelAnimationFrame(paintFlushRaf)
      paintFlushRaf = 0
    }
    paintStroke = null
    pendingPaintUv = null
    p.domElement.removeEventListener('pointermove', onPaintPointerMove)
    p.domElement.removeEventListener('pointerup', onPaintPointerEnd)
    p.domElement.removeEventListener('pointercancel', onPaintPointerEnd)
    p.domElement.removeEventListener('pointerdown', onSelectPointerDown)
    controls.removeEventListener('objectChange', onObjectChange)
    controls.removeEventListener('mouseDown', onMouseDown)
    controls.removeEventListener('mouseUp', onMouseUp)
    controls.dispose()
    p.scene.remove(helper)
    p.scene.remove(pivot)
    p.setGizmoDragging(false)
  }

  return { dispose, syncAttach }
}
