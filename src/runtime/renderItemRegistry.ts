import * as THREE from 'three'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { Vec3, Rotation, Entity, DistanceCullingSettings } from '@/types/world'
import { createShapeGeometry, materialFromRef } from '@/loader/createPrimitive'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import { RenderItem } from './renderItem'
import { rapierQuaternionToEulerInto } from '@/utils/rotationUtils'
import { createTransformerChain } from '@/transformers/transformerRegistry'
import type {
  EntityWorldPose,
  EnvironmentState,
  TransformInput,
  TransformerConfig,
  RawInput,
} from '@/types/transformer'
import { clearActionRecord } from '@/types/transformer'
import {
  bakeMeshScaleIntoModelScaleEntity,
  bakeScaleIntoPrimitiveShape,
  isModelBackedMesh,
} from '@/editor/bakeScaleIntoShape'
import { syncShapeWireframeOverlay } from '@/loader/shapeWireframeOverlay'
import { updateMeshCastShadowFromWorldAabb } from '@/utils/shadowBounds'
import { computeMeshWorldMaxExtent } from '@/utils/meshWorldExtent'
import { distanceCullingShouldCull } from '@/utils/distanceCullingMath'

const shapeUpdateShadowBox = new THREE.Box3()
const shapeUpdateShadowSize = new THREE.Vector3()

/**
 * Registry of render items: one per entity. Owns body→mesh sync each frame.
 * All pose read/write goes through this layer.
 */
export class RenderItemRegistry {
  private items = new Map<string, RenderItem>()
  private physicsWorld: PhysicsWorld | null = null
  private rawInputGetter: (() => RawInput | null) | null = null
  /** When set and `current` is non-null, only that entity receives keyboard input via InputTransformer. */
  private controlledEntityIdRef: { current: string | null } | null = null
  /** Entity ids that are distance-culled with `sleepCulled` — skip their game scripts. */
  private readonly _culledSleepingForScripts = new Set<string>()
  /** Previous frame's `sleepCulled` flag (for toggling off world sleep). */
  private _lastCullingSleepCulled: boolean | undefined
  /** Reused buffer for addVectorToPosition to avoid allocation on hot path. */
  private _addVecBuf: Vec3 = [0, 0, 0]

  /** Read-only ids for {@link ScriptRunner} to skip per entity (distance culling + sleep). */
  get culledSleepingEntityIds(): ReadonlySet<string> {
    return this._culledSleepingForScripts
  }

  /** Reused `TransformInput` for executeTransformers (one entity per iteration; cleared each time). */
  private readonly _tfPosition: Vec3 = [0, 0, 0]
  private readonly _tfRotation: Rotation = [0, 0, 0]
  private readonly _tfVelocity: Vec3 = [0, 0, 0]
  private readonly _tfAngularVelocity: Vec3 = [0, 0, 0]
  private readonly _tfAccumulatedForce: Vec3 = [0, 0, 0]
  private readonly _tfAccumulatedTorque: Vec3 = [0, 0, 0]
  private readonly _tfActions: Record<string, number> = {}
  private readonly _tfEnvironment: EnvironmentState = {}
  private readonly _tfInput: TransformInput
  /** Valid until the next `getEntityWorldPoseForTransformers` call (follow copies values immediately). */
  private readonly _leadPosePosition: Vec3 = [0, 0, 0]
  private readonly _leadPoseRotation: Rotation = [0, 0, 0]
  private readonly _leadPoseRef: EntityWorldPose
  private readonly _addRotationBuf: Rotation = [0, 0, 0]
  /** Reused for `getForwardVectorInto` / HUD (avoids per-call Vec3 allocation). */
  private readonly _forwardScratch = new THREE.Vector3()

  private constructor() {
    this._tfInput = {
      actions: this._tfActions,
      position: this._tfPosition,
      rotation: this._tfRotation,
      velocity: this._tfVelocity,
      angularVelocity: this._tfAngularVelocity,
      accumulatedForce: this._tfAccumulatedForce,
      accumulatedTorque: this._tfAccumulatedTorque,
      environment: this._tfEnvironment,
      deltaTime: 0,
      entityId: '',
      target: undefined,
    }
    this._leadPoseRef = {
      position: this._leadPosePosition,
      rotation: this._leadPoseRotation,
    }
  }

