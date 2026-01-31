import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { loadWorld } from '@/loader/loadWorld'
import type { RennWorld, Vec3 } from '@/types/world'
import { DEFAULT_GRAVITY } from '@/types/world'
import type { LoadedEntity } from '@/loader/loadWorld'
import { CameraController } from '@/camera/cameraController'
import { createGameAPI } from '@/scripts/gameApi'
import { ScriptRunner } from '@/scripts/scriptRunner'
import type { PhysicsWorld } from '@/physics/rapierPhysics'

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
  /** Editor-only: select entity by clicking in viewport */
  selectedEntityId?: string | null
  onSelectEntity?: (entityId: string | null) => void
  onEntityPositionChange?: (entityId: string, position: Vec3) => void
}

export default function SceneView({
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
  const editorPropsRef = useRef({ onSelectEntity, onEntityPositionChange })
  editorPropsRef.current = { onSelectEntity, onEntityPositionChange }
  const dragStateRef = useRef<{
    entityId: string
    plane: THREE.Plane
    intersectionTarget: THREE.Vector3
  } | null>(null)

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
    renderer.shadowMap.enabled = shadowsEnabled
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer
    const dirLight = (scene.userData as { directionalLight?: THREE.DirectionalLight }).directionalLight
    if (dirLight) dirLight.castShadow = shadowsEnabled
    camera.aspect = w / h
    camera.updateProjectionMatrix()

    let removePointerListeners: (() => void) | null = null
    // Editor: pointer handling for click-to-select and drag-to-move
    if (onSelectEntity) {
      const canvas = renderer.domElement
      const raycaster = new THREE.Raycaster()
      const ndc = new THREE.Vector2()
      const cameraDir = new THREE.Vector3()
      const intersectionTarget = new THREE.Vector3()

      const getEntityMeshes = (): THREE.Object3D[] =>
        scene.children.filter((o) => o.userData?.entityId != null)

      const setNdcFromEvent = (e: PointerEvent): void => {
        const rect = canvas.getBoundingClientRect()
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      }

      const onPointerDown = (e: PointerEvent): void => {
        setNdcFromEvent(e)
        raycaster.setFromCamera(ndc, camera)
        const hits = raycaster.intersectObjects(getEntityMeshes(), true)
        const hit = hits[0]
        if (!hit?.object?.userData?.entityId) {
          editorPropsRef.current.onSelectEntity?.(null)
          return
        }
        const entityId = hit.object.userData.entityId as string
        const mesh = hit.object as THREE.Mesh
        editorPropsRef.current.onSelectEntity?.(entityId)
        camera.getWorldDirection(cameraDir)
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          cameraDir.clone().negate(),
          mesh.position.clone()
        )
        dragStateRef.current = {
          entityId,
          plane,
          intersectionTarget: intersectionTarget.clone(),
        }
        canvas.setPointerCapture(e.pointerId)
      }

      const onPointerMove = (e: PointerEvent): void => {
        const drag = dragStateRef.current
        if (!drag) return
        setNdcFromEvent(e)
        raycaster.setFromCamera(ndc, camera)
        if (!raycaster.ray.intersectPlane(drag.plane, drag.intersectionTarget)) return
        const scene = sceneRef.current
        const mesh = scene?.getObjectByName(drag.entityId)
        if (mesh instanceof THREE.Mesh) {
          mesh.position.copy(drag.intersectionTarget)
          physicsRef.current?.setPosition(
            drag.entityId,
            drag.intersectionTarget.x,
            drag.intersectionTarget.y,
            drag.intersectionTarget.z
          )
        }
      }

      const onPointerUp = (e: PointerEvent): void => {
        const drag = dragStateRef.current
        if (drag) {
          const scene = sceneRef.current
          const mesh = scene?.getObjectByName(drag.entityId)
          if (mesh instanceof THREE.Mesh) {
            const pos = mesh.position
            editorPropsRef.current.onEntityPositionChange?.(drag.entityId, [
              pos.x,
              pos.y,
              pos.z,
            ])
          }
          canvas.releasePointerCapture(e.pointerId)
          dragStateRef.current = null
        }
      }

      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointercancel', onPointerUp)

      removePointerListeners = (): void => {
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointercancel', onPointerUp)
        dragStateRef.current = null
      }
    }

    // Initialize physics (async - guard against effect cleanup before completion)
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

    const animate = (): void => {
      frameRef.current = requestAnimationFrame(animate)
      const dt = FIXED_DT
      timeRef.current += dt

      // Use physicsRef.current (not closure) so we never step after dispose
      const pw = physicsRef.current
      if (pw && runPhysics) {
        pw.step(dt)
        pw.syncToMeshes()

        // Handle collision events
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
      removePointerListeners?.()
      cancelled = true
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(frameRef.current)
      const pw = physicsRef.current
      physicsRef.current = null // Prevent animate from stepping disposed world
      if (pw) pw.dispose()
      renderer.dispose()
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      cameraCtrlRef.current = null
      scriptRunnerRef.current = null
    }
  }, [world, runPhysics, runScripts, gravityEnabled, getMeshById])

  useEffect(() => {
    if (!runPhysics) return
    const pw = physicsRef.current
    if (!pw) return
    const gravity = gravityEnabled ? (world.world.gravity ?? DEFAULT_GRAVITY) : ZERO_GRAVITY
    pw.setGravity(gravity)
  }, [gravityEnabled, world.world.gravity, runPhysics])

  useEffect(() => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    if (renderer) renderer.shadowMap.enabled = shadowsEnabled
    const dirLight = scene?.userData
      ? (scene.userData as { directionalLight?: THREE.DirectionalLight }).directionalLight
      : undefined
    if (dirLight) dirLight.castShadow = shadowsEnabled
  }, [shadowsEnabled])

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}
