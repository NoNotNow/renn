import { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import type { RennWorld, Vec3, Rotation, CameraConfig } from '@/types/world'
import { DEFAULT_GRAVITY, DEFAULT_ROTATION } from '@/types/world'
import { eulerToQuaternion } from '@/utils/rotationUtils'
import type { LoadedEntity } from '@/loader/loadWorld'
import { CameraController } from '@/camera/cameraController'
import { createGameAPI } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useEditorInteractions } from '@/hooks/useEditorInteractions'
import { getSceneUserData } from '@/types/sceneUserData'

const FIXED_DT = 1 / 60

export interface SceneViewProps {
  world: RennWorld
  cameraConfig?: CameraConfig
  assets?: Map<string, Blob>
  runPhysics?: boolean
  runScripts?: boolean
  shadowsEnabled?: boolean
  className?: string
  selectedEntityId?: string | null
  onSelectEntity?: (entityId: string | null) => void
  onEntityPositionChange?: (entityId: string, position: Vec3) => void
  version?: number
}

export interface SceneViewHandle {
  setViewPreset: (preset: 'top' | 'front' | 'right') => void
  updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation }) => void
  getAllPoses: () => Map<string, { position: Vec3; rotation: Rotation }> | null
  resetCamera: () => void
}

function SceneViewInner({
  world,
  cameraConfig,
  assets: _assets = new Map(),
  runPhysics = true,
  runScripts = true,
  shadowsEnabled = true,
  className = '',
  selectedEntityId: _selectedEntityId,
  onSelectEntity,
  onEntityPositionChange,
  version = 0,
}: SceneViewProps, ref: React.Ref<SceneViewHandle>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<THREE.Scene | null>(null)
  const [camera, setCamera] = useState<THREE.PerspectiveCamera | null>(null)
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null)
  const cameraCtrlRef = useRef<CameraController | null>(null)
  const scriptRunnerRef = useRef<ScriptRunner | null>(null)
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const registryRef = useRef<RenderItemRegistry | null>(null)
  const entitiesRef = useRef<LoadedEntity[]>([])
  const assetResolverRef = useRef<{ dispose: () => void } | null>(null)
  const timeRef = useRef(0)
  const frameRef = useRef<number>(0)
  const effectIdRef = useRef(0)
  const savedCameraStateRef = useRef<{
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    up: THREE.Vector3
  } | null>(null)

  const freeFlyKeysRef = useKeyboardInput()

  useEditorInteractions({
    scene,
    camera,
    renderer,
    physicsRef,
    registryRef,
    onSelectEntity,
    onEntityPositionChange,
  })

  useImperativeHandle(ref, () => ({
    setViewPreset: (preset: 'top' | 'front' | 'right') => {
      cameraCtrlRef.current?.setViewPreset(preset)
    },
    updateEntityPose: (id: string, pose: { position?: Vec3; rotation?: Rotation }) => {
      if (pose.position) registryRef.current?.setPosition(id, pose.position)
      if (pose.rotation) registryRef.current?.setRotation(id, pose.rotation)
    },
    getAllPoses: () => registryRef.current?.getAllPoses() ?? null,
    resetCamera: () => {
      if (!camera) return
      
      // Clear saved camera state so it doesn't restore old position
      savedCameraStateRef.current = null
      
      // Get default position and rotation from world config
      const cameraConfig = world.world.camera
      const defaultPos = cameraConfig?.defaultPosition ?? [0, 5, 10]
      const defaultRot = cameraConfig?.defaultRotation ?? DEFAULT_ROTATION
      
      // Reset camera position and rotation
      camera.position.set(defaultPos[0], defaultPos[1], defaultPos[2])
      const quat = eulerToQuaternion(defaultRot)
      camera.quaternion.copy(quat)
      camera.up.set(0, 1, 0)
    }
  }), [camera, world.world.camera])

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
      
      // Check if we should restore saved camera state
      const currentCameraConfig = cameraConfig ?? world.world.camera
      const controlMode = currentCameraConfig?.control ?? 'free'
      const shouldRestore = controlMode === 'free' && savedCameraStateRef.current

      if (shouldRestore && savedCameraStateRef.current) {
        // Restore saved position, rotation, and up vector
        cam.position.copy(savedCameraStateRef.current.position)
        cam.quaternion.copy(savedCameraStateRef.current.quaternion)
        cam.up.copy(savedCameraStateRef.current.up)
      } else {
        // Use default position for new cameras or non-free modes
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

      cameraCtrl = new CameraController({
        camera: cam,
        scene: loadedScene,
        getEntityPosition,
      })
      cameraCtrlRef.current = cameraCtrl

      const getPhysicsWorld = () => physicsRef.current
      const getPositionForGame = (id: string): Vec3 | null =>
        registryRef.current?.getPosition(id) ?? null
      const setPositionForGame = (id: string, x: number, y: number, z: number): void =>
        registryRef.current?.setPosition(id, [x, y, z])
      const gameApi = createGameAPI(
        getPositionForGame,
        setPositionForGame,
        getPhysicsWorld,
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
            registryRef.current = RenderItemRegistry.create(entities, pw)
          })
        })
      } else {
        registryRef.current = RenderItemRegistry.create(entities, null)
      }

      // Animation loop
      const animate = (): void => {
        if (cancelled) return // Stop if effect is cleaning up
        frameRef.current = requestAnimationFrame(animate)
        const dt = FIXED_DT
        timeRef.current += dt
        

        const pw = physicsRef.current
        if (pw && runPhysics && !cancelled) {
          try {
            pw.step(dt)
            registryRef.current?.syncFromPhysics()

            if (scriptRunnerRef.current && runScripts) {
              const collisions = pw.getCollisions()
              for (const { entityIdA, entityIdB } of collisions) {
                scriptRunnerRef.current.runOnCollision(entityIdA, entityIdB)
                scriptRunnerRef.current.runOnCollision(entityIdB, entityIdA)
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

        if (scriptRunnerRef.current && runScripts) {
          scriptRunnerRef.current.runOnUpdate(dt)
        }

        const ctrl = cameraCtrlRef.current
        if (ctrl) {
          if ((ctrl.getConfig().control ?? 'free') === 'free' && freeFlyKeysRef.current) {
            ctrl.setFreeFlyInput(freeFlyKeysRef.current)
          }
          ctrl.update(dt)
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
      
      // Dispose asset resolver
      if (assetResolverRef.current) {
        assetResolverRef.current.dispose()
        assetResolverRef.current = null
      }
      
      // Save camera state if in free mode before cleanup
      if (cam && cameraCtrl) {
        const config = cameraCtrl.getConfig()
        if ((config.control ?? 'free') === 'free') {
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
      window.removeEventListener('resize', () => {})
      
      // Clear refs immediately to prevent any further use
      cameraCtrlRef.current = null
      scriptRunnerRef.current = null
      
      // Clear registry
      registryRef.current?.clear()
      registryRef.current = null
      
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
  }, [world, version, runPhysics, runScripts, shadowsEnabled, freeFlyKeysRef])

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
