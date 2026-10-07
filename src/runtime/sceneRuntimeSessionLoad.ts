import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import {
  DEFAULT_ROTATION,
  resolvedLogarithmicDepthBuffer,
  resolvedPixelRatio,
  type CameraConfig,
  type RennWorld,
  type Vec3,
} from '@/types/world'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import { CameraController } from '@/camera/cameraController'
import { createGameAPI, type HudPatch } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import { BUILDER_VARIABLE_OVERLAY_GROUP_WIDTH } from '@/editor/transformGizmoController'
import { getSceneUserData } from '@/types/sceneUserData'
import {
  type PrefetchDisposer,
} from '@/loader/prefetchMaterialTextures'
import { setTransformerHudFn, setTransformerSnackbarFn } from '@/transformers/customCodeTransformer'
import { VariableOverlayController } from '@/runtime/variableOverlayController'
import { CoordinateOverlayController } from '@/runtime/coordinateOverlayController'
import { AvatarSession } from '@/runtime/avatarSession'
import type {
  SceneRuntimeHandleBag,
  SceneRuntimeHostCallbacks,
  SceneRuntimeRuntimeDeps,
  SceneRuntimeSessionConfig,
} from './sceneRuntimeSession'

/** Mirrors pre-extract stale checks on `loadWorld` completion (`cancelled` + `effectId`). */
export function isStaleSceneRuntimeLoadGeneration(
  cancelled: boolean,
  effectIdRef: MutableRefObject<number>,
  currentEffectId: number,
): boolean {
  return cancelled || effectIdRef.current !== currentEffectId
}

/** Disposes resolver when async load completes after cancel or effect restart. */
export function disposeAssetResolverIfStaleLoadWorld(
  assetResolver: DisposableAssetResolver | null | undefined,
): void {
  if (assetResolver) {
    assetResolver.dispose()
  }
}

export interface SceneRuntimeLoadWorldResult {
  scene: THREE.Scene
  entities: LoadedEntity[]
  world: RennWorld
  assetResolver: DisposableAssetResolver | null
  warnings: string[]
}

export interface SceneRuntimeLoadPathResult {
  cam: THREE.PerspectiveCamera
  rend: THREE.WebGLRenderer
  cameraCtrl: CameraController
  loadedScene: THREE.Scene
  loadedWorld: RennWorld
  entities: LoadedEntity[]
  assetResolver: DisposableAssetResolver | null
  controlledEntityIdRef?: { current: string | null }
  avatarSession: AvatarSession | null
}

export interface SceneRuntimeLoadPathContext {
  config: SceneRuntimeSessionConfig
  host: SceneRuntimeHostCallbacks
  handles: SceneRuntimeHandleBag
  cancelled: boolean
  currentEffectId: number
  scriptSnackbarTimer: { id: number | undefined }
  loadResult: SceneRuntimeLoadWorldResult
}

/**
 * Camera, renderer, CSS2D, script runner, and overlay controllers after `loadWorld` resolves.
 * Returns null when generation guard aborts (resolver disposed).
 */
