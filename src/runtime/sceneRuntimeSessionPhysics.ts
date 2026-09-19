import type { LoadedEntity } from '@/loader/loadWorld'
import { DEFAULT_GRAVITY, type RennWorld } from '@/types/world'
import { getRawInputSnapshot } from '@/input/rawInput'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { restoreInitialPosesIntoRegistry } from '@/runtime/restoreInitialPoses'
import {
  isStaleSceneRuntimeLoadGeneration,
} from '@/runtime/sceneRuntimeSessionLoad'
import type {
  SceneRuntimeHandleBag,
  SceneRuntimeHostCallbacks,
  SceneRuntimeRuntimeDeps,
  SceneRuntimeSessionConfig,
} from './sceneRuntimeSession'

/** Mirrors post-load registry attach guard (`!cancelled && effectId` match). */
export function canApplySceneRuntimeRegistryGeneration(
  cancelled: boolean,
  effectIdRef: SceneRuntimeHandleBag['effectIdRef'],
  currentEffectId: number,
): boolean {
  return !cancelled && effectIdRef.current === currentEffectId
}

export interface SceneRuntimePhysicsRegistryContext {
  config: SceneRuntimeSessionConfig
  host: SceneRuntimeHostCallbacks
  handles: SceneRuntimeHandleBag
  deps: SceneRuntimeRuntimeDeps
  cancelled: boolean
  currentEffectId: number
  loadedWorld: RennWorld
  entities: LoadedEntity[]
  controlledEntityIdRef?: { current: string | null }
  installPickGizmoIfBuilder: () => void
}

/**
 * Physics async bootstrap (when `runPhysics`) or sync registry-only path.
 * Generation guards match pre-extract SceneView effect (`cancelled` + `effectIdRef`).
 */
export function runSceneRuntimePhysicsAndRegistry(ctx: SceneRuntimePhysicsRegistryContext): void {
  const {
    config,
    host,
    handles,
    deps,
    cancelled,
    currentEffectId,
    loadedWorld,
    entities,
    controlledEntityIdRef,
    installPickGizmoIfBuilder,
  } = ctx

  const applyRegistryIfActive = (registry: ReturnType<typeof RenderItemRegistry.create>): void => {
    if (canApplySceneRuntimeRegistryGeneration(cancelled, handles.effectIdRef, currentEffectId)) {
      handles.registryRef.current = registry
      restoreInitialPosesIntoRegistry(registry, config.initialPosesRef, config.onPosesRestored)
      installPickGizmoIfBuilder()
      host.setRegistryEpoch((n) => n + 1)
    }
  }

  const rawInputGetter = () => getRawInputSnapshot(handles.rawKeyboardRef, handles.rawWheelRef)

  if (config.runPhysics) {
    const gravity = loadedWorld.world.gravity ?? DEFAULT_GRAVITY
    deps.importRapierPhysics().then((mod) => {
      mod.createPhysicsWorld(loadedWorld, entities).then((pw) => {
        // Check if this effect is still active
        if (isStaleSceneRuntimeLoadGeneration(cancelled, handles.effectIdRef, currentEffectId)) {
          pw.dispose()
          return
        }
        pw.setGravity(gravity)
        handles.physicsRef.current = pw
        const registry = RenderItemRegistry.create(
          entities,
          pw,
          rawInputGetter,
          controlledEntityIdRef,
          loadedWorld.transformers,
          loadedWorld.transformerPipes,
        )
        applyRegistryIfActive(registry)
      })
    })
  } else {
    const registry = RenderItemRegistry.create(
      entities,
      null,
      rawInputGetter,
      controlledEntityIdRef,
      loadedWorld.transformers,
      loadedWorld.transformerPipes,
    )
    applyRegistryIfActive(registry)
  }
}
