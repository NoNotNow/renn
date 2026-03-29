import type { Vec3, Rotation } from '@/types/world'
import type { RenderItemRegistry } from './renderItemRegistry'

/** Pose map applied after registry creation (Builder restore after world edit). */
export type InitialPoseMap = Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>

/**
 * Applies stored poses to the registry, notifies parent, clears the ref.
 */
export function restoreInitialPosesIntoRegistry(
  registry: RenderItemRegistry,
  initialPosesRef: { current: InitialPoseMap | null } | undefined,
  onPosesRestored?: (poses: InitialPoseMap) => void,
): void {
  const poses = initialPosesRef?.current
  if (!poses || poses.size === 0) return
  for (const [id, pose] of poses) {
    if (registry.get(id)) {
      registry.setPosition(id, pose.position)
      registry.setRotation(id, pose.rotation)
      if (pose.scale) registry.setScale(id, pose.scale)
    }
  }
  onPosesRestored?.(poses)
  if (initialPosesRef) initialPosesRef.current = null
}
