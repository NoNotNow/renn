import { useState, useEffect } from 'react'
import type { Vec3, Quat } from '@/types/world'
import Vec3Field from './Vec3Field'
import QuatField from './QuatField'
import { uiLogger } from '@/utils/uiLogger'

export interface TransformEditorProps {
  entityId: string
  position: Vec3
  rotation: Quat
  scale: Vec3
  onPositionChange: (position: Vec3) => void
  onRotationChange: (rotation: Quat) => void
  onScaleChange: (scale: Vec3) => void
  getCurrentPose?: (id: string) => { position: Vec3; rotation: Quat }
}

export default function TransformEditor({
  entityId,
  position,
  rotation,
  scale,
  onPositionChange,
  onRotationChange,
  onScaleChange,
  getCurrentPose,
}: TransformEditorProps) {
  const [displayPosition, setDisplayPosition] = useState(position)
  const [displayRotation, setDisplayRotation] = useState(rotation)

  // Poll current pose from registry if available
  useEffect(() => {
    if (!getCurrentPose) {
      setDisplayPosition(position)
      setDisplayRotation(rotation)
      return
    }

    const interval = setInterval(() => {
      const pose = getCurrentPose(entityId)
      setDisplayPosition(pose.position)
      setDisplayRotation(pose.rotation)
    }, 100)

    return () => clearInterval(interval)
  }, [entityId, getCurrentPose, position, rotation])

  return (
    <>
      <Vec3Field
        label="Position"
        value={displayPosition}
        onChange={(v) => {
          uiLogger.change('PropertyPanel', 'Change position', { entityId, oldValue: displayPosition, newValue: v })
          setDisplayPosition(v)
          onPositionChange(v)
        }}
        sensitivity={0.05}
        idPrefix={`${entityId}-position`}
      />
      <QuatField
        label="Rotation (quat)"
        value={displayRotation}
        onChange={(q) => {
          uiLogger.change('PropertyPanel', 'Change rotation', { entityId, oldValue: displayRotation, newValue: q })
          setDisplayRotation(q)
          onRotationChange(q)
        }}
        idPrefix={`${entityId}-rotation`}
      />
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
      />
    </>
  )
}
