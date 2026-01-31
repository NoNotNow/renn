import type { Entity } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'

const labelStyle = { display: 'block', marginBottom: 8 }
const inputStyle = { display: 'block', width: '100%' }

export interface PhysicsEditorProps {
  entityId: string
  bodyType: Entity['bodyType']
  mass: number
  restitution: number
  friction: number
  onBodyTypeChange: (bodyType: Entity['bodyType']) => void
  onMassChange: (mass: number) => void
  onRestitutionChange: (restitution: number) => void
  onFrictionChange: (friction: number) => void
}

export default function PhysicsEditor({
  entityId,
  bodyType = 'static',
  mass,
  restitution,
  friction,
  onBodyTypeChange,
  onMassChange,
  onRestitutionChange,
  onFrictionChange,
}: PhysicsEditorProps) {
  return (
    <>
      <label style={labelStyle}>
        Body type
        <select
          value={bodyType}
          onChange={(e) => {
            uiLogger.change('PropertyPanel', 'Change body type', { entityId, oldValue: bodyType, newValue: e.target.value })
            onBodyTypeChange(e.target.value as Entity['bodyType'])
          }}
          style={inputStyle}
        >
          <option value="static">Static</option>
          <option value="dynamic">Dynamic</option>
          <option value="kinematic">Kinematic</option>
        </select>
      </label>
      {bodyType === 'dynamic' && (
        <>
          <label style={labelStyle}>
            Mass
            <input
              type="number"
              min={0}
              step={0.1}
              value={mass}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                uiLogger.change('PropertyPanel', 'Change mass', { entityId, oldValue: mass, newValue })
                onMassChange(newValue)
              }}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Restitution
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={restitution}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                uiLogger.change('PropertyPanel', 'Change restitution', { entityId, oldValue: restitution, newValue })
                onRestitutionChange(newValue)
              }}
              style={inputStyle}
            />
          </label>
        </>
      )}
      <label style={labelStyle}>
        Friction
        <input
          type="number"
          min={0}
          step={0.1}
          value={friction}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value) || 0
            uiLogger.change('PropertyPanel', 'Change friction', { entityId, oldValue: friction, newValue })
            onFrictionChange(newValue)
          }}
          style={inputStyle}
        />
      </label>
    </>
  )
}