  /**
   * World pose for another entity (e.g. follow transformer). Uses the same physics
   * cache as executeTransformers when present; otherwise render item pose.
   */
  private getEntityWorldPoseForTransformers(id: string): EntityWorldPose | null {
    const cached = this.physicsWorld?.getCachedTransform(id)
    if (cached) {
      this._leadPosePosition[0] = cached.position.x
      this._leadPosePosition[1] = cached.position.y
      this._leadPosePosition[2] = cached.position.z
      rapierQuaternionToEulerInto(cached.rotation, this._leadPoseRotation)
      return this._leadPoseRef
    }
    const item = this.items.get(id)
    if (!item) return null
    const p = item.getPosition()
    const r = item.getRotation()
    this._leadPosePosition[0] = p[0]
    this._leadPosePosition[1] = p[1]
    this._leadPosePosition[2] = p[2]
    this._leadPoseRotation[0] = r[0]
    this._leadPoseRotation[1] = r[1]
    this._leadPoseRotation[2] = r[2]
    return this._leadPoseRef
  }

  /**
   * Build registry from loaded entities and physics world. Call after
   * createPhysicsWorld so bodies exist. Bodies are resolved by entity id.
   */
  static create(
    loadedEntities: LoadedEntity[],
    physicsWorld: PhysicsWorld | null,
    rawInputGetter?: () => RawInput | null,
    controlledEntityIdRef?: { current: string | null } | null,
  ): RenderItemRegistry {
    const registry = new RenderItemRegistry()
    registry.physicsWorld = physicsWorld
    registry.rawInputGetter = rawInputGetter ?? null
    registry.controlledEntityIdRef = controlledEntityIdRef ?? null
    for (const { entity, mesh } of loadedEntities) {
      const body = physicsWorld?.getBody(entity.id) ?? null
      const item = new RenderItem(entity, mesh, body)
      registry.refreshCullingWorldSize(item)

      // Create transformer chain if entity has transformers.
      // Creation may be async (custom transformers); initialize asynchronously
      // so callers receive a registry immediately (tests expect sync create()).
      if (entity.transformers && entity.transformers.length > 0) {
        createTransformerChain(
          entity.transformers,
          rawInputGetter ?? undefined,
          entity,
          (eid) => registry.getEntityWorldPoseForTransformers(eid),
          registry.controlledEntityIdRef ?? undefined,
        )
          .then(chain => {
            if (chain) {
              item.transformerChain = chain
              registry._tfEntityIdsDirty = true
            }
          })
          .catch(error => {
            console.error(`[RenderItemRegistry] Failed to create transformer chain for ${entity.id}:`, error)
          })
      }

      registry.items.set(entity.id, item)
    }
    return registry
  }

  /**
   * Set raw input getter (for InputTransformer).
   */
  setRawInputGetter(getter: () => RawInput | null): void {
    this.rawInputGetter = getter
    // Update all InputTransformers
    for (const item of this.items.values()) {
      if (item.transformerChain) {
        const transformers = item.transformerChain.getAll()
        for (const transformer of transformers) {
          if (transformer.type === 'input' && typeof transformer.setRawInputGetter === 'function') {
            transformer.setRawInputGetter(getter)
          }
        }
      }
    }
  }

  /**
   * Update serialised transformers on the render item and sync `enabled` on the live chain
   * when chain length matches config order. Otherwise rebuilds the chain asynchronously.
   */
  syncEntityTransformers(id: string, configs: TransformerConfig[] | undefined): void {
    const item = this.items.get(id)
    if (!item) return

    const nextEntity: Entity = { ...item.entity, transformers: configs }
    item.entity = nextEntity
    if (item.mesh.userData.entity !== undefined) {
      item.mesh.userData.entity = nextEntity
    }

    if (!configs?.length) {
      item.transformerChain = null
      this._tfEntityIdsDirty = true
      return
    }

    const chain = item.transformerChain
    if (chain) {
      const order = chain.getInConfigOrder()
      if (order.length === configs.length) {
        for (let i = 0; i < configs.length; i++) {
          order[i].enabled = configs[i].enabled ?? true
        }
        return
      }
    }

    createTransformerChain(
      configs,
      this.rawInputGetter ?? undefined,
      nextEntity,
      (eid) => this.getEntityWorldPoseForTransformers(eid),
      this.controlledEntityIdRef ?? undefined,
    )
      .then((newChain) => {
        if (!newChain) return
        item.transformerChain = newChain
        this._tfEntityIdsDirty = true
        if (this.rawInputGetter) {
          for (const t of newChain.getAll()) {
            if (t.type === 'input' && typeof t.setRawInputGetter === 'function' && this.rawInputGetter) {
              t.setRawInputGetter(this.rawInputGetter)
            }
          }
        }
      })
      .catch((error) => {
        console.error(`[RenderItemRegistry] syncEntityTransformers failed for ${id}:`, error)
      })
  }

