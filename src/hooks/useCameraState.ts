import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { CameraControl, CameraMode, RennWorld } from '@/types/world'

export interface CameraState {
  control: CameraControl
  target: string
  mode: CameraMode
}

/** Camera UI state from world document; `targetFallback` when `camera.target` is absent (sample world uses `'ball'`). */
export function cameraStateFromWorld(world: RennWorld, targetFallback = ''): CameraState {
  const cam = world.world.camera
  return {
    control: (cam?.control ?? 'free') as CameraControl,
    target: cam?.target ?? targetFallback,
    mode: cam?.mode ?? 'follow',
  }
}

export interface UseCameraStateResult {
  cameraState: CameraState
  /** Mirrors `cameraState` synchronously so save paths read the latest value without waiting for a re-render. */
  cameraStateRef: MutableRefObject<CameraState>
  setCameraControl: (control: CameraControl) => void
  setCameraTarget: (target: string) => void
  setCameraMode: (mode: CameraMode | ((prev: CameraMode) => CameraMode)) => void
  /** Replace the entire camera state from a freshly loaded / imported world. */
  resetFromWorld: (world: RennWorld, targetFallback?: string) => void
}

/**
 * Owns the Builder camera UI state (control / target / mode) plus a synchronous
 * ref mirror used by save paths. Extracted from `ProjectContext` to keep the
 * provider focused on project lifecycle rather than camera plumbing.
 */
export function useCameraState(initialWorld: RennWorld, initialTargetFallback = ''): UseCameraStateResult {
  const [cameraState, setCameraState] = useState<CameraState>(() =>
    cameraStateFromWorld(initialWorld, initialTargetFallback),
  )
  const cameraStateRef = useRef<CameraState>(cameraStateFromWorld(initialWorld, initialTargetFallback))

  useEffect(() => {
    cameraStateRef.current = cameraState
  }, [cameraState])

  const setCameraControl = useCallback((control: CameraControl) => {
    setCameraState((prev) => ({ ...prev, control }))
  }, [])

  const setCameraTarget = useCallback((target: string) => {
    setCameraState((prev) => ({ ...prev, target }))
  }, [])

  const setCameraMode = useCallback(
    (mode: CameraMode | ((prev: CameraMode) => CameraMode)) => {
      setCameraState((prev) => ({
        ...prev,
        mode: typeof mode === 'function' ? mode(prev.mode) : mode,
      }))
    },
    [],
  )

  const resetFromWorld = useCallback((world: RennWorld, targetFallback?: string) => {
    setCameraState(cameraStateFromWorld(world, targetFallback))
  }, [])

  return {
    cameraState,
    cameraStateRef,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
    resetFromWorld,
  }
}
