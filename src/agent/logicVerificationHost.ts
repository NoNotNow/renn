/**
 * Headless logic verification host: load world, step Rapier + RenderItemRegistry +
 * transformer chain with scripted RawInput, read poses and sim time.
 *
 * Vitest, CLI, and MCP share this module (see docs/adr/0001-logic-verification-host.md).
 */

import * as THREE from 'three'
import { initRapier, createPhysicsWorld, type PhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { createTransformerChain } from '@/transformers/transformerRegistry'
import type { RennWorld, Entity, Rotation, Vec3 } from '@/types/world'
import { loadWorld, type LoadedEntity } from '@/loader/loadWorld'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import { prepareWorldForLogicVerification } from '@/agent/prepareWorldForLogicVerification'
import type { RawInput, RawKeyboardState } from '@/types/transformer'
import {
  AgentObservationSession,
  type AgentObservationProbe,
  type ObservationTimelineRow,
} from '@/agent/agentObservationSession'
import { validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import {
  applyLogicVerificationWorldPatch,
  type ApplyLogicVerificationWorldPatchResult,
  type LogicVerificationWorldPatch,
} from '@/agent/applyLogicVerificationWorldPatch'
import { resolveMergedTransformerConfigsForEntitySync } from '@/utils/pipeStageResolve'

export const DEFAULT_LOGIC_VERIFICATION_DT = 1 / 60

const EMPTY_KEYS: RawKeyboardState = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  shift: false,
}

export function buildScriptedRawInput(keys: Partial<RawKeyboardState>): RawInput {
  return {
    keys: { ...EMPTY_KEYS, ...keys },
    wheel: { deltaX: 0, deltaY: 0, pinchDelta: 0, mouseWheelDelta: 0 },
  }
}

export interface LogicVerificationStepContext {
  stepIndex: number
  simTime: number
  dt: number
}

export type LogicVerificationInputScript = (ctx: LogicVerificationStepContext) => RawInput

export interface LogicVerificationHostConfig {
  world: RennWorld
  /** Optional bundle / import assets — when set, entity meshes resolve like Builder import. */
  assets?: Map<string, Blob>
  dt?: number
  /** When set, keyboard input is routed only to this entity (play avatar semantics). */
  controlledEntityId?: string | null
  /** Steps to run after load so transformer chains and contact settle (default 0). */
  warmupSteps?: number
}

/** Live Builder scene: reuse registry + physics instead of headless load. */
export interface LogicVerificationLiveSceneConfig {
  world: RennWorld
  registry: RenderItemRegistry
  physicsWorld: PhysicsWorld
  entities: LoadedEntity[]
  dt?: number
  controlledEntityIdRef?: { current: string | null }
}

export interface EntityVerificationPose {
  position: Vec3
  rotation: Rotation
}

export interface LogicVerificationStepResult {
  simTime: number
  stepCount: number
  poses: Record<string, EntityVerificationPose>
}

function createHeadlessMeshForEntity(entity: Entity): THREE.Mesh {
  const shape = entity.shape
  let geometry: THREE.BufferGeometry
  if (!shape) {
    geometry = new THREE.BoxGeometry(1, 1, 1)
  } else {
    switch (shape.type) {
      case 'box':
        geometry = new THREE.BoxGeometry(shape.width, shape.height, shape.depth)
        break
      case 'sphere':
        geometry = new THREE.SphereGeometry(shape.radius)
        break
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height)
        break
      case 'capsule':
        geometry = new THREE.CapsuleGeometry(shape.radius, shape.height)
        break
      case 'cone':
        geometry = new THREE.ConeGeometry(shape.radius, shape.height)
        break
      case 'plane':
        geometry = new THREE.PlaneGeometry(100, 100)
        break
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1)
        break
    }
  }
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
}

function buildLoadedEntities(world: RennWorld): LoadedEntity[] {
  return world.entities.map((entity) => ({
    entity,
    mesh: createHeadlessMeshForEntity(entity),
  }))
}

async function attachTransformerChains(
  world: RennWorld,
  entities: LoadedEntity[],
  registry: RenderItemRegistry,
  rawInputGetter: () => RawInput,
  controlledEntityIdRef: { current: string | null } | undefined,
): Promise<void> {
  for (const { entity } of entities) {
    if (!entity.transformers?.length) continue
    const configs = entity.transformers
      .map((id) => world.transformers?.[id])
      .filter((c): c is NonNullable<typeof c> => c != null)
    if (configs.length === 0) continue
    const chain = await createTransformerChain(
      configs,
      rawInputGetter,
      entity,
      undefined,
      controlledEntityIdRef,
    )
    const item = registry.get(entity.id)
    if (item && chain) {
      item.transformerChain = chain
    }
  }
  registry.markTransformerSetDirty()
}

