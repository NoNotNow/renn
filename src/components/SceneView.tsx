import { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import type { RennWorld, Vec3 } from '@/types/world'
import { DEFAULT_GRAVITY } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import { CameraController } from '@/camera/cameraController'
import { createGameAPI } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useEditorInteractions } from '@/hooks/useEditorInteractions'
import { getSceneUserData } from '@/types/sceneUserData'

const FIXED_DT = 1 / 60
const ZERO_GRAVITY: [number, number, number] = [0, 0, 0]

export interface SceneViewProps {
  world: RennWorld
  assets?: Map<string, Blob>
  runPhysics?: boolean
  runScripts?: boolean
  gravityEnabled?: boolean
  shadowsEnabled?: boolean
  className?: string
  selectedEntityId?: string | null
  onSelectEntity?: (entityId: string | null) => void
  onEntityPositionChange?: (entityId: string, position: Vec3) => void
}

export interface SceneViewHandle {
  setViewPreset: (preset: 'top' | 'front' | 'right') => void
}

function SceneViewInner({
  world,
  assets: _assets = new Map(),
  runPhysics = true,
  runScripts = true,
  gravityEnabled = true,
  shadowsEnabled = true,
  className = '',
  selectedEntityId: _selectedEntityId,
  onSelectEntity,
  onEntityPositionChange,
}: SceneViewProps, ref: React.Ref<SceneViewHandle>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<THREE.Scene | null>(null)
  const [camera, setCamera] = useState<THREE.PerspectiveCamera | null>(null)
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null)
  const cameraCtrlRef = useRef<CameraController | null>(null)
  const scriptRunnerRef = useRef<ScriptRunner | null>(null)
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const entitiesRef = useRef<LoadedEntity[]>([])
  const timeRef = useRef(0)
  const frameRef = useRef<number>(0)

  const freeFlyKeysRef = useKeyboardInput()

  useEditorInteractions({
    scene,
    camera,
    renderer,
    physicsRef,
    onSelectEntity,
    onEntityPositionChange,
  })

  useImperativeHandle(ref, () => ({
    setViewPreset: (preset: 'top' | 'front' | 'right') => {
      cameraCtrlRef.current?.setViewPreset(preset)
    },
  }), [])

  // Main scene setup effect
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { scene: loadedScene, entities, world: loadedWorld } = loadWorld(world)
    entitiesRef.current = entities
    setScene(loadedScene)

    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    cam.position.set(0, 5, 10)
    cam.lookAt(0, 0, 0)
    setCamera(cam)

    const getEntityPosition = (entityId: string): THREE.Vector3 | null => {
      const obj = loadedScene.getObjectByName(entityId)
      return obj instanceof THREE.Mesh ? obj.position.clone() : null
    }

    const cameraCtrl = new CameraController({
      camera: cam,
      scene: loadedScene,
      getEntityPosition,
    })
    cameraCtrlRef.current = cameraCtrl

    const getPhysicsWorld = () => physicsRef.current
    const gameApi = createGameAPI(
      (id) => {
        const obj = loadedScene.getObjectByName(id)
        return obj instanceof THREE.Mesh ? obj : null
      },
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

    const rend = new THREE.WebGLRenderer({ antialias: true })
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
    let cancelled = false
    if (runPhysics) {
      const gravity = gravityEnabled ? (loadedWorld.world.gravity ?? DEFAULT_GRAVITY) : ZERO_GRAVITY
      import('@/physics/rapierPhysics').then((mod) => {
        mod.createPhysicsWorld(loadedWorld, entities).then((pw) => {
          if (cancelled) {
            pw.dispose()
            return
          }
          pw.setGravity(gravity)
          physicsRef.current = pw
        })
      })
    }

    // Animation loop
    const animate = (): void => {
      frameRef.current = requestAnimationFrame(animate)
      const dt = FIXED_DT
      timeRef.current += dt

      const pw = physicsRef.current
      if (pw && runPhysics) {
        pw.step(dt)
        pw.syncToMeshes()

        if (scriptRunnerRef.current && runScripts) {
          const collisions = pw.getCollisions()
          for (const { entityIdA, entityIdB } of collisions) {
            scriptRunnerRef.current.runOnCollision(entityIdA, entityIdB)
            scriptRunnerRef.current.runOnCollision(entityIdB, entityIdA)
          }
        }
      }

      if (scriptRunnerRef.current && runScripts) {
        scriptRunnerRef.current.runOnUpdate(dt)
      }

      const ctrl = cameraCtrlRef.current
      if (ctrl) {
        if ((ctrl.getConfig().control ?? 'free') === 'free') {
          ctrl.setFreeFlyInput(freeFlyKeysRef.current)
        }
        ctrl.update(dt)
      }

      if (rend && loadedScene && cam) {
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
    const ro = new ResizeObserver(onResize)
    ro.observe(container)

    return () => {
      cancelled = true
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(frameRef.current)
      const pw = physicsRef.current
      physicsRef.current = null
      if (pw) pw.dispose()
      rend.dispose()
      if (container && rend.domElement.parentNode === container) {
        container.removeChild(rend.domElement)
      }
      setScene(null)
      setCamera(null)
      setRenderer(null)
      cameraCtrlRef.current = null
      scriptRunnerRef.current = null
    }
  }, [world, runPhysics, runScripts, gravityEnabled, shadowsEnabled, freeFlyKeysRef])

  // Update gravity when it changes
  useEffect(() => {
    if (!runPhysics) return
    const pw = physicsRef.current
    if (!pw) return
    const gravity = gravityEnabled ? (world.world.gravity ?? DEFAULT_GRAVITY) : ZERO_GRAVITY
    pw.setGravity(gravity)
  }, [gravityEnabled, world.world.gravity, runPhysics])

  // Update shadows when setting changes
  useEffect(() => {
    if (renderer) renderer.shadowMap.enabled = shadowsEnabled
    if (scene) {
      const sceneUserData = getSceneUserData(scene)
      if (sceneUserData.directionalLight) sceneUserData.directionalLight.castShadow = shadowsEnabled
    }
  }, [shadowsEnabled, renderer, scene])

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}

const SceneView = forwardRef<SceneViewHandle, SceneViewProps>(SceneViewInner)
SceneView.displayName = 'SceneView'
export default SceneView
