import * as THREE from 'three'
import type { CachedTransform } from '@/physics/rapierPhysics'

export type VisualPoseState = {
  previousPosition: THREE.Vector3
  currentPosition: THREE.Vector3
  visualPosition: THREE.Vector3
  previousRotation: THREE.Quaternion
  currentRotation: THREE.Quaternion
  visualRotation: THREE.Quaternion
  initialized: boolean
}

/** Per-entity visual pose buffers for physics→mesh sync and display interpolation. */
export class VisualPoseStateRegistry {
  private readonly states = new Map<string, VisualPoseState>()

  get(id: string): VisualPoseState | undefined {
    return this.states.get(id)
  }

  delete(id: string): void {
    this.states.delete(id)
  }

  clear(): void {
    this.states.clear()
  }

  syncFromCached(id: string, cached: CachedTransform): VisualPoseState {
    let state = this.states.get(id)
    if (!state) {
      state = {
        previousPosition: new THREE.Vector3(),
        currentPosition: new THREE.Vector3(),
        visualPosition: new THREE.Vector3(),
        previousRotation: new THREE.Quaternion(),
        currentRotation: new THREE.Quaternion(),
        visualRotation: new THREE.Quaternion(),
        initialized: false,
      }
      this.states.set(id, state)
    }
    if (state.initialized) {
      state.previousPosition.copy(state.currentPosition)
      state.previousRotation.copy(state.currentRotation)
    } else {
      state.previousPosition.set(cached.position.x, cached.position.y, cached.position.z)
      state.previousRotation.set(cached.rotation.x, cached.rotation.y, cached.rotation.z, cached.rotation.w)
      state.initialized = true
    }
    state.currentPosition.set(cached.position.x, cached.position.y, cached.position.z)
    state.currentRotation.set(cached.rotation.x, cached.rotation.y, cached.rotation.z, cached.rotation.w)
    state.visualPosition.copy(state.currentPosition)
    state.visualRotation.copy(state.currentRotation)
    return state
  }
}
