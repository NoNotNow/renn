import * as THREE from 'three'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { DistanceCullingSettings } from '@/types/world'
import { distanceCullingShouldCull } from '@/utils/distanceCullingMath'
import type { RenderItem } from './renderItem'

/** Previous frame's `sleepCulled` flag (registry-owned; mutated by these passes). */
export type DistanceCullingSleepToggleState = {
  lastSleepCulled: boolean | undefined
}

/**
 * Per-frame distance culling over render items: visibility, optional physics sleep,
 * and script-skip id registration. See {@link RenderItemRegistry.applyDistanceCulling}.
 */
export function applyDistanceCullingPass(
  items: Iterable<RenderItem>,
  camPos: THREE.Vector3,
  settings: DistanceCullingSettings,
  physicsWorld: PhysicsWorld | null,
  culledSleepingForScripts: Set<string>,
  sleepToggle: DistanceCullingSleepToggleState,
): void {
  const sleepCulled = settings.sleepCulled === true
  const pw = physicsWorld

  if (sleepToggle.lastSleepCulled === true && !sleepCulled) {
    for (const item of items) {
      if (item.distanceCullingPhysicsFrozen && pw) {
        pw.enableBodyFromCulling(item.entity.id)
      }
      item.distanceCullingPhysicsFrozen = false
      culledSleepingForScripts.delete(item.entity.id)
    }
  }
  sleepToggle.lastSleepCulled = sleepCulled

  for (const item of items) {
    const m = item.mesh.position
    const dx = m.x - camPos.x
    const dy = m.y - camPos.y
    const dz = m.z - camPos.z
    const distSq = dx * dx + dy * dy + dz * dz

    const ws = item.worldSize
    const shouldCull = distanceCullingShouldCull(
      distSq,
      ws,
      settings.maxDistance,
      settings.minSizeDistanceRatio,
    )

    const wantScriptSleep = shouldCull && sleepCulled
    const shouldFreezeBody = wantScriptSleep && item.hasPhysicsBody()

    if (shouldFreezeBody) {
      if (pw && !item.distanceCullingPhysicsFrozen) {
        pw.disableBodyForCulling(item.entity.id)
        item.distanceCullingPhysicsFrozen = true
      }
    } else {
      if (item.distanceCullingPhysicsFrozen && pw) {
        pw.enableBodyFromCulling(item.entity.id)
      }
      item.distanceCullingPhysicsFrozen = false
    }

    if (wantScriptSleep) {
      culledSleepingForScripts.add(item.entity.id)
    } else {
      culledSleepingForScripts.delete(item.entity.id)
    }

    if (shouldCull !== item.distanceCulled) {
      item.distanceCulled = shouldCull
      item.mesh.visible = !shouldCull
    }
  }
}

/** Restore visibility and physics; call when culling is disabled. */
export function clearDistanceCullingPass(
  items: Iterable<RenderItem>,
  physicsWorld: PhysicsWorld | null,
  culledSleepingForScripts: Set<string>,
  sleepToggle: DistanceCullingSleepToggleState,
): void {
  const pw = physicsWorld
  for (const item of items) {
    if (item.distanceCullingPhysicsFrozen && pw) {
      pw.enableBodyFromCulling(item.entity.id)
    }
    item.distanceCullingPhysicsFrozen = false
    if (item.distanceCulled) {
      item.distanceCulled = false
      item.mesh.visible = true
    }
  }
  culledSleepingForScripts.clear()
  sleepToggle.lastSleepCulled = undefined
}
