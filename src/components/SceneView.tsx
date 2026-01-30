import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import type { RennWorld } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import { CameraController } from '@/camera/cameraController'
import { createGameAPI } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { PhysicsWorld } from '@/physics/rapierPhysics'

const FIXED_DT = 1 / 60

export interface SceneViewProps {
  world: RennWorld
  assets?: Map<string, Blob>
  runPhysics?: boolean
  runScripts?: boolean
  className?: string
}

export default function SceneView({
  world,
  assets: _assets = new Map(),
  runPhysics = true,
  runScripts = true,
  className = '',
}: SceneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraCtrlRef = useRef<CameraController | null>(null)
  const scriptRunnerRef = useRef<ScriptRunner | null>(null)
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const entitiesRef = useRef<LoadedEntity[]>([])
  const timeRef = useRef(0)
  const frameRef = useRef<number>(0)

  const getMeshById = useCallback((id: string): THREE.Mesh | null => {
    const scene = sceneRef.current
    if (!scene) return null
    const obj = scene.getObjectByName(id)
    return obj instanceof THREE.Mesh ? obj : null
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { scene, entities, world: loadedWorld } = loadWorld(world)
    entitiesRef.current = entities
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(0, 5, 10)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const getEntityPosition = (entityId: string): THREE.Vector3 | null => {
      const mesh = getMeshById(entityId)
      return mesh ? mesh.position.clone() : null
    }

    const cameraCtrl = new CameraController({
      camera,
      scene,
      getEntityPosition,
    })
    cameraCtrlRef.current = cameraCtrl

    const getPhysicsWorld = () => physicsRef.current
    const gameApi = createGameAPI(getMeshById, getPhysicsWorld, loadedWorld.entities, timeRef)
    const scriptRunner = new ScriptRunner(loadedWorld, gameApi, getMeshById, entities)
    scriptRunnerRef.current = scriptRunner
    for (const { entity } of entities) {
      scriptRunner.runOnSpawn(entity.id)
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    const w = Math.max(container.clientWidth || 800, 1)
    const h = Math.max(container.clientHeight || 600, 1)
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer
    camera.aspect = w / h
    camera.updateProjectionMatrix()

    // Initialize physics
    let physicsWorld: PhysicsWorld | null = null
    if (runPhysics) {
      import('@/physics/rapierPhysics').then((mod) => {
        mod.createPhysicsWorld(loadedWorld, entities).then((pw) => {
          physicsWorld = pw
          physicsRef.current = pw
        })
      })
    }

    const animate = (): void => {
      frameRef.current = requestAnimationFrame(animate)
      const dt = FIXED_DT
      timeRef.current += dt

      // Step physics and sync transforms
      if (physicsWorld && runPhysics) {
        physicsWorld.step(dt)
        physicsWorld.syncToMeshes()

        // Handle collision events
        if (scriptRunnerRef.current && runScripts) {
          const collisions = physicsWorld.getCollisions()
          for (const { entityIdA, entityIdB } of collisions) {
            scriptRunnerRef.current.runOnCollision(entityIdA, entityIdB)
            scriptRunnerRef.current.runOnCollision(entityIdB, entityIdA)
          }
        }
      }

      if (scriptRunnerRef.current && runScripts) {
        scriptRunnerRef.current.runOnUpdate(dt)
      }

      if (cameraCtrlRef.current) cameraCtrlRef.current.update(dt)

      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }
    }
    animate()

    const onResize = (): void => {
      if (!container || !camera || !renderer) return
      const w = Math.max(container.clientWidth || 1, 1)
      const h = Math.max(container.clientHeight || 1, 1)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(container)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(frameRef.current)
      renderer.dispose()
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      if (physicsRef.current) {
        physicsRef.current.dispose()
      }
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      cameraCtrlRef.current = null
      scriptRunnerRef.current = null
      physicsRef.current = null
    }
  }, [world, runPhysics, runScripts, getMeshById])

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}
