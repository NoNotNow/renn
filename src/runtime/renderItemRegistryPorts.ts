import type * as THREE from 'three'
import type { Vec3, Rotation, Entity, DistanceCullingSettings, ScriptDef } from '@/types/world'
import type { RawInput, TransformerConfig, TransformerDef, TransformerPipe } from '@/types/transformer'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import type { RenderItem } from '@/runtime/renderItem'

/**
 * Per-frame simulation: transformers, physics sync, culling.
 *
 * Frame-ordering invariant (see `runSceneFrame`):
 * 1. `setRawInputGetter` — bind keyboard/wheel snapshot for InputTransformers
 * 2. `executeTransformers` — run entity/world transformers (reads raw input)
 * 3. physics step (external)
 * 4. `syncFromPhysics` — copy Rapier poses to meshes
 * 5. `applyInterpolatedVisualPoses` — display interpolation (optional, between steps)
 * 6. camera update (external)
 * 7. `applyDistanceCulling` / `clearDistanceCulling` — after camera
 */
export interface SimulationFramePort {
  setRawInputGetter(getter: () => RawInput | null): void
  executeTransformers(dt: number, wind?: Vec3): void
  syncFromPhysics(): void
  applyInterpolatedVisualPoses(alpha: number): void
  applyDistanceCulling(camPos: THREE.Vector3, settings: DistanceCullingSettings): void
  clearDistanceCulling(): void
  readonly culledSleepingEntityIds: ReadonlySet<string>
  getPosition(id: string): Vec3 | null
  getForwardVectorInto(id: string, out: Vec3): boolean
  getCar2WheelAngle(id: string): number | null
}

/** World-position lookup for selection pivot / gizmo centroid. */
export type SelectionPivotPort = Pick<SimulationFramePort, 'getPosition'>

/** Builder hot-edits: shape / material / model / colour swaps and incremental world sync. */
export interface SceneEditPort {
  get(id: string): RenderItem | undefined
  getAllPoses(): Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }>
  setPosition(id: string, v: Vec3): void
  setRotation(id: string, v: Rotation): void
  setScale(id: string, v: Vec3): void
  updatePhysics(
    id: string,
    patch: Partial<
      Pick<Entity, 'mass' | 'restitution' | 'friction' | 'linearDamping' | 'angularDamping' | 'bodyType'>
    >,
  ): void
  updateShape(id: string, newEntity: Entity): boolean
  updateMaterial(id: string, newEntity: Entity, assetResolver?: DisposableAssetResolver): Promise<void>
  setModelTransform(
    id: string,
    patch: { modelPosition?: Vec3; modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean },
  ): void
  patchEntityAppearance(id: string, entity: Entity): void
  syncEntityTransformers(id: string, configs: TransformerConfig[] | undefined): void
  setWorldPipeRegistry(
    worldTransformers: Record<string, TransformerDef>,
    worldTransformerPipes: Record<string, TransformerPipe>,
  ): void
  removeEntity(id: string, scene?: THREE.Scene): void
  addLoadedEntity(entity: Entity, mesh: THREE.Mesh, scriptDefs?: Record<string, ScriptDef>): void
  syncAllShapeWireframeOverlays(entities: Entity[]): void
}

/** Script API surface: per-entity pose and appearance handles. */
export interface EntityHandlePort {
  get(id: string): RenderItem | undefined
  resetRotation(id: string): void
  addVectorToPosition(id: string, x: number, y: number, z: number, resetVelocity?: boolean): void
  setColor(id: string, r: number, g: number, b: number): void
  getColor(id: string): [number, number, number] | null
}