export class LogicVerificationHost {
  private readonly physicsWorld: PhysicsWorld
  private readonly registry: RenderItemRegistry
  private readonly entities: LoadedEntity[]
  private world: RennWorld
  private readonly dt: number
  private readonly wind: Vec3 | undefined
  private readonly inputState: { raw: RawInput }
  private readonly controlledEntityIdRef: { current: string | null } | undefined
  private readonly observationSession: AgentObservationSession
  private readonly ownsPhysics: boolean
  private readonly assetResolver: DisposableAssetResolver | null
  private stepCount = 0
  private simTime = 0

  private constructor(
    physicsWorld: PhysicsWorld,
    registry: RenderItemRegistry,
    entities: LoadedEntity[],
    world: RennWorld,
    dt: number,
    inputState: { raw: RawInput },
    observationSession: AgentObservationSession,
    controlledEntityIdRef: { current: string | null } | undefined,
    wind?: Vec3,
    ownsPhysics = true,
    assetResolver: DisposableAssetResolver | null = null,
  ) {
    this.physicsWorld = physicsWorld
    this.registry = registry
    this.entities = entities
    this.world = world
    this.dt = dt
    this.inputState = inputState
    this.controlledEntityIdRef = controlledEntityIdRef
    this.observationSession = observationSession
    this.wind = wind
    this.ownsPhysics = ownsPhysics
    this.assetResolver = assetResolver
  }

  static adoptLiveScene(config: LogicVerificationLiveSceneConfig): LogicVerificationHost {
    const dt = config.dt ?? DEFAULT_LOGIC_VERIFICATION_DT
    const inputState = { raw: buildScriptedRawInput({}) }
    const rawInputGetter = (): RawInput => inputState.raw
    config.registry.setRawInputGetter(rawInputGetter)
    const wind = config.world.world.wind as Vec3 | undefined
    const observationSession = new AgentObservationSession({
      registry: config.registry,
      physicsWorld: config.physicsWorld,
    })
    observationSession.setCompileErrors(collectCustomTransformerCompileErrors(config.world))
    return new LogicVerificationHost(
      config.physicsWorld,
      config.registry,
      config.entities,
      config.world,
      dt,
      inputState,
      observationSession,
      config.controlledEntityIdRef,
      wind,
      false,
    )
  }

  static async create(config: LogicVerificationHostConfig): Promise<LogicVerificationHost> {
    await initRapier()

    const world = prepareWorldForLogicVerification(config.world)
    const dt = config.dt ?? DEFAULT_LOGIC_VERIFICATION_DT

    let entities: LoadedEntity[]
    let assetResolver: DisposableAssetResolver | null = null
    if (config.assets && config.assets.size > 0) {
      const loaded = await loadWorld(world, config.assets)
      entities = loaded.entities
      assetResolver = loaded.assetResolver
    } else {
      entities = buildLoadedEntities(world)
    }

    const physicsWorld = await createPhysicsWorld(world, entities)

    const inputState = { raw: buildScriptedRawInput({}) }
    const rawInputGetter = (): RawInput => inputState.raw

    const controlledRef =
      config.controlledEntityId !== undefined
        ? { current: config.controlledEntityId }
        : undefined

    const registry = RenderItemRegistry.create(
      entities,
      physicsWorld,
      rawInputGetter,
      controlledRef,
      world.transformers,
      world.transformerPipes,
    )

    await attachTransformerChains(world, entities, registry, rawInputGetter, controlledRef)
    registry.setRawInputGetter(rawInputGetter)

    const wind = world.world.wind as Vec3 | undefined
    const observationSession = new AgentObservationSession({
      registry,
      physicsWorld,
    })
    observationSession.setCompileErrors(collectCustomTransformerCompileErrors(world))
    const host = new LogicVerificationHost(
      physicsWorld,
      registry,
      entities,
      world,
      dt,
      inputState,
      observationSession,
      controlledRef,
      wind,
      true,
      assetResolver,
    )

    const warmup = config.warmupSteps ?? 0
    if (warmup > 0) {
      host.runSteps(warmup)
    }

    return host
  }

  runSteps(count: number, inputScript?: LogicVerificationInputScript): LogicVerificationStepResult {
    const bindScriptedInput = (): void => {
      this.registry.setRawInputGetter(() => this.inputState.raw)
    }
    bindScriptedInput()

    for (let i = 0; i < count; i++) {
      const ctx: LogicVerificationStepContext = {
        stepIndex: this.stepCount,
        simTime: this.simTime,
        dt: this.dt,
      }
      this.inputState.raw = inputScript
        ? inputScript(ctx)
        : buildScriptedRawInput({})
      bindScriptedInput()
      this.registry.executeTransformers(this.dt, this.wind)
      this.physicsWorld.step(this.dt)
      this.registry.syncFromPhysics()
      this.stepCount += 1
      this.simTime += this.dt
      this.observationSession.recordAfterStep({ simTime: this.simTime, dt: this.dt })
    }

    return this.snapshot()
  }

