import type { RennWorld, EntityPose, PartialEntityPose } from './world'

/**
 * Base props for all editor components
 */
export interface BaseEditorProps {
  entityId: string
  disabled?: boolean
}

/**
 * Props for components that handle entity pose changes
 */
export interface PoseHandlingProps {
  getCurrentPose?: (id: string) => EntityPose
  onEntityPoseChange?: (id: string, pose: PartialEntityPose) => void
}

/**
 * Base props for property-related components
 */
export interface BasePropertyProps {
  world: RennWorld
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
}
