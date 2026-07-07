import { useState } from 'react'
import {
  type Entity,
  type CameraMode,
  type FluidOrbitDirection,
  type RennWorld,
  type AvatarFocusSnapshot,
} from '@/types/world'
import type { AddableShapeType, BulkEntityParams } from '@/data/entityDefaults'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { uiLogger } from '@/utils/uiLogger'
import Sidebar from './layout/Sidebar'
import { TabIcons } from './TabIcons'
import WorldPanel from './WorldPanel'
import SoundPanel from './SoundPanel'
import BulkSpawnForm from './BulkSpawnForm'
import EntityListPanel from './entitySidebar/EntityListPanel'
import EntityCameraPanel from './entitySidebar/EntityCameraPanel'
import type { EntityExplorerSelectEntityOptions } from './EntityExplorerTree'

export interface EntitySidebarProps {
  entities: Entity[]
  entityWorkHistory: string[]
  selectedEntityIds: string[]
  /** Group IDs explicitly selected (in addition to entity selection). */
  selectedGroupIds: string[]
  cameraControl: 'free' | 'follow' | 'top' | 'front' | 'right'
  cameraTarget: string
  cameraMode: CameraMode
  /** Degrees; vertical framing vs target pivot (−45…45). */
  cameraTargetVerticalAngle: number
  fluidOrbitSpeed: number
  fluidOrbitDirection: FluidOrbitDirection
  fluidOrbitHeight: number
  fluidOrbitDistance: number
  cameraTargetLag: number
  cameraPositionLag: number
  world: RennWorld
  onSelectEntity: (id: string | null, options?: EntityExplorerSelectEntityOptions) => void
  onSelectGroup: (groupId: string, options?: { additive?: boolean }) => void
  onCreateGroupFromSelection: () => void
  onUngroup: (groupId: string) => void
  onAddSelectedToGroup: (groupId: string) => void
  onRemoveSelectedFromGroup: () => void
  onToggleGroupCollapsed: (groupId: string, collapsed: boolean) => void
  onRenameGroup: (groupId: string, name: string) => void
  onAddEntity: (shapeType: AddableShapeType) => void
  onBulkAddEntities: (params: BulkEntityParams) => void
  onCameraControlChange: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  onCameraTargetChange: (target: string) => void
  onCameraModeChange: (mode: CameraMode) => void
  onCameraTargetVerticalAngleChange: (degrees: number) => void
  onFluidOrbitSpeedChange: (degreesPerSecond: number) => void
  onFluidOrbitDirectionChange: (direction: FluidOrbitDirection) => void
  onFluidOrbitHeightChange: (height: number) => void
  onFluidOrbitDistanceChange: (distance: number) => void
  onCameraTargetLagChange: (lag: number) => void
  onCameraPositionLagChange: (lag: number) => void
  onWorldChange: (world: RennWorld) => void
  onSoundPlaybackCommand?: (action: 'play' | 'stop') => void
  /** Builder: read live follow/orbit state for "save as default" in Avatar dialog. */
  getAvatarFocusSnapshot?: () => AvatarFocusSnapshot | null
  isOpen: boolean
  onToggle: () => void
}

type LeftTab = 'entities' | 'camera' | 'actions' | 'world' | 'sound'