  get(id: string): RenderItem | undefined {
    return this.items.get(id)
  }

  /**
   * Sync primitive shape wireframe overlays from world entities (entity.model + flag).
   * Does not trigger full scene reload; safe to call after inspector edits.
   */
  syncAllShapeWireframeOverlays(entities: Entity[]): void {
    for (const entity of entities) {
      const item = this.items.get(entity.id)
      if (!item) continue
      const mesh = item.mesh
      if (!(mesh instanceof THREE.Mesh) || mesh.userData.usesModel !== true) continue
      syncShapeWireframeOverlay(mesh, entity)
    }
  }

  getPosition(id: string): Vec3 | null {
    const item = this.items.get(id)
    return item ? item.getPosition() : null
  }

  /**
   * getPosition as THREE.Vector3 for consumers that expect a vector (e.g. CameraController).
   * Writes into out if provided to avoid allocation.
   */
  getPositionAsVector3(id: string, out?: THREE.Vector3): THREE.Vector3 | null {
    const item = this.items.get(id)
    if (!item) return null
    const [x, y, z] = item.getPosition()
    if (out) {
      out.set(x, y, z)
      return out
    }
    return new THREE.Vector3(x, y, z)
  }

  setPosition(id: string, v: Vec3): void {
    this.items.get(id)?.setPosition(v)
  }

  /** Hot path: no `Vec3` allocation (e.g. scripts / game API). */
  setPositionXYZ(id: string, x: number, y: number, z: number): void {
    this.items.get(id)?.setPositionXYZ(x, y, z)
  }

  getRotation(id: string): Rotation | null {
    const item = this.items.get(id)
    return item ? item.getRotation() : null
  }

  /**
   * getRotation as THREE.Quaternion for consumers that need a quaternion (e.g. CameraController).
   * Compensates for visual base quaternion so the result reflects logical rotation.
   */
  getRotationAsQuaternion(id: string, out?: THREE.Quaternion): THREE.Quaternion | null {
    const item = this.items.get(id)
    if (!item) return null
    const q = item.mesh.quaternion.clone()
    const baseQ = item.mesh.userData.visualBaseQuaternion as THREE.Quaternion | undefined
    if (baseQ) q.premultiply(baseQ.clone().invert())
    if (out) { out.copy(q); return out }
    return q
  }

  setRotation(id: string, v: Rotation): void {
    this.items.get(id)?.setRotation(v)
  }

  /** Hot path: no `Rotation` array allocation. */
  setRotationEuler(id: string, rx: number, ry: number, rz: number): void {
    this.items.get(id)?.setRotationEuler(rx, ry, rz)
  }

  /** Set entity rotation to identity [0, 0, 0] (Euler radians). */
  resetRotation(id: string): void {
    this.setRotationEuler(id, 0, 0, 0)
  }

  getScale(id: string): Vec3 | null {
    const item = this.items.get(id)
    return item ? item.getScale() : null
  }

  /** Mesh + entity only; use during scale gizmo drag. */
  patchScale(id: string, v: Vec3): void {
    this.items.get(id)?.patchScale(v)
  }

  /** Rebuild collider after scale gizmo drag (or external scale apply). */
  commitScalePhysics(id: string): void {
    const item = this.items.get(id)
    if (!item) return
    if (this.physicsWorld) {
      this.physicsWorld.updateShape(id, item.entity, item.mesh)
    }
    this.refreshCullingWorldSize(item)
  }

