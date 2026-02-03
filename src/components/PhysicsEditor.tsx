import type { Entity } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { sidebarRowStyle, sidebarLabelStyle, sidebarInputStyle } from './sharedStyles'

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
  disabled?: boolean
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
  disabled = false,
}: PhysicsEditorProps) {
  return (
    <>
      <div style={sidebarRowStyle}>
        <label htmlFor={`${entityId}-body-type`} style={sidebarLabelStyle}>
          Body type
        </label>
        <select
          id={`${entityId}-body-type`}
          value={bodyType}
          onChange={(e) => {
            uiLogger.change('PropertyPanel', 'Change body type', { entityId, oldValue: bodyType, newValue: e.target.value })
            onBodyTypeChange(e.target.value as Entity['bodyType'])
          }}
          style={sidebarInputStyle}
          disabled={disabled}
        >
          <option value="static">Static</option>
          <option value="dynamic">Dynamic</option>
          <option value="kinematic">Kinematic</option>
        </select>
      </div>
      {bodyType === 'dynamic' && (
        <>
          <div style={sidebarRowStyle}>
            <label htmlFor={`${entityId}-mass`} style={sidebarLabelStyle}>
              Mass
            </label>
            <input
              id={`${entityId}-mass`}
              type="number"
              min={0}
              step={0.1}
              value={mass}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                uiLogger.change('PropertyPanel', 'Change mass', { entityId, oldValue: mass, newValue })
                onMassChange(newValue)
              }}
              style={sidebarInputStyle}
              disabled={disabled}
            />
          </div>
          <div style={sidebarRowStyle}>
            <label htmlFor={`${entityId}-restitution`} style={sidebarLabelStyle}>
              Restitution
            </label>
            <input
              id={`${entityId}-restitution`}
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
              style={sidebarInputStyle}
              disabled={disabled}
            />
          </div>
        </>
      )}
      <div style={sidebarRowStyle}>
        <label htmlFor={`${entityId}-friction`} style={sidebarLabelStyle}>
          Friction
        </label>
        <input
          id={`${entityId}-friction`}
          type="number"
          min={0}
          step={0.1}
          value={friction}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value) || 0
            uiLogger.change('PropertyPanel', 'Change friction', { entityId, oldValue: friction, newValue })
            onFrictionChange(newValue)
          }}
          style={sidebarInputStyle}
          disabled={disabled}
        />
      </div>
    </>
  )
}
