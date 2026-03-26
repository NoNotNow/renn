import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo } from 'react'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import type { RennWorld, Vec3, Rotation, CameraConfig, Entity, EditorFreePose } from '@/types/world'
import type { DisposableAssetResolver } from '@/loader/assetResolverImpl'
import { DEFAULT_GRAVITY, DEFAULT_ROTATION } from '@/types/world'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import type { LoadedEntity } from '@/loader/loadWorld'
import { CameraController } from '@/camera/cameraController'
import { createGameAPI } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import {
  averageUnlockedSelectionWorldPosition,
  installBuilderPickAndGizmo,
  type BuilderGizmoMode,
  type BuilderPoseCommitEntry,
} from '@/editor/transformGizmoController'
import { getSceneUserData } from '@/types/sceneUserData'
import { useRawKeyboardInput, useRawWheelInput, getRawInputSnapshot } from '@/input/rawInput'
import { useRawMouseDrag } from '@/input/rawMouseDrag'
import type { RawInput, TransformerConfig } from '@/types/transformer'
import { getSceneDependencyKey } from '@/utils/sceneDependencyKey'

const FIXED_DT = 1 / 60

export interface SceneViewProps {
  world: RennWorld
  cameraConfig?: CameraConfig
  assets?: Map<string, Blob>
  runPhysics?: boolean
  runScripts?: boolean
  shadowsEnabled?: boolean
  className?: string
  selectedEntityIds?: string[]
  onSelectEntity?: (entityId: string | null, options?: { additive?: boolean }) => void
  /** Builder: called after a gizmo drag ends with the committed poses (one or many). */
  onEntityPoseCommit?: (commits: BuilderPoseCommitEntry[]) => void
  gizmoMode?: BuilderGizmoMode
  version?: number
  /** Ref set by parent before world update; applied to registry after reload and then cleared. */
  initialPosesRef?: React.MutableRefObject<
    Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null
  >
  /** Called after initial poses are applied so parent can sync world state. */
  onPosesRestored?: (poses: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>) => void
  /**
   * Builder: WASD free-fly, no transformer run, physics step paused, scripts paused.
   * Does not change persisted world or camera config.
   */
  editNavigationMode?: boolean
  /** Builder: session ref for last free-fly pose; merged on save via ProjectContext.getWorldToSave. */
  editorFreePoseRef?: React.MutableRefObject<EditorFreePose | null>
}

export type EntityPhysicsPatch = Partial<Pick<Entity, 'mass' | 'restitution' | 'friction' | 'linearDamping' | 'angularDamping' | 'bodyType'>>

export interface SceneViewHandle {
  setViewPreset: (preset: 'top' | 'front' | 'right') => void
  updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => void
  updateEntityPhysics: (id: string, patch: EntityPhysicsPatch) => void
  /** Hot-swaps geometry and rebuilds collider. Returns false for trimesh (caller must rebuild). */
  updateEntityShape: (id: string, entity: Entity) => boolean
  /** Replaces the mesh material asynchronously (fire-and-forget; texture loading may defer). */
  updateEntityMaterial: (id: string, entity: Entity) => Promise<void>
  /** Applies model rotation/scale to the mesh and rebuilds trimesh collider; avoids full reload. */
  updateEntityModelTransform: (id: string, patch: { modelRotation?: Rotation; modelScale?: Vec3 }) => void
  /** Sync entity.transformers to runtime chain (e.g. enabled flags) without scene reload. */
  syncEntityTransformers: (id: string, configs: TransformerConfig[] | undefined) => void
  getAllPoses: () => Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }> | null
  resetCamera: () => void
  applyDebugForce: (entityId: string, force: Vec3, duration: number) => void
}

