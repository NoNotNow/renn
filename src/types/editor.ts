import type { RennWorld, PartialEntityPose } from './world'

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
  onEntityPoseChange?: (id: string, pose: PartialEntityPose) => void
}

/**
 * Base props for property-related components
 */
export interface BasePropertyProps {
  world: RennWorld
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
}