export default function EntitySidebar({
  entities,
  entityWorkHistory,
  selectedEntityIds,
  selectedGroupIds,
  cameraControl,
  cameraTarget,
  cameraMode,
  cameraTargetVerticalAngle,
  fluidOrbitSpeed,
  fluidOrbitDirection,
  fluidOrbitHeight,
  fluidOrbitDistance,
  cameraTargetLag,
  cameraPositionLag,
  world,
  onSelectEntity,
  onSelectGroup,
  onCreateGroupFromSelection,
  onUngroup,
  onAddSelectedToGroup,
  onRemoveSelectedFromGroup,
  onToggleGroupCollapsed,
  onRenameGroup,
  onAddEntity,
  onBulkAddEntities,
  onCameraControlChange,
  onCameraTargetChange,
  onCameraModeChange,
  onCameraTargetVerticalAngleChange,
  onFluidOrbitSpeedChange,
  onFluidOrbitDirectionChange,
  onFluidOrbitHeightChange,
  onFluidOrbitDistanceChange,
  onCameraTargetLagChange,
  onCameraPositionLagChange,
  onWorldChange,
  onSoundPlaybackCommand,
  getAvatarFocusSnapshot,
  isOpen,
  onToggle,
}: EntitySidebarProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>('camera')
  const [leftSidebarWidth, setLeftSidebarWidth] = useLocalStorageState('leftSidebarWidth', 240)

  const handleTabChange = (tab: string) => {
    uiLogger.click('Builder', 'Switch left panel tab', { tab })
    setLeftTab(tab as LeftTab)
  }

  return (
    <Sidebar
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      tabConfig={[
        { id: 'entities', icon: TabIcons.entities, label: 'Entities' },
        { id: 'camera', icon: TabIcons.camera, label: 'Camera' },
        { id: 'actions', icon: TabIcons.actions, label: 'Actions' },
        { id: 'world', icon: TabIcons.world, label: 'World' },
        { id: 'sound', icon: TabIcons.sound, label: 'Sound' },
      ]}
      activeTab={leftTab}
      onTabChange={handleTabChange}
      width={leftSidebarWidth}
      onWidthChange={setLeftSidebarWidth}
      toggleLogContext="Toggle left drawer"
    >
      <div
        style={{
          padding: 10,
          boxSizing: 'border-box',
          ...(leftTab === 'entities'
            ? {
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }
            : {}),
        }}
      >
        {leftTab === 'entities' && (
          <EntityListPanel
            entities={entities}
            world={world}
            entityWorkHistory={entityWorkHistory}
            selectedEntityIds={selectedEntityIds}
            selectedGroupIds={selectedGroupIds}
            onSelectEntity={onSelectEntity}
            onSelectGroup={onSelectGroup}
            onCreateGroupFromSelection={onCreateGroupFromSelection}
            onUngroup={onUngroup}
            onAddSelectedToGroup={onAddSelectedToGroup}
            onRemoveSelectedFromGroup={onRemoveSelectedFromGroup}
            onToggleGroupCollapsed={onToggleGroupCollapsed}
            onRenameGroup={onRenameGroup}
            onAddEntity={onAddEntity}
          />
        )}
        {leftTab === 'camera' && (
          <EntityCameraPanel
            entities={entities}
            entityWorkHistory={entityWorkHistory}
            world={world}
            cameraControl={cameraControl}
            cameraTarget={cameraTarget}
            cameraMode={cameraMode}
            cameraTargetVerticalAngle={cameraTargetVerticalAngle}
            fluidOrbitSpeed={fluidOrbitSpeed}
            fluidOrbitDirection={fluidOrbitDirection}
            fluidOrbitHeight={fluidOrbitHeight}
            fluidOrbitDistance={fluidOrbitDistance}
            cameraTargetLag={cameraTargetLag}
            cameraPositionLag={cameraPositionLag}
            onCameraControlChange={onCameraControlChange}
            onCameraTargetChange={onCameraTargetChange}
            onCameraModeChange={onCameraModeChange}
            onCameraTargetVerticalAngleChange={onCameraTargetVerticalAngleChange}
            onFluidOrbitSpeedChange={onFluidOrbitSpeedChange}
            onFluidOrbitDirectionChange={onFluidOrbitDirectionChange}
            onFluidOrbitHeightChange={onFluidOrbitHeightChange}
            onFluidOrbitDistanceChange={onFluidOrbitDistanceChange}
            onCameraTargetLagChange={onCameraTargetLagChange}
            onCameraPositionLagChange={onCameraPositionLagChange}
            onWorldChange={onWorldChange}
            getAvatarFocusSnapshot={getAvatarFocusSnapshot}
            onSelectEntity={onSelectEntity}
          />
        )}
        {leftTab === 'actions' && <BulkSpawnForm onBulkAddEntities={onBulkAddEntities} />}
        {leftTab === 'world' && (
          <WorldPanel world={world} onWorldChange={onWorldChange} />
        )}
        {leftTab === 'sound' && (
          <SoundPanel
            world={world}
            onWorldChange={onWorldChange}
            onPlaybackCommand={onSoundPlaybackCommand}
          />
        )}
      </div>
    </Sidebar>
  )
}