function SceneViewInner({
  world,
  cameraConfig,
  assets: _assets = new Map(),
  runPhysics = true,
  runScripts = true,
  shadowsEnabled = true,
  className = '',
  selectedEntityIds = [],
  onSelectEntity,
  onEntityPoseCommit,
  gizmoMode = 'translate',
  version = 0,
  initialPosesRef,
  onPosesRestored,
  editNavigationMode = false,
  editorFreePoseRef,
}: SceneViewProps, ref: React.Ref<SceneViewHandle>) {
  const sceneKey = useMemo(() => getSceneDependencyKey(world), [world])
  const containerRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<THREE.Scene | null>(null)
  const [camera, setCamera] = useState<THREE.PerspectiveCamera | null>(null)
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null)
  const cameraCtrlRef = useRef<CameraController | null>(null)
  const scriptRunnerRef = useRef<ScriptRunner | null>(null)
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const registryRef = useRef<RenderItemRegistry | null>(null)
  const entitiesRef = useRef<LoadedEntity[]>([])
  const assetResolverRef = useRef<DisposableAssetResolver | null>(null)
  const timeRef = useRef(0)
  const frameRef = useRef<number>(0)
  const effectIdRef = useRef(0)
  const savedCameraStateRef = useRef<{
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    up: THREE.Vector3
  } | null>(null)
  const resizeHandlerRef = useRef<(() => void) | null>(null)

  const freeFlyKeysRef = useKeyboardInput()
  const rawKeyboardRef = useRawKeyboardInput()
  const rawWheelRef = useRawWheelInput(containerRef)
  const rawMouseDragRef = useRawMouseDrag(containerRef)
  const orbitWheelRef = useRef({ deltaX: 0, deltaY: 0, distanceDelta: 0 })
  const lastEditorPoseWriteTimeRef = useRef(0)

  // Active debug forces: { entityId, force, endTime }[]
  const activeDebugForcesRef = useRef<Array<{ entityId: string; force: Vec3; endTime: number }>>([])

  const worldRef = useRef(world)
  worldRef.current = world
  const [registryEpoch, setRegistryEpoch] = useState(0)
  const gizmoDraggingRef = useRef(false)
  const disposePickGizmoRef = useRef<(() => void) | null>(null)
  const syncGizmoAttachRef = useRef<(() => void) | null>(null)
  const selectedEntityIdsRef = useRef<string[]>([])
  const gizmoModeRef = useRef<BuilderGizmoMode>('translate')
  const onSelectEntityRef = useRef(onSelectEntity)
  const onEntityPoseCommitRef = useRef(onEntityPoseCommit)
  const editNavigationModeRef = useRef(editNavigationMode)
  editNavigationModeRef.current = editNavigationMode

  selectedEntityIdsRef.current = selectedEntityIds
  gizmoModeRef.current = gizmoMode
  onSelectEntityRef.current = onSelectEntity
  onEntityPoseCommitRef.current = onEntityPoseCommit

  const selectionSyncKey = selectedEntityIds.join('\0')

  useEffect(() => {
    syncGizmoAttachRef.current?.()
  }, [selectionSyncKey, gizmoMode, sceneKey, registryEpoch])

  useEffect(() => {
    registryRef.current?.syncAllShapeWireframeOverlays(world.entities)
  }, [world, registryEpoch])

  useImperativeHandle(ref, () => ({
    setViewPreset: (preset: 'top' | 'front' | 'right') => {
      cameraCtrlRef.current?.setViewPreset(preset)
    },
    updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => {
      if (pose.position) registryRef.current?.setPosition(id, pose.position)
      if (pose.rotation) registryRef.current?.setRotation(id, pose.rotation)
      if (pose.scale) registryRef.current?.setScale(id, pose.scale)
    },
    updateEntityPhysics: (id: string, patch: EntityPhysicsPatch) => {
      registryRef.current?.updatePhysics(id, patch)
    },
    updateEntityShape: (id: string, entity: Entity) => {
      return registryRef.current?.updateShape(id, entity) ?? false
    },
    updateEntityMaterial: async (id: string, entity: Entity) => {
      await registryRef.current?.updateMaterial(id, entity, assetResolverRef.current ?? undefined)
    },
    updateEntityModelTransform: (id: string, patch: { modelRotation?: Rotation; modelScale?: Vec3 }) => {
      registryRef.current?.setModelTransform(id, patch)
    },
    syncEntityTransformers: (id: string, configs: TransformerConfig[] | undefined) => {
      registryRef.current?.syncEntityTransformers(id, configs)
    },
    getAllPoses: () => registryRef.current?.getAllPoses() ?? null,
    resetCamera: () => {
      if (!camera) return
      
      // Clear saved camera state so it doesn't restore old position
      savedCameraStateRef.current = null
      if (editorFreePoseRef) editorFreePoseRef.current = null
      
      // Get default position and rotation from world config
      const camCfg = world.world.camera
      const defaultPos = camCfg?.defaultPosition ?? [0, 5, 10]
      const defaultRot = camCfg?.defaultRotation ?? DEFAULT_ROTATION
      
      // Reset camera position and rotation
      camera.position.set(defaultPos[0], defaultPos[1], defaultPos[2])
      const quat = eulerToQuaternion(defaultRot)
      camera.quaternion.copy(quat)
      camera.up.set(0, 1, 0)
      cameraCtrlRef.current?.resetFreeFlySmoothing()
    },
    applyDebugForce: (entityId: string, force: Vec3, duration: number) => {
      if (!physicsRef.current) {
        console.warn('[SceneView] Cannot apply debug force: physics world not initialized')
        return
      }
      
      // Check if entity exists and is dynamic
      const body = physicsRef.current.getBody(entityId)
      if (!body || !body.isDynamic()) {
        console.warn(`[SceneView] Cannot apply debug force: entity "${entityId}" is not dynamic`)
        return
      }
      
      const endTime = timeRef.current + duration
      activeDebugForcesRef.current.push({ entityId, force, endTime })
    }
  }), [camera, world.world.camera, editorFreePoseRef])

  // Main scene setup effect
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Increment effect ID to detect stale async operations
    effectIdRef.current += 1
    const currentEffectId = effectIdRef.current

    // Dispose previous asset resolver if it exists
    if (assetResolverRef.current) {
      assetResolverRef.current.dispose()
      assetResolverRef.current = null
    }

    let cancelled = false
    let cam: THREE.PerspectiveCamera | null = null
    let rend: THREE.WebGLRenderer | null = null
    let cameraCtrl: CameraController | null = null
    let ro: ResizeObserver | null = null

    // Load world asynchronously with assets
    loadWorld(world, _assets).then(({ scene: loadedScene, entities, world: loadedWorld, assetResolver }) => {
      // Check if this effect is still active
      if (cancelled || effectIdRef.current !== currentEffectId) {
        // Dispose resolver if effect was cancelled
        if (assetResolver) {
          assetResolver.dispose()
        }
        return
      }

      entitiesRef.current = entities
      setScene(loadedScene)
      assetResolverRef.current = assetResolver

      // Camera setup
      cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
      
      const currentCameraConfig = cameraConfig ?? world.world.camera
      const controlMode = currentCameraConfig?.control ?? 'free'
      const useFreePlacement =
        controlMode === 'free' || editNavigationModeRef.current
      const sessionSaved = savedCameraStateRef.current
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
      setCamera(cam)

      const getEntityPosition = (entityId: string): THREE.Vector3 | null => {
        const reg = registryRef.current
        if (reg) return reg.getPositionAsVector3(entityId) ?? null
        const obj = loadedScene.getObjectByName(entityId)
        return obj instanceof THREE.Mesh ? obj.position.clone() : null
      }

      const getEntityQuaternion = (entityId: string): THREE.Quaternion | null => {
        const reg = registryRef.current
        if (reg) return reg.getRotationAsQuaternion(entityId) ?? null
        return null
      }

      cameraCtrl = new CameraController({
        camera: cam,
        scene: loadedScene,
        getEntityPosition,
        getEntityQuaternion,
      })
      cameraCtrl.resetFreeFlySmoothing()
      cameraCtrlRef.current = cameraCtrl

      const getPhysicsWorld = () => physicsRef.current
      const getRenderItemRegistry = () => registryRef.current
      const getPositionForGame = (id: string): Vec3 | null =>
        registryRef.current?.getPosition(id) ?? null
      const setPositionForGame = (id: string, x: number, y: number, z: number): void =>
        registryRef.current?.setPosition(id, [x, y, z])
      const getRotationForGame = (id: string): Vec3 | null =>
        registryRef.current?.getRotation(id) ?? null
      const setRotationForGame = (id: string, x: number, y: number, z: number): void =>
        registryRef.current?.setRotation(id, [x, y, z])
      const getUpVectorForGame = (id: string): Vec3 | null =>
        registryRef.current?.getUpVector(id) ?? null
      const getForwardVectorForGame = (id: string): Vec3 | null =>
        registryRef.current?.getForwardVector(id) ?? null
      const gameApi = createGameAPI(
        getPositionForGame,
        setPositionForGame,
        getRotationForGame,
        setRotationForGame,
        getUpVectorForGame,
        getForwardVectorForGame,
        getPhysicsWorld,
        getRenderItemRegistry,
        loadedWorld.entities,
        timeRef
      )
      const scriptRunner = new ScriptRunner(loadedWorld, gameApi, (id) => {
        const obj = loadedScene.getObjectByName(id)
        return obj instanceof THREE.Mesh ? obj : null
      }, entities)
      scriptRunnerRef.current = scriptRunner
      for (const { entity } of entities) {
        scriptRunner.runOnSpawn(entity.id)
      }

      rend = new THREE.WebGLRenderer({ antialias: true })
      const w = Math.max(container.clientWidth || 800, 1)
      const h = Math.max(container.clientHeight || 600, 1)
      rend.setSize(w, h)
      rend.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      rend.shadowMap.enabled = shadowsEnabled
      rend.shadowMap.type = THREE.PCFSoftShadowMap
      container.appendChild(rend.domElement)
      setRenderer(rend)

      const sceneUserData = getSceneUserData(loadedScene)
      if (sceneUserData.directionalLight) sceneUserData.directionalLight.castShadow = shadowsEnabled
      cam.aspect = w / h
      cam.updateProjectionMatrix()

      const installPickGizmoIfBuilder = (): void => {
        if (cancelled || effectIdRef.current !== currentEffectId) return
        if (!onSelectEntityRef.current || !onEntityPoseCommitRef.current) return
        if (!cam || !rend) return
        if (!registryRef.current) return
        disposePickGizmoRef.current?.()
        const { dispose, syncAttach } = installBuilderPickAndGizmo({
          scene: loadedScene,
          camera: cam,
          domElement: rend.domElement,
          getRegistry: () => registryRef.current,
          getEntity: (id) => worldRef.current.entities.find((e) => e.id === id),
          getSelectedIds: () => selectedEntityIdsRef.current,
          getGizmoMode: () => gizmoModeRef.current,
          onSelectEntity: (id, opts) => onSelectEntityRef.current?.(id, opts),
          onPoseCommit: (commits) => onEntityPoseCommitRef.current?.(commits),
          setGizmoDragging: (d) => {
            gizmoDraggingRef.current = d
          },
        })
        disposePickGizmoRef.current = dispose
        syncGizmoAttachRef.current = syncAttach
        syncAttach()
      }

      // Initialize physics
      if (runPhysics) {
        const gravity = loadedWorld.world.gravity ?? DEFAULT_GRAVITY
        import('@/physics/rapierPhysics').then((mod) => {
          mod.createPhysicsWorld(loadedWorld, entities).then((pw) => {
            // Check if this effect is still active
            if (cancelled || effectIdRef.current !== currentEffectId) {
              pw.dispose()
              return
            }
            pw.setGravity(gravity)
            physicsRef.current = pw
            const rawInputGetter = () => getRawInputSnapshot(rawKeyboardRef, rawWheelRef)
            const registry = RenderItemRegistry.create(entities, pw, rawInputGetter)
            if (!cancelled && effectIdRef.current === currentEffectId) {
              registryRef.current = registry
              const poses = initialPosesRef?.current
              if (poses && poses.size > 0) {
                for (const [id, pose] of poses) {
                  if (registry.get(id)) {
                    registry.setPosition(id, pose.position)
                    registry.setRotation(id, pose.rotation)
                    if (pose.scale) registry.setScale(id, pose.scale)
                  }
                }
                onPosesRestored?.(poses)
                if (initialPosesRef) initialPosesRef.current = null
              }
              installPickGizmoIfBuilder()
              setRegistryEpoch((n) => n + 1)
            }
          })
        })
      } else {
        const rawInputGetter = () => getRawInputSnapshot(rawKeyboardRef, rawWheelRef)
        const registry = RenderItemRegistry.create(entities, null, rawInputGetter)
        if (!cancelled && effectIdRef.current === currentEffectId) {
          registryRef.current = registry
          const poses = initialPosesRef?.current
          if (poses && poses.size > 0) {
            for (const [id, pose] of poses) {
              if (registry.get(id)) {
                registry.setPosition(id, pose.position)
                registry.setRotation(id, pose.rotation)
                if (pose.scale) registry.setScale(id, pose.scale)
              }
            }
            onPosesRestored?.(poses)
            if (initialPosesRef) initialPosesRef.current = null
          }
          installPickGizmoIfBuilder()
          setRegistryEpoch((n) => n + 1)
        }
      }

      // Animation loop
      const animate = (): void => {
        if (cancelled) return // Stop if effect is cleaning up
        frameRef.current = requestAnimationFrame(animate)
        const dt = FIXED_DT
        timeRef.current += dt

        // Follow + orbit modes: consume wheel so transformers don't see it.
        // Edit navigation: same — trackpad scroll → orbit; pinch + mouse wheel → distance (FOV in first person).
        const orbitCtrl = cameraCtrlRef.current
        const orbitCfg = orbitCtrl?.getConfig()
        const orbitFollowModes =
          orbitCfg?.mode === 'follow' ||
          orbitCfg?.mode === 'thirdPerson' ||
          orbitCfg?.mode === 'tracking' ||
          orbitCfg?.mode === 'firstPerson'
        const editNav = editNavigationModeRef.current
        const followCameraWheelOrbit =
          !editNav && orbitCfg?.control === 'follow' && orbitFollowModes
        const consumeWheelForCameraOrbit = followCameraWheelOrbit || editNav
        if (rawWheelRef.current && consumeWheelForCameraOrbit) {
          const rw = rawWheelRef.current
          orbitWheelRef.current.deltaX = rw.deltaX
          orbitWheelRef.current.deltaY = rw.deltaY
          orbitWheelRef.current.distanceDelta = (rw.pinchDelta ?? 0) + (rw.mouseWheelDelta ?? 0)
          rw.deltaX = 0
          rw.deltaY = 0
          rw.pinchDelta = 0
          rw.mouseWheelDelta = 0
        } else {
          orbitWheelRef.current.deltaX = 0
          orbitWheelRef.current.deltaY = 0
          orbitWheelRef.current.distanceDelta = 0
        }

        const pw = physicsRef.current
        if (pw && runPhysics && !cancelled) {
          try {
            const currentTime = timeRef.current
            activeDebugForcesRef.current = activeDebugForcesRef.current.filter((debugForce) => {
              if (currentTime >= debugForce.endTime) {
                return false
              }
              if (!editNav) {
                pw.applyForce(debugForce.entityId, debugForce.force[0], debugForce.force[1], debugForce.force[2])
              }
              return true
            })

            if (!editNav) {
              // Execute transformers BEFORE physics step
              if (registryRef.current) {
                const rawInput: RawInput = getRawInputSnapshot(rawKeyboardRef, rawWheelRef)
                void rawInput
                registryRef.current.setRawInputGetter(() => rawInput)
                const wind = worldRef.current.world.wind
                registryRef.current.executeTransformers(dt, wind)
              }

              pw.step(dt)
              registryRef.current?.syncFromPhysics()

              if (scriptRunnerRef.current && runScripts) {
                const collisions = pw.getCollisions()
                for (const { entityIdA, entityIdB, impact } of collisions) {
                  scriptRunnerRef.current.runOnCollision(entityIdA, entityIdB, impact)
                  scriptRunnerRef.current.runOnCollision(entityIdB, entityIdA, impact)
                }
              }
            }
          } catch (e) {
            // Suppress errors if we're being cleaned up
            if (!cancelled) {
              console.error('Physics step error:', e)
            }
            return
          }
        }

        if (scriptRunnerRef.current && runScripts && !editNavigationModeRef.current) {
          scriptRunnerRef.current.runOnUpdate(dt)
        }

        const ctrl = cameraCtrlRef.current
        if (ctrl) {
          ctrl.setForceFreeFlyNavigation(editNavigationModeRef.current)
          const useFreeFlyKeys =
            (ctrl.getConfig().control ?? 'free') === 'free' || editNavigationModeRef.current
          if (useFreeFlyKeys && freeFlyKeysRef.current) {
            ctrl.setFreeFlyInput(freeFlyKeysRef.current)
          }
          const drag = rawMouseDragRef.current
          const orbitWheel = orbitWheelRef.current
          const gizmoDrag = gizmoDraggingRef.current
          const orbitDx = (gizmoDrag ? 0 : (drag?.deltaX ?? 0)) + orbitWheel.deltaX
          const orbitDy = (gizmoDrag ? 0 : (drag?.deltaY ?? 0)) + orbitWheel.deltaY
          if (orbitDx !== 0 || orbitDy !== 0) {
            ctrl.setOrbitDelta(orbitDx, orbitDy)
          }
          if (drag) { drag.deltaX = 0; drag.deltaY = 0 }
          if (orbitWheel.distanceDelta !== 0) {
            ctrl.setOrbitDistanceDelta(orbitWheel.distanceDelta * 0.05)
            orbitWheel.distanceDelta = 0
          }
          if (editNavigationModeRef.current) {
            const selPivot = averageUnlockedSelectionWorldPosition(
              registryRef.current,
              selectedEntityIdsRef.current,
              (id) => worldRef.current.entities.find((e) => e.id === id),
            )
            ctrl.setEditNavigationOrbitPivot(
              selPivot ? { x: selPivot[0], y: selPivot[1], z: selPivot[2] } : null,
            )
          } else {
            ctrl.setEditNavigationOrbitPivot(null)
          }
          ctrl.update(dt)

          const poseSink = editorFreePoseRef
          if (poseSink && cam && !cancelled) {
            const cfg = ctrl.getConfig()
            const navigating =
              (cfg.control ?? 'free') === 'free' || editNavigationModeRef.current
            if (navigating) {
              const t = timeRef.current
              if (t - lastEditorPoseWriteTimeRef.current >= 0.35) {
                lastEditorPoseWriteTimeRef.current = t
                poseSink.current = {
                  position: [cam.position.x, cam.position.y, cam.position.z],
                  quaternion: [
                    cam.quaternion.x,
                    cam.quaternion.y,
                    cam.quaternion.z,
                    cam.quaternion.w,
                  ],
                }
              }
            }
          }
        }

        if (rend && loadedScene && cam && !cancelled) {
          rend.render(loadedScene, cam)
        }
      }
      animate()

      // Resize handling
      const onResize = (): void => {
        if (!container || !cam || !rend) return
        const w = Math.max(container.clientWidth || 1, 1)
        const h = Math.max(container.clientHeight || 1, 1)
        cam.aspect = w / h
        cam.updateProjectionMatrix()
        rend.setSize(w, h)
      }
      resizeHandlerRef.current = onResize
      window.addEventListener('resize', onResize)
      ro = new ResizeObserver(onResize)
      ro.observe(container)
    }).catch((err) => {
      if (!cancelled) {
        console.error('Failed to load world:', err)
      }
    })

    return () => {
      // Set cancelled first to stop animation loop
      cancelled = true

      disposePickGizmoRef.current?.()
      disposePickGizmoRef.current = null
      syncGizmoAttachRef.current = null
      gizmoDraggingRef.current = false
      
      // Dispose asset resolver
      if (assetResolverRef.current) {
        assetResolverRef.current.dispose()
        assetResolverRef.current = null
      }
      
      // Save camera pose after free-fly or edit-navigation (same-session rebuild / restore).
      if (cam && cameraCtrl) {
        const config = cameraCtrl.getConfig()
        const saveFreePose =
          editNavigationModeRef.current || (config.control ?? 'free') === 'free'
        if (saveFreePose) {
          savedCameraStateRef.current = {
            position: cam.position.clone(),
            quaternion: cam.quaternion.clone(),
            up: cam.up.clone(),
          }
        }
      }
      
      // Clear physics ref IMMEDIATELY to stop animation loop from using it
      const pw = physicsRef.current
      physicsRef.current = null
      
      // Cancel animation frame and remove event listeners
      cancelAnimationFrame(frameRef.current)
      if (ro) {
        ro.disconnect()
      }
      const resizeHandler = resizeHandlerRef.current
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler)
        resizeHandlerRef.current = null
      }
      
      // Clear refs immediately to prevent any further use
      cameraCtrlRef.current = null
      scriptRunnerRef.current = null
      
      // Clear registry
      registryRef.current?.clear()
      registryRef.current = null
      
      // Clear debug forces
      activeDebugForcesRef.current = []
      
      // Dispose physics world (after animation loop is stopped)
      if (pw) {
        try {
          pw.dispose()
        } catch (e) {
          console.warn('Error disposing physics world:', e)
        }
      }
      
      // Clean up renderer
      if (rend) {
        try {
          rend.dispose()
          if (container && rend.domElement.parentNode === container) {
            container.removeChild(rend.domElement)
          }
        } catch (e) {
          console.warn('Error disposing renderer:', e)
        }
      }
      
      // Clear state
      setScene(null)
      setCamera(null)
      setRenderer(null)
    }
  }, [sceneKey, version, runPhysics, runScripts, shadowsEnabled, freeFlyKeysRef, editorFreePoseRef])

  // Update camera config when it changes (without reloading the world)
  useEffect(() => {
    if (!cameraCtrlRef.current || !cameraConfig) return
    cameraCtrlRef.current.setConfig(cameraConfig)
  }, [cameraConfig])

  // Update gravity when it changes
  useEffect(() => {
    if (!runPhysics) return
    const pw = physicsRef.current
    if (!pw) return
    const gravity = world.world.gravity ?? DEFAULT_GRAVITY
    pw.setGravity(gravity)
  }, [world.world.gravity, runPhysics])

  // Update shadows when setting changes
  useEffect(() => {
    if (renderer) renderer.shadowMap.enabled = shadowsEnabled
    if (scene) {
      const sceneUserData = getSceneUserData(scene)
      if (sceneUserData.directionalLight) sceneUserData.directionalLight.castShadow = shadowsEnabled
    }
  }, [shadowsEnabled, renderer, scene])

  // Update sky color when it changes (without full reload)
  useEffect(() => {
    if (!scene) return
    const skyColor = world.world.skyColor
    if (skyColor) {
      const [r, g, b] = skyColor
      scene.background = new THREE.Color(r, g, b)
    }
  }, [world.world.skyColor, scene])

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}

const SceneView = forwardRef<SceneViewHandle, SceneViewProps>(SceneViewInner)
SceneView.displayName = 'SceneView'
export default SceneView
