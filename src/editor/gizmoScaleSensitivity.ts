import type { Vec3 } from '@/types/world'

/** Single-axis scale handle (X / Y / Z). */
export const GIZMO_SCALE_SENSITIVITY_AXIS = 0.45

/** Two-axis plane handles (XY / YZ / XZ). */
export const GIZMO_SCALE_SENSITIVITY_PLANE = 0.3

/** Uniform center handle (XYZ) — dampened most because ratio scaling is very aggressive. */
export const GIZMO_SCALE_SENSITIVITY_UNIFORM = 0.1

export function dampenGizmoScaleFactor(factor: number, sensitivity: number): number {
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(sensitivity)) return 1
  return 1 + (factor - 1) * sensitivity
}

function sensitivityForAxis(axis: string | null): number {
  if (axis === 'XYZ') return GIZMO_SCALE_SENSITIVITY_UNIFORM
  if (axis === 'XY' || axis === 'YZ' || axis === 'XZ') return GIZMO_SCALE_SENSITIVITY_PLANE
  return GIZMO_SCALE_SENSITIVITY_AXIS
}

/**
 * Recompute scale from drag start and raw TransformControls output with reduced sensitivity.
 */
export function applyGizmoScaleSensitivity(
  axis: string | null,
  scaleStart: Vec3,
  rawScale: Vec3,
): Vec3 {
  const sensitivity = sensitivityForAxis(axis)
  const [sx0, sy0, sz0] = scaleStart
  const [rx, ry, rz] = rawScale

  const fx = sx0 !== 0 ? rx / sx0 : 1
  const fy = sy0 !== 0 ? ry / sy0 : 1
  const fz = sz0 !== 0 ? rz / sz0 : 1

  const affectsX = axis?.includes('X') ?? false
  const affectsY = axis?.includes('Y') ?? false
  const affectsZ = axis?.includes('Z') ?? false

  return [
    affectsX ? sx0 * dampenGizmoScaleFactor(fx, sensitivity) : sx0,
    affectsY ? sy0 * dampenGizmoScaleFactor(fy, sensitivity) : sy0,
    affectsZ ? sz0 * dampenGizmoScaleFactor(fz, sensitivity) : sz0,
  ]
}
