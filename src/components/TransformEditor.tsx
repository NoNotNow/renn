import type { Vec3, Rotation } from '@/types/world'
import Vec3Field from './Vec3Field'
import { uiLogger } from '@/utils/uiLogger'
import { entityPanelIconButtonStyle } from './sharedStyles'
import { EntityPanelIcons } from './EntityPanelIcons'

export interface Vec3UndoProps {
  onScrubStart?: () => void
  onScrubEnd?: (hadScrub: boolean) => void
  onBeforeCommit?: () => void
}

export interface TransformEditorProps {
  entityId: string
  /** `null` = mixed multi-select (empty fields). */
  position: Vec3 | null
  rotation: Rotation | null
  scale: Vec3 | null
  onPositionChange: (position: Vec3) => void
  onRotationChange: (rotation: Rotation) => void
  onScaleChange: (scale: Vec3) => void
  disabled?: boolean
  /** Undo: one step per scrub / blur on draggable vec3 fields; use onBeforeCommit before reset clicks. */
  vec3Undo?: Vec3UndoProps
}

export default function TransformEditor({
  entityId,
  position,
  rotation,
  scale,
  onPositionChange,
  onRotationChange,
  onScaleChange,
  disabled = false,
  vec3Undo,
}: TransformEditorProps) {
  return (
    <>
      <Vec3Field
        label="Position"
        value={position}
        onChange={(v) => {
          uiLogger.change('PropertyPanel', 'Change position', { entityId, oldValue: position, newValue: v })
          onPositionChange(v)
        }}
        sensitivity={0.05}
        idPrefix={`${entityId}-position`}
        disabled={disabled}
        onScrubStart={vec3Undo?.onScrubStart}
        onScrubEnd={vec3Undo?.onScrubEnd}
        onBeforeCommit={vec3Undo?.onBeforeCommit}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Vec3Field
          label="Rotation"
          value={rotation}
          onChange={(r) => {
            uiLogger.change('PropertyPanel', 'Change rotation', { entityId, oldValue: rotation, newValue: r })
            onRotationChange(r)
          }}
          axisLabels={['X', 'Y', 'Z']}
          idPrefix={`${entityId}-rotation`}
          disabled={disabled}
          onScrubStart={vec3Undo?.onScrubStart}
          onScrubEnd={vec3Undo?.onScrubEnd}
          onBeforeCommit={vec3Undo?.onBeforeCommit}
        />
        <button
          type="button"
          title="Reset rotation to 0,0,0"
          aria-label="Reset rotation to 0,0,0"
          onClick={() => {
            vec3Undo?.onBeforeCommit?.()
            uiLogger.change('PropertyPanel', 'Reset rotation', { entityId })
            onRotationChange([0, 0, 0])
          }}
          disabled={disabled}
          style={{
            ...entityPanelIconButtonStyle,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {EntityPanelIcons.reset}
        </button>
      </div>
      <Vec3Field
        label="Scale"
        value={scale}
        onChange={(v) => {
          uiLogger.change('PropertyPanel', 'Change scale', { entityId, oldValue: scale, newValue: v })
          onScaleChange(v)
        }}
        min={0.01}
        step={0.1}
        sensitivity={0.01}
        idPrefix={`${entityId}-scale`}
        disabled={disabled}
        onScrubStart={vec3Undo?.onScrubStart}
        onScrubEnd={vec3Undo?.onScrubEnd}
        onBeforeCommit={vec3Undo?.onBeforeCommit}
      />
    </>
  )
}
