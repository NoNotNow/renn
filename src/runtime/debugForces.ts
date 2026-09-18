import type { Vec3 } from '@/types/world'
import type { PhysicsWorld } from '@/physics/rapierPhysics'

export type ActiveDebugForce = {
  entityId: string
  force: Vec3
  endTime: number
}

/**
 * Validates entity + physics and appends a timed debug force. Returns false when skipped.
 */
export function tryEnqueueDebugForce(input: {
  physics: PhysicsWorld | null
  queue: ActiveDebugForce[]
  entityId: string
  force: Vec3
  endTime: number
  warn?: (message: string) => void
}): boolean {
  const { physics, queue, entityId, force, endTime, warn = console.warn } = input
  if (!physics) {
    warn('[SceneView] Cannot apply debug force: physics world not initialized')
    return false
  }
  const body = physics.getBody(entityId)
  if (!body || !body.isDynamic()) {
    warn(`[SceneView] Cannot apply debug force: entity "${entityId}" is not dynamic`)
    return false
  }
  queue.push({ entityId, force, endTime })
  return true
}

/**
 * Applies live debug forces, drops expired entries, compacts `forces` in place.
 */
export function processActiveDebugForcesInPlace(input: {
  forces: ActiveDebugForce[]
  currentTime: number
  editNavigationMode: boolean
  applyForce: (entityId: string, fx: number, fy: number, fz: number) => void
}): void {
  const { forces, currentTime, editNavigationMode, applyForce } = input
  let w = 0
  for (let r = 0; r < forces.length; r++) {
    const debugForce = forces[r]!
    if (currentTime >= debugForce.endTime) {
      continue
    }
    if (!editNavigationMode) {
      applyForce(
        debugForce.entityId,
        debugForce.force[0],
        debugForce.force[1],
        debugForce.force[2],
      )
    }
    forces[w++] = debugForce
  }
  forces.length = w
}
