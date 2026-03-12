import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { findEntityRootForPicking } from '@/utils/entityPicking'
import type { Vec3 } from '@/types/world'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'

export interface EditorInteractionsProps {
  scene: THREE.Scene | null
  camera: THREE.PerspectiveCamera | null
  renderer: THREE.WebGLRenderer | null
  physicsRef: React.RefObject<PhysicsWorld | null>
  registryRef: React.RefObject<RenderItemRegistry | null>
  onSelectEntity?: (entityId: string | null) => void
  onEntityPositionChange?: (entityId: string, position: Vec3) => void
}

export function useEditorInteractions({
  scene,
  camera,
  renderer,
  physicsRef,
  registryRef,
  onSelectEntity,
  onEntityPositionChange,
}: EditorInteractionsProps) {
  const dragStateRef = useRef<{
    entityId: string
    plane: THREE.Plane
    intersectionTarget: THREE.Vector3
  } | null>(null)
  
  const editorPropsRef = useRef({ onSelectEntity, onEntityPositionChange })
  editorPropsRef.current = { onSelectEntity, onEntityPositionChange }

  useEffect(() => {
    if (!scene || !camera || !renderer || !onSelectEntity) return

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
      if (e.button === 1) return // middle mouse reserved for camera orbit
      setNdcFromEvent(e)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(getEntityMeshes(), true)
      const hit = hits[0]
      const entityRoot = hit?.object ? findEntityRootForPicking(hit.object) : null
      if (!entityRoot) {
        editorPropsRef.current.onSelectEntity?.(null)
        return
      }
      const entityId = entityRoot.userData.entityId as string
      editorPropsRef.current.onSelectEntity?.(entityId)

      // Check if entity is locked - prevent dragging but allow selection
      const entity = entityRoot.userData.entity
      if (entity?.locked) {
        return
      }

      // Plane through entity root world position (child mesh.position would be local)
      camera.getWorldDirection(cameraDir)
      const planePoint = new THREE.Vector3()
      entityRoot.getWorldPosition(planePoint)
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        cameraDir.clone().negate(),
        planePoint
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
      const pos: Vec3 = [
        drag.intersectionTarget.x,
        drag.intersectionTarget.y,
        drag.intersectionTarget.z,
      ]
      const reg = registryRef.current
      if (reg) {
        reg.setPosition(drag.entityId, pos)
      } else {
        const mesh = scene.getObjectByName(drag.entityId)
        if (mesh instanceof THREE.Mesh) {
          mesh.position.copy(drag.intersectionTarget)
          physicsRef.current?.setPosition(drag.entityId, pos[0], pos[1], pos[2])
        }
      }
    }

    const onPointerUp = (e: PointerEvent): void => {
      const drag = dragStateRef.current
      if (drag) {
        const reg = registryRef.current
        const pos: Vec3 = reg
          ? (reg.getPosition(drag.entityId) ?? [0, 0, 0])
          : (() => {
              const mesh = scene.getObjectByName(drag.entityId)
              return mesh instanceof THREE.Mesh
                ? [mesh.position.x, mesh.position.y, mesh.position.z]
                : [0, 0, 0]
            })()
        editorPropsRef.current.onEntityPositionChange?.(drag.entityId, pos)
        canvas.releasePointerCapture(e.pointerId)
        dragStateRef.current = null
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      dragStateRef.current = null
    }
  }, [scene, camera, renderer, onSelectEntity, physicsRef, registryRef])

  return { dragStateRef }
}