  /**
   * Scale gizmo commit: bake mesh.scale into shape dimensions (primitives) or modelScale (model/trimesh wrappers).
   * Resets mesh.scale and entity.scale to [1,1,1] when baking applies and updates physics.
   * @returns true if bake was applied; false for plane (no dimension bake) — caller should use commitScalePhysics.
   */
  applyGizmoScaleBake(id: string): boolean {
    const item = this.items.get(id)
    if (!item) return false
    const mesh = item.mesh
    if (!(mesh instanceof THREE.Mesh)) return false

    const meshScale: Vec3 = [mesh.scale.x, mesh.scale.y, mesh.scale.z]

    if (isModelBackedMesh(mesh)) {
      const nextEntity = bakeMeshScaleIntoModelScaleEntity(item.entity, meshScale)
      mesh.scale.set(1, 1, 1)
      item.entity = nextEntity
      if (mesh.userData.entity !== undefined) {
        mesh.userData.entity = nextEntity
      }
      this.setModelTransform(id, { modelScale: nextEntity.modelScale ?? [1, 1, 1] })
      return true
    }

    const baked = bakeScaleIntoPrimitiveShape(item.entity, meshScale)
    if (!baked) {
      return false
    }

    mesh.scale.set(1, 1, 1)
    this.updateShape(id, baked)
    return true
  }

  /** Apply scale to mesh/entity and rebuild physics collider (inspector / pose sync). */
  setScale(id: string, v: Vec3): void {
    this.patchScale(id, v)
    this.commitScalePhysics(id)
  }

  /**
   * Apply model transform (rotation/scale) to the mesh's model scene and, for trimesh, rebuild the collider.
   * Used for incremental updates so changing modelRotation/modelScale does not trigger a full world reload.
   */
  setModelTransform(
    id: string,
    patch: { modelRotation?: Rotation; modelScale?: Vec3 }
  ): void {
    const item = this.items.get(id)
    if (!item) return
    const mesh = item.mesh
    const modelScene =
      (mesh.userData.trimeshScene as THREE.Object3D | undefined) ??
      (mesh.userData.usesModel === true && mesh.children.length > 0 ? mesh.children[0] : null)
    if (!modelScene) return

    const nextEntity = { ...item.entity, ...patch }
    const modelRotation: Rotation = nextEntity.modelRotation ?? [0, 0, 0]
    const modelScale: Vec3 = nextEntity.modelScale ?? [1, 1, 1]

    modelScene.rotation.set(modelRotation[0], modelRotation[1], modelRotation[2])
    modelScene.scale.set(modelScale[0], modelScale[1], modelScale[2])

    item.entity = nextEntity
    if (mesh.userData.entity !== undefined) {
      mesh.userData.entity = nextEntity
    }

    if (item.entity.shape?.type === 'trimesh' && this.physicsWorld) {
      this.physicsWorld.updateShape(id, item.entity, mesh)
    }
    this.refreshCullingWorldSize(item)
  }

  /** Add a vector to the entity position. Uses internal buffer to avoid allocation. When resetVelocity is true, zeroes linear velocity so the move persists (e.g. under gravity). */
  addVectorToPosition(id: string, x: number, y: number, z: number, resetVelocity?: boolean): void {
    const pos = this.getPosition(id)
    if (!pos) return
    this._addVecBuf[0] = pos[0] + x
    this._addVecBuf[1] = pos[1] + y
    this._addVecBuf[2] = pos[2] + z
    this.setPosition(id, this._addVecBuf)
    if (resetVelocity && this.physicsWorld) {
      this.physicsWorld.setLinearVelocity(id, 0, 0, 0)
    }
  }

