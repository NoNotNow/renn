import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { CameraControl, CameraMode, FluidOrbitDirection, RennWorld } from '@/types/world'
import {
  CAMERA_LAG_MAX,
  CAMERA_LAG_MIN,
  DEFAULT_CAMERA_POSITION_LAG,
  DEFAULT_CAMERA_TARGET_LAG,
  DEFAULT_FLUID_ORBIT_HEIGHT,
  DEFAULT_FLUID_ORBIT_DISTANCE,
  DEFAULT_FLUID_ORBIT_SPEED_DEG,
  FLUID_ORBIT_HEIGHT_MAX,
  FLUID_ORBIT_HEIGHT_MIN,
  FLUID_ORBIT_DISTANCE_MAX,
  FLUID_ORBIT_DISTANCE_MIN,
  FLUID_ORBIT_SPEED_MAX_DEG,
  FLUID_ORBIT_SPEED_MIN_DEG,
} from '@/types/world'

export interface CameraState {
  control: CameraControl
  target: string
  mode: CameraMode
  /** Degrees; vertical framing vs target pivot (persisted as CameraConfig.targetVerticalAngle). */
  targetVerticalAngle: number
  /** Fluid mode: horizontal orbit speed in degrees per second. */
  fluidOrbitSpeed: number
  /** Fluid mode: +1 default, −1 reverses orbit direction. */
  fluidOrbitDirection: FluidOrbitDirection
  /** Fluid mode: camera height above target pivot (world units). */
  fluidOrbitHeight: number
  /** Fluid mode: orbit radius from target pivot (world units). */
  fluidOrbitDistance: number
  /** Follow modes: target pivot lag (0 = instant). */
  cameraTargetLag: number
  /** Follow modes: camera position lag (0 = instant). */
  cameraPositionLag: number
}

function clampFluidOrbitSpeed(deg: number): number {
  return Math.min(FLUID_ORBIT_SPEED_MAX_DEG, Math.max(FLUID_ORBIT_SPEED_MIN_DEG, deg))
}

function clampFluidOrbitHeight(height: number): number {
  return Math.min(FLUID_ORBIT_HEIGHT_MAX, Math.max(FLUID_ORBIT_HEIGHT_MIN, height))
}

function clampFluidOrbitDistance(distance: number): number {
  return Math.min(FLUID_ORBIT_DISTANCE_MAX, Math.max(FLUID_ORBIT_DISTANCE_MIN, distance))
}

function clampCameraLag(lag: number): number {
  return Math.min(CAMERA_LAG_MAX, Math.max(CAMERA_LAG_MIN, lag))
}

function fluidOrbitDirectionFromWorld(value: number | undefined): FluidOrbitDirection {
  return value === -1 ? -1 : 1
}

/** Camera UI state from world document; `targetFallback` when `camera.target` is absent (sample world uses `'ball'`). */
export function cameraStateFromWorld(world: RennWorld, targetFallback = ''): CameraState {
  const cam = world.world.camera
  return {
    control: (cam?.control ?? 'free') as CameraControl,
    target: cam?.target ?? targetFallback,
    mode: cam?.mode ?? 'follow',
    targetVerticalAngle: Math.min(45, Math.max(-45, cam?.targetVerticalAngle ?? 0)),
    fluidOrbitSpeed: clampFluidOrbitSpeed(cam?.fluidOrbitSpeed ?? DEFAULT_FLUID_ORBIT_SPEED_DEG),
    fluidOrbitDirection: fluidOrbitDirectionFromWorld(cam?.fluidOrbitDirection),
    fluidOrbitHeight: clampFluidOrbitHeight(
      cam?.fluidOrbitHeight ?? cam?.height ?? DEFAULT_FLUID_ORBIT_HEIGHT,
    ),
    fluidOrbitDistance: clampFluidOrbitDistance(
      cam?.fluidOrbitDistance ?? cam?.distance ?? DEFAULT_FLUID_ORBIT_DISTANCE,
    ),
    cameraTargetLag: clampCameraLag(cam?.cameraTargetLag ?? DEFAULT_CAMERA_TARGET_LAG),
    cameraPositionLag: clampCameraLag(cam?.cameraPositionLag ?? DEFAULT_CAMERA_POSITION_LAG),
  }
}

export interface UseCameraStateResult {
  cameraState: CameraState
  /** Mirrors `cameraState` synchronously so save paths read the latest value without waiting for a re-render. */
  cameraStateRef: MutableRefObject<CameraState>
  setCameraControl: (control: CameraControl) => void
  setCameraTarget: (target: string) => void
  setCameraMode: (mode: CameraMode | ((prev: CameraMode) => CameraMode)) => void
  setCameraTargetVerticalAngle: (degrees: number) => void
  setFluidOrbitSpeed: (degreesPerSecond: number) => void
  setFluidOrbitDirection: (direction: FluidOrbitDirection) => void
  setFluidOrbitHeight: (height: number) => void
  setFluidOrbitDistance: (distance: number) => void
  setCameraTargetLag: (lag: number) => void
  setCameraPositionLag: (lag: number) => void
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

  const setCameraTargetVerticalAngle = useCallback((degrees: number) => {
    const clamped = Math.min(45, Math.max(-45, degrees))
    setCameraState((prev) => ({ ...prev, targetVerticalAngle: clamped }))
  }, [])

  const setFluidOrbitSpeed = useCallback((degreesPerSecond: number) => {
    setCameraState((prev) => ({
      ...prev,
      fluidOrbitSpeed: clampFluidOrbitSpeed(degreesPerSecond),
    }))
  }, [])

  const setFluidOrbitDirection = useCallback((direction: FluidOrbitDirection) => {
    setCameraState((prev) => ({
      ...prev,
      fluidOrbitDirection: direction === -1 ? -1 : 1,
    }))
  }, [])

  const setFluidOrbitHeight = useCallback((height: number) => {
    setCameraState((prev) => ({
      ...prev,
      fluidOrbitHeight: clampFluidOrbitHeight(height),
    }))
  }, [])

  const setFluidOrbitDistance = useCallback((distance: number) => {
    setCameraState((prev) => ({
      ...prev,
      fluidOrbitDistance: clampFluidOrbitDistance(distance),
    }))
  }, [])

  const setCameraTargetLag = useCallback((lag: number) => {
    setCameraState((prev) => ({
      ...prev,
      cameraTargetLag: clampCameraLag(lag),
    }))
  }, [])

  const setCameraPositionLag = useCallback((lag: number) => {
    setCameraState((prev) => ({
      ...prev,
      cameraPositionLag: clampCameraLag(lag),
    }))
  }, [])

  const resetFromWorld = useCallback((world: RennWorld, targetFallback?: string) => {
    setCameraState(cameraStateFromWorld(world, targetFallback))
  }, [])

  return {
    cameraState,
    cameraStateRef,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
    setCameraTargetVerticalAngle,
    setFluidOrbitSpeed,
    setFluidOrbitDirection,
    setFluidOrbitHeight,
    setFluidOrbitDistance,
    setCameraTargetLag,
    setCameraPositionLag,
    resetFromWorld,
  }
}