export function executeSceneRuntimeLoadPath(
  ctx: SceneRuntimeLoadPathContext,
): SceneRuntimeLoadPathResult | null {
  const { config, host, handles, loadResult } = ctx
  const { scene: loadedScene, entities, world: loadedWorld, assetResolver, warnings } = loadResult

  if (isStaleSceneRuntimeLoadGeneration(ctx.cancelled, handles.effectIdRef, ctx.currentEffectId)) {
    disposeAssetResolverIfStaleLoadWorld(assetResolver)
    return null
  }

  host.setWorldLoadError(null)

  if (warnings.length > 0) {
    host.setSchemaLoadWarnings(warnings)
  }

  handles.entitiesRef.current = entities
  host.setScene(loadedScene)
  handles.assetResolverRef.current = assetResolver

  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)

  const currentCameraConfig = config.cameraConfig ?? config.world.world.camera
  const controlMode = currentCameraConfig?.control ?? 'free'
  const useFreePlacement =
    controlMode === 'free' || handles.editNavigationModeRef.current
  const sessionSaved = handles.savedCameraStateRef.current
  const shouldRestoreSession = Boolean(sessionSaved && useFreePlacement)
  const editorPose = currentCameraConfig?.editorFreePose

  if (shouldRestoreSession && sessionSaved) {
    cam.position.copy(sessionSaved.position)
    cam.quaternion.copy(sessionSaved.quaternion)
    cam.up.copy(sessionSaved.up)
  } else if (useFreePlacement && editorPose) {
    const [px, py, pz] = editorPose.position
    cam.position.set(px, py, pz)
    const [qx, qy, qz, qw] = editorPose.quaternion
    cam.quaternion.set(qx, qy, qz, qw)
    cam.up.set(0, 1, 0)
  } else if (currentCameraConfig?.defaultPosition) {
    const [px, py, pz] = currentCameraConfig.defaultPosition
    cam.position.set(px, py, pz)
    const quat = eulerToQuaternion(currentCameraConfig.defaultRotation ?? DEFAULT_ROTATION)
    cam.quaternion.copy(quat)
    cam.up.set(0, 1, 0)
  } else {
    cam.position.set(0, 5, 10)
    cam.lookAt(0, 0, 0)
  }
  host.setCamera(cam)

  const getEntityPosition = (entityId: string): THREE.Vector3 | null => {
    const reg = handles.registryRef.current
    if (reg) return reg.getVisualPositionAsVector3(entityId) ?? null
    const obj = loadedScene.getObjectByName(entityId)
    return obj instanceof THREE.Mesh ? obj.position.clone() : null
  }

  const getEntityQuaternion = (entityId: string): THREE.Quaternion | null => {
    const reg = handles.registryRef.current
    if (reg) return reg.getVisualRotationAsQuaternion(entityId) ?? null
    return null
  }

  const cameraCtrl = new CameraController({
    camera: cam,
    scene: loadedScene,
    getEntityPosition,
    getEntityQuaternion,
  })
  cameraCtrl.resetFreeFlySmoothing()
  handles.cameraCtrlRef.current = cameraCtrl

  let controlledEntityIdRef: { current: string | null } | undefined
  let avatarSession: AvatarSession | null = null
  if (config.runScripts && config.runPhysics) {
    const ref: { current: string | null } = { current: null }
    controlledEntityIdRef = ref
    avatarSession = new AvatarSession({
      entities: loadedWorld.entities,
      worldCamera: (config.cameraConfig ?? loadedWorld.world.camera) as CameraConfig | undefined,
      getCameraController: () => cameraCtrl,
      controlledEntityIdRef: ref,
      onCurrentAvatarChange: (id) => handles.onCurrentAvatarChangeRef.current?.(id),
    })
    handles.avatarSessionRef.current = avatarSession
  }

  const getPhysicsWorld = () => handles.physicsRef.current
  const getRenderItemRegistry = () => handles.registryRef.current
  const getPositionForGame = (id: string): Vec3 | null =>
    handles.registryRef.current?.getPosition(id) ?? null
  const setPositionForGame = (id: string, x: number, y: number, z: number): void =>
    handles.registryRef.current?.setPosition(id, [x, y, z])
  const getRotationForGame = (id: string): Vec3 | null =>
    handles.registryRef.current?.getRotation(id) ?? null
  const setRotationForGame = (id: string, x: number, y: number, z: number): void =>
    handles.registryRef.current?.setRotation(id, [x, y, z])
  const getUpVectorForGame = (id: string): Vec3 | null =>
    handles.registryRef.current?.getUpVector(id) ?? null
  const getForwardVectorForGame = (id: string): Vec3 | null =>
    handles.registryRef.current?.getForwardVector(id) ?? null
  const onScriptSnackbar = (message: string, durationSeconds: number) => {
    if (ctx.scriptSnackbarTimer.id !== undefined) {
      window.clearTimeout(ctx.scriptSnackbarTimer.id)
      ctx.scriptSnackbarTimer.id = undefined
    }
    host.setScriptSnackbarMessage(message)
    const ms = Math.max(durationSeconds * 1000, 10_000)
    ctx.scriptSnackbarTimer.id = window.setTimeout(() => {
      ctx.scriptSnackbarTimer.id = undefined
      host.setScriptSnackbarMessage(null)
    }, ms)
  }
  setTransformerSnackbarFn(onScriptSnackbar)
  const onHudPatch = (patch: HudPatch) => handles.hudPatchBridgeRef.current(patch)
  setTransformerHudFn(onHudPatch)
  const gameApi = createGameAPI(
    getPositionForGame,
    setPositionForGame,
    getRotationForGame,
    setRotationForGame,
    getUpVectorForGame,
    getForwardVectorForGame,
    getPhysicsWorld,
    getRenderItemRegistry,
    () => handles.entitiesRef.current.map(({ entity }) => entity),
    handles.timeRef,
    onScriptSnackbar,
    onHudPatch,
    avatarSession,
  )
  const scriptRunner = new ScriptRunner(loadedWorld, gameApi, (id) => {
    const obj = loadedScene.getObjectByName(id)
    return obj instanceof THREE.Mesh ? obj : null
  }, entities)
  handles.scriptRunnerRef.current = scriptRunner
  for (const { entity } of entities) {
    scriptRunner.runOnSpawn(entity.id)
  }

  const rend = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: resolvedLogarithmicDepthBuffer(config.world.world),
  })
  const w = Math.max(config.container.clientWidth || 800, 1)
  const h = Math.max(config.container.clientHeight || 600, 1)
  rend.setSize(w, h)
  rend.setPixelRatio(resolvedPixelRatio(config.world.world))
  rend.shadowMap.enabled = config.shadowsEnabled
  rend.shadowMap.type = THREE.PCFSoftShadowMap
  config.container.appendChild(rend.domElement)
  host.setRenderer(rend)

  const css2d = new CSS2DRenderer()
  css2d.setSize(w, h)
  css2d.domElement.style.position = 'absolute'
  css2d.domElement.style.left = '0'
  css2d.domElement.style.top = '0'
  css2d.domElement.style.pointerEvents = 'none'
  css2d.domElement.style.zIndex = '1'
  config.container.appendChild(css2d.domElement)
  handles.css2dRendererRef.current = css2d

  handles.variableOverlayControllerRef.current?.dispose()
  handles.variableOverlayControllerRef.current = handles.playModeRef.current
    ? null
    : new VariableOverlayController(loadedScene, BUILDER_VARIABLE_OVERLAY_GROUP_WIDTH)

  handles.coordinateOverlayControllerRef.current?.dispose()
  handles.coordinateOverlayControllerRef.current = handles.playModeRef.current
    ? null
    : new CoordinateOverlayController(loadedScene)

  const sceneUserData = getSceneUserData(loadedScene)
  if (sceneUserData.directionalLight) sceneUserData.directionalLight.castShadow = config.shadowsEnabled
  cam.aspect = w / h
  cam.updateProjectionMatrix()

  return {
    cam,
    rend,
    cameraCtrl,
    loadedScene,
    loadedWorld,
    entities,
    assetResolver,
    controlledEntityIdRef,
    avatarSession,
  }
}

export interface SceneRuntimeGpuWarmUpInput {
  config: SceneRuntimeSessionConfig
  host: SceneRuntimeHostCallbacks
  handles: SceneRuntimeHandleBag
  deps: SceneRuntimeRuntimeDeps
  rend: THREE.WebGLRenderer
  loadedScene: THREE.Scene
  loadedWorld: RennWorld
  assetResolver: DisposableAssetResolver | null
}

/** GPU warm-up, bootstrap completion, and idle texture prefetch after load path. */
export function runSceneRuntimeGpuWarmUp(input: SceneRuntimeGpuWarmUpInput): PrefetchDisposer | null {
  const { host, handles, deps, rend, loadedScene, loadedWorld, assetResolver } = input
  deps.warmUpRendererTextures(rend, loadedScene)
  host.setSceneBootstrapPending(false)

  if (assetResolver) {
    return deps.scheduleMaterialTextureDecodePrefetch(
      assetResolver,
      deps.collectMaterialMapAssetIds(loadedWorld),
      (id) => handles.assetsRef.current.get(id),
    )
  }
  return null
}