  /** Set mesh color (RGB 0–1). Sync; only updates material.color on existing materials. */
  setColor(id: string, r: number, g: number, b: number): void {
    const item = this.items.get(id)
    if (!item) return
    const mesh = item.mesh
    const setColorOn = (mat: THREE.Material) => {
      if ('color' in mat && mat.color instanceof THREE.Color) {
        mat.color.setRGB(r, g, b)
      }
    }
    if (mesh.userData.usesModel === true || mesh.userData.isTrimeshSource === true) {
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach(setColorOn)
        }
      })
    } else {
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mats.forEach(setColorOn)
      }
    }
  }

  /** Get mesh color (RGB 0–1). Returns first material color found, or null if none. */
  getColor(id: string): [number, number, number] | null {
    const item = this.items.get(id)
    if (!item) return null
    const mesh = item.mesh
    const readColorFrom = (mat: THREE.Material): [number, number, number] | null => {
      if ('color' in mat && mat.color instanceof THREE.Color) {
        return [mat.color.r, mat.color.g, mat.color.b]
      }
      return null
    }
    if (mesh.userData.usesModel === true || mesh.userData.isTrimeshSource === true) {
      let result: [number, number, number] | null = null
      mesh.traverse((child) => {
        if (result !== null) return
        if (child instanceof THREE.Mesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const mat of mats) {
            result = readColorFrom(mat)
            if (result !== null) return
          }
        }
      })
      return result
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of mats) {
        const c = readColorFrom(mat)
        if (c !== null) return c
      }
    }
    return null
  }

  /**
   * World-space up direction for the entity (Y-up convention). Useful for detecting orientation
   * (e.g. upside down: getUpVector(id).y < -0.5). Compensates for visual base quaternion.
   */
  getUpVector(id: string): Vec3 | null {
    const q = this.getRotationAsQuaternion(id)
    if (!q) return null
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    return [up.x, up.y, up.z]
  }

  /**
   * World-space forward (−Z in local space) into `out`. Returns false if pose is unavailable.
   */
  getForwardVectorInto(id: string, out: Vec3): boolean {
    const q = this.getRotationAsQuaternion(id)
    if (!q) return false
    this._forwardScratch.set(0, 0, -1).applyQuaternion(q)
    out[0] = this._forwardScratch.x
    out[1] = this._forwardScratch.y
    out[2] = this._forwardScratch.z
    return true
  }

  /**
   * World-space forward direction for the entity (Three.js: -Z). Compensates for visual base quaternion.
   */
  getForwardVector(id: string): Vec3 | null {
    const q = this.getRotationAsQuaternion(id)
    if (!q) return null
    this._forwardScratch.set(0, 0, -1).applyQuaternion(q)
    return [this._forwardScratch.x, this._forwardScratch.y, this._forwardScratch.z]
  }

  /** First `car2` transformer's wheel angle (−1…1), or null if none. */
  getCar2WheelAngle(id: string): number | null {
    const chain = this.items.get(id)?.transformerChain
    if (!chain) return null
    for (const t of chain.getAll()) {
      if (t.type !== 'car2') continue
      const w = (t as { wheelAngle?: unknown }).wheelAngle
      if (typeof w === 'number' && Number.isFinite(w)) return w
    }
    return null
  }

  /**
   * Apply incremental physics property changes to an entity's body/collider directly.
   * Only the properties present in the patch are updated; others are left unchanged.
   */
  updatePhysics(id: string, patch: Partial<Pick<Entity, 'mass' | 'restitution' | 'friction' | 'linearDamping' | 'angularDamping' | 'bodyType'>>): void {
    if (!this.physicsWorld) return
    const item = this.items.get(id)
    if (!item) return
    const pw = this.physicsWorld
    if (patch.linearDamping !== undefined) pw.setLinearDamping(id, patch.linearDamping)
    if (patch.angularDamping !== undefined) pw.setAngularDamping(id, patch.angularDamping)
    if (patch.restitution !== undefined) pw.setRestitution(id, patch.restitution)
    if (patch.friction !== undefined) pw.setFriction(id, patch.friction)
    if (patch.mass !== undefined) {
      const entity = item.entity
      pw.setMass(id, patch.mass, entity.shape, entity.scale)
    }
    if (patch.bodyType !== undefined) {
      const entity = item.entity
      pw.setBodyType(id, patch.bodyType, entity.linearDamping, entity.angularDamping)
    }
  }

  /**
   * Hot-swap the mesh geometry and rebuild the physics collider for a primitive shape change.
   * Returns true if the update was applied, false if the shape is trimesh (caller must fall back
   * to a full scene rebuild for trimesh shapes).
   */
  updateShape(id: string, newEntity: Entity): boolean {
    if (newEntity.shape?.type === 'trimesh') return false
    const item = this.items.get(id)
    if (!item) return false

    const newGeometry = createShapeGeometry(newEntity.shape ?? { type: 'box', width: 1, height: 1, depth: 1 })
    if (!newGeometry) return false

    const mesh = item.mesh
    const wasFlatShape = item.entity.shape?.type === 'plane' || item.entity.shape?.type === 'ring'
    const isNowFlatShape = newEntity.shape?.type === 'plane' || newEntity.shape?.type === 'ring'

    // Handle plane/ring visual base quaternion transition (both lie flat via -90° X rotation)
    if (wasFlatShape !== isNowFlatShape) {
      const currentRotation = item.getRotation()
      if (isNowFlatShape) {
        const planeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
        mesh.userData.visualBaseQuaternion = planeQ
      } else {
        mesh.userData.visualBaseQuaternion = undefined
      }
      // Re-apply rotation so it is consistent with the new (or absent) visual base quaternion
      item.setRotation(currentRotation)
    }

    // Swap geometry
    const oldGeometry = mesh.geometry
    mesh.geometry = newGeometry
    oldGeometry.dispose()

    mesh.updateMatrixWorld(true)
    updateMeshCastShadowFromWorldAabb(
      mesh,
      newEntity.shape?.type === 'plane',
      shapeUpdateShadowBox,
      shapeUpdateShadowSize,
    )

    // Update entity reference so future operations (e.g. mass change) use the new shape
    item.entity = newEntity
    mesh.userData.entity = newEntity

    // Rebuild physics collider with new shape
    if (this.physicsWorld) {
      this.physicsWorld.updateShape(id, newEntity, mesh)
    }

    syncShapeWireframeOverlay(mesh, newEntity)

    this.refreshCullingWorldSize(item)

    return true
  }

  /**
   * Replace the material on an entity's mesh with one created from the new MaterialRef,
   * or restore original model materials when newEntity.material is undefined (model/trimesh only).
   * For model-based meshes all child meshes are updated too.
   * Old material(s) are disposed when applying override. Async because texture loading may be required.
   */
  async updateMaterial(id: string, newEntity: Entity, assetResolver?: DisposableAssetResolver): Promise<void> {
    const item = this.items.get(id)
    if (!item) return
    const mesh = item.mesh
    const isModelMesh = mesh.userData.usesModel === true || mesh.userData.isTrimeshSource === true
    if (isModelMesh && newEntity.material === undefined) {
      const entries = mesh.userData.originalMaterialEntries as Array<{ mesh: THREE.Mesh; material: THREE.Material }> | undefined
      if (entries && entries.length > 0) {
        for (const { mesh: childMesh, material: storedMat } of entries) {
          const current = childMesh.material
          childMesh.material = storedMat
          if (current && current !== storedMat) {
            if (Array.isArray(current)) current.forEach((m) => m.dispose())
            else current.dispose()
          }
        }
      }
    } else {
      const newMat = await materialFromRef(newEntity.material, assetResolver)
      if (isModelMesh) {
        // Skip root: invisible shape/proxy hull must not receive the visible PBR override.
        mesh.traverse((child) => {
          if (child === mesh) return
          if (child instanceof THREE.Mesh) {
            const old = child.material
            child.material = newMat
            if (old) {
              if (Array.isArray(old)) old.forEach((m) => m.dispose())
              else old.dispose()
            }
          }
        })
      } else {
        const old = mesh.material
        mesh.material = newMat
        if (old) {
          if (Array.isArray(old)) old.forEach((m) => m.dispose())
          else old.dispose()
        }
      }
    }
    item.entity = newEntity
    mesh.userData.entity = newEntity
  }

  private refreshCullingWorldSize(item: RenderItem): void {
    item.worldSize = computeMeshWorldMaxExtent(item.mesh, item.entity)
  }

  /**
   * Cached {@link RenderItem.worldSize}: max edge of world AABB from the mesh hierarchy
   * (see {@link refreshCullingWorldSize}). Refreshed on load and when scale/shape/model changes.
   *
   * Per-frame: hide when beyond `maxDistance` **unless** `worldSize > cameraDistance`
   * (large objects still count as near for the hard cap), or when `worldSize/dist`
   * falls below `minSizeDistanceRatio` (squared math, no `sqrt`).
   * Optional `sleepCulled` freezes physics and registers ids for script skipping.
   */
  applyDistanceCulling(camPos: THREE.Vector3, settings: DistanceCullingSettings): void {
    const sleepCulled = settings.sleepCulled === true
    const pw = this.physicsWorld

    if (this._lastCullingSleepCulled === true && !sleepCulled) {
      for (const item of this.items.values()) {
        if (item.distanceCullingPhysicsFrozen && pw) {
          pw.enableBodyFromCulling(item.entity.id)
        }
        item.distanceCullingPhysicsFrozen = false
        this._culledSleepingForScripts.delete(item.entity.id)
      }
    }
    this._lastCullingSleepCulled = sleepCulled

    for (const item of this.items.values()) {
      const m = item.mesh.position
      const dx = m.x - camPos.x
      const dy = m.y - camPos.y
      const dz = m.z - camPos.z
      const distSq = dx * dx + dy * dy + dz * dz

      const ws = item.worldSize
      const shouldCull = distanceCullingShouldCull(
        distSq,
        ws,
        settings.maxDistance,
        settings.minSizeDistanceRatio,
      )

      const wantScriptSleep = shouldCull && sleepCulled
      const shouldFreezeBody = wantScriptSleep && item.hasPhysicsBody()

      if (shouldFreezeBody) {
        if (pw && !item.distanceCullingPhysicsFrozen) {
          pw.disableBodyForCulling(item.entity.id)
          item.distanceCullingPhysicsFrozen = true
        }
      } else {
        if (item.distanceCullingPhysicsFrozen && pw) {
          pw.enableBodyFromCulling(item.entity.id)
        }
        item.distanceCullingPhysicsFrozen = false
      }

      if (wantScriptSleep) {
        this._culledSleepingForScripts.add(item.entity.id)
      } else {
        this._culledSleepingForScripts.delete(item.entity.id)
      }

      if (shouldCull !== item.distanceCulled) {
        item.distanceCulled = shouldCull
        item.mesh.visible = !shouldCull
      }
    }
  }

  /** Restore visibility and physics; call when culling is disabled. */
  clearDistanceCulling(): void {
    const pw = this.physicsWorld
    for (const item of this.items.values()) {
      if (item.distanceCullingPhysicsFrozen && pw) {
        pw.enableBodyFromCulling(item.entity.id)
      }
      item.distanceCullingPhysicsFrozen = false
      if (item.distanceCulled) {
        item.distanceCulled = false
        item.mesh.visible = true
      }
    }
    this._culledSleepingForScripts.clear()
    this._lastCullingSleepCulled = undefined
  }

  /**
   * Execute transformers for all entities before physics step.
   * This generates forces that are then applied to physics bodies.
   */
  private _tfEntityIds: string[] = []
  private _tfEntityIdsDirty = true

  /** Mark the transformer entity set as needing resync (call on add/remove). */
  markTransformerSetDirty(): void {
    this._tfEntityIdsDirty = true
  }

  executeTransformers(dt: number, wind?: Vec3): void {
    if (!this.physicsWorld) return
    this.physicsWorld.resetAllForces()

    if (this._tfEntityIdsDirty) {
      this._tfEntityIds.length = 0
      for (const item of this.items.values()) {
        if (item.transformerChain && item.hasPhysicsBody()) {
          this._tfEntityIds.push(item.entity.id)
        }
      }
      this.physicsWorld.setTouchingCacheEntityIds(this._tfEntityIds)
      this._tfEntityIdsDirty = false
    }

    const input = this._tfInput
    const env = this._tfEnvironment

    for (const item of this.items.values()) {
      if (!item.transformerChain) continue
      if (!item.hasPhysicsBody()) continue

      const cached = this.physicsWorld.getCachedTransform(item.entity.id)
      if (!cached) continue
      if (cached.isSleeping) continue
      if (item.distanceCulled) continue

      clearActionRecord(this._tfActions)
      input.target = undefined
      input.entityId = item.entity.id
      input.deltaTime = dt
      this._tfAccumulatedForce[0] = 0
      this._tfAccumulatedForce[1] = 0
      this._tfAccumulatedForce[2] = 0
      this._tfAccumulatedTorque[0] = 0
      this._tfAccumulatedTorque[1] = 0
      this._tfAccumulatedTorque[2] = 0

      this._tfPosition[0] = cached.position.x
      this._tfPosition[1] = cached.position.y
      this._tfPosition[2] = cached.position.z
      rapierQuaternionToEulerInto(cached.rotation, this._tfRotation)

      this._tfVelocity[0] = cached.linvel.x
      this._tfVelocity[1] = cached.linvel.y
      this._tfVelocity[2] = cached.linvel.z
      this._tfAngularVelocity[0] = cached.angvel.x
      this._tfAngularVelocity[1] = cached.angvel.y
      this._tfAngularVelocity[2] = cached.angvel.z

      env.wind = wind ?? undefined
      env.isGrounded = false
      const cachedTouch = this.physicsWorld.getCachedTouching(item.entity.id)
      if (cachedTouch) {
        env.isTouchingObject = cachedTouch.touching
        if (cachedTouch.supportVelocity) {
          env.supportVelocity = cachedTouch.supportVelocity
        } else {
          env.supportVelocity = undefined
        }
      } else {
        const touching = this.physicsWorld.isEntityTouchingAny(item.entity.id) ?? false
        env.isTouchingObject = touching
        if (touching) {
          const support = this.physicsWorld.getAverageSupportVelocity(item.entity.id)
          env.supportVelocity = support ?? undefined
        } else {
          env.supportVelocity = undefined
        }
      }

      // Execute transformer chain
      const output = item.transformerChain.execute(input, dt)

      // Apply forces to physics body (hasPhysicsBody() is guaranteed by loop guard)
      if (output.force) {
        this.physicsWorld.applyForceFromTransformer(item.entity.id, output.force)
      }
      if (output.impulse) {
        this.physicsWorld.applyImpulseFromTransformer(item.entity.id, output.impulse)
      }
      if (output.torque) {
        this.physicsWorld.applyTorqueFromTransformer(item.entity.id, output.torque)
      }
      if (output.addRotation != null) {
        this._addRotationBuf[0] = this._tfRotation[0] + output.addRotation[0]
        this._addRotationBuf[1] = this._tfRotation[1] + output.addRotation[1]
        this._addRotationBuf[2] = this._tfRotation[2] + output.addRotation[2]
        this.physicsWorld.setRotation(item.entity.id, this._addRotationBuf)
        this.physicsWorld.setAngularVelocity(item.entity.id, 0, 0, 0)
      }
      if (output.setPose) {
        const p = output.setPose.position
        const r = output.setPose.rotation
        if (cached.isKinematic) {
          this.physicsWorld.setNextKinematicPose(item.entity.id, p[0], p[1], p[2], r)
        } else {
          this.physicsWorld.setPosition(item.entity.id, p[0], p[1], p[2])
          this.physicsWorld.setRotation(item.entity.id, r)
          this.physicsWorld.setLinearVelocity(item.entity.id, 0, 0, 0)
          this.physicsWorld.setAngularVelocity(item.entity.id, 0, 0, 0)
        }
      }
      if (output.color) {
        this.setColor(item.entity.id, output.color[0], output.color[1], output.color[2])
      }
    }
  }

  /**
   * Copy body translation/rotation to mesh for all items that have a body.
   * Call once per frame after physics.step().
   * Uses cached transforms to avoid WASM aliasing errors.
   */
  syncFromPhysics(): void {
    if (!this.physicsWorld) return
    
    for (const item of this.items.values()) {
      if (!item.hasPhysicsBody()) continue
      if (item.distanceCullingPhysicsFrozen) continue

      // Use cached transforms instead of direct body access to avoid WASM aliasing
      const cached = this.physicsWorld.getCachedTransform(item.entity.id)
      if (!cached) continue
      
      const pos = cached.position
      const rot = cached.rotation
      item.mesh.position.set(pos.x, pos.y, pos.z)
      item.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
      const baseQ = item.mesh.userData.visualBaseQuaternion as THREE.Quaternion | undefined
      if (baseQ) {
        item.mesh.quaternion.premultiply(baseQ)
      }
    }
  }

  /**
   * Get all current poses (position and rotation) for all entities.
   * Used to preserve poses across scene reloads.
   */
  getAllPoses(): Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }> {
    const poses = new Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }>()
    for (const [id, item] of this.items) {
      poses.set(id, {
        position: item.getPosition(),
        rotation: item.getRotation(),
        scale: item.getScale(),
      })
    }
    return poses
  }

  /**
   * Clear all items and dispose resources.
   * Note: This does NOT dispose the physics world - caller should dispose it separately
   * to avoid double-free issues.
   */
  clear(): void {
    for (const item of this.items.values()) {
      disposeMeshHierarchy(item.mesh)
    }
    this.items.clear()
    this.physicsWorld = null
  }
}

/** Dispose geometry, material (and map) for a mesh and all descendants. Disposes stored originalMaterialEntries. */
function disposeMeshHierarchy(mesh: THREE.Mesh): void {
  const disposedMaterials = new Set<THREE.Material>()
  const disposeMaterial = (mat: THREE.Material): void => {
    if (disposedMaterials.has(mat)) return
    disposedMaterials.add(mat)
    if (mat instanceof THREE.MeshStandardMaterial && mat.map) {
      mat.map.dispose()
    }
    mat.dispose()
  }
  mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry) {
        obj.geometry.dispose()
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(disposeMaterial)
        } else {
          disposeMaterial(obj.material)
        }
      }
    }
  })
  const entries = mesh.userData.originalMaterialEntries as Array<{ mesh: THREE.Mesh; material: THREE.Material }> | undefined
  if (entries) {
    for (const { material: storedMat } of entries) {
      disposeMaterial(storedMat)
    }
    delete mesh.userData.originalMaterialEntries
  }
}