  snapshot(): LogicVerificationStepResult {
    const poses: Record<string, EntityVerificationPose> = {}
    for (const { entity } of this.entities) {
      const position = this.registry.getPosition(entity.id)
      const rotation = this.registry.getRotation(entity.id)
      if (!position || !rotation) continue
      poses[entity.id] = {
        position: [position[0], position[1], position[2]],
        rotation: [rotation[0], rotation[1], rotation[2]],
      }
    }
    return {
      simTime: this.simTime,
      stepCount: this.stepCount,
      poses,
    }
  }

  getSimTime(): number {
    return this.simTime
  }

  getStepCount(): number {
    return this.stepCount
  }

  getDt(): number {
    return this.dt
  }

  /** Snapshot deps for browser attach / integration tests (same registry + physics). */
  getLiveSceneConfig(): LogicVerificationLiveSceneConfig {
    return {
      world: this.world,
      registry: this.registry,
      physicsWorld: this.physicsWorld,
      entities: this.entities,
      dt: this.dt,
      controlledEntityIdRef: this.controlledEntityIdRef,
    }
  }

  getObservationSession(): AgentObservationSession {
    return this.observationSession
  }

  registerObservationProbes(probes: AgentObservationProbe[]): void {
    this.observationSession.registerProbes(probes)
  }

  startObservationRun(options?: { carryOverTimeline?: boolean }): void {
    this.observationSession.startRun(options)
  }

  stopObservationRun(): void {
    this.observationSession.stopRun()
  }

  getObservationTimeline(): readonly ObservationTimelineRow[] {
    return this.observationSession.getTimeline()
  }

  async applyWorldPatch(
    patch: LogicVerificationWorldPatch,
  ): Promise<ApplyLogicVerificationWorldPatchResult> {
    const result = applyLogicVerificationWorldPatch(this.world, patch)
    if (!result.ok || !result.nextWorld) {
      return result
    }

    this.world = result.nextWorld
    this.registry.setWorldPipeRegistry(
      this.world.transformers ?? {},
      this.world.transformerPipes ?? {},
    )

    for (const entityId of result.affectedEntityIds) {
      const merged = resolveMergedTransformerConfigsForEntitySync(this.world, entityId)
      this.registry.syncEntityTransformers(entityId, merged)
      const entityRecord = this.entities.find((e) => e.entity.id === entityId)
      const nextEntity = this.world.entities.find((e) => e.id === entityId)
      if (entityRecord && nextEntity) {
        entityRecord.entity = nextEntity
        if (entityRecord.mesh.userData.entity !== undefined) {
          entityRecord.mesh.userData.entity = nextEntity
        }
      }
    }

    this.observationSession.setCompileErrors(collectCustomTransformerCompileErrors(this.world))

    await this.resyncTransformerChainsForEntities(result.affectedEntityIds)
    return { ok: true, affectedEntityIds: result.affectedEntityIds }
  }

  private async resyncTransformerChainsForEntities(entityIds: string[]): Promise<void> {
    const rawInputGetter = (): RawInput => this.inputState.raw
    for (const entityId of entityIds) {
      const entity = this.world.entities.find((e) => e.id === entityId)
      if (!entity?.transformers?.length) continue
      const configs = entity.transformers
        .map((id) => this.world.transformers?.[id])
        .filter((c): c is NonNullable<typeof c> => c != null)
      if (configs.length === 0) continue
      const chain = await createTransformerChain(
        configs,
        rawInputGetter,
        entity,
        undefined,
        this.controlledEntityIdRef,
      )
      const item = this.registry.get(entityId)
      if (item && chain) {
        item.transformerChain = chain
        for (const t of chain.getAll()) {
          if (t.type === 'input' && typeof t.setRawInputGetter === 'function') {
            t.setRawInputGetter(rawInputGetter)
          }
        }
      }
    }
    this.registry.markTransformerSetDirty()
  }

  dispose(): void {
    this.observationSession.dispose()
    this.assetResolver?.dispose()
    if (this.ownsPhysics) {
      this.physicsWorld.dispose()
    }
  }
}

function collectCustomTransformerCompileErrors(
  world: RennWorld,
): { configKey: string; message: string }[] {
  const out: { configKey: string; message: string }[] = []
  const defs = world.transformers ?? {}
  for (const [id, cfg] of Object.entries(defs)) {
    if (cfg?.type !== 'custom' || typeof cfg.code !== 'string') continue
    const message = validateCustomTransformerSource(cfg.code, id)
    if (message) {
      out.push({ configKey: id, message })
    }
  }
  return out
}

export async function createLogicVerificationHost(
  config: LogicVerificationHostConfig,
): Promise<LogicVerificationHost> {
  return LogicVerificationHost.create(config)
}
