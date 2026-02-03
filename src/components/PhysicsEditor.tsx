import type { Entity } from '@/types/world'
import SelectInput from './form/SelectInput'
import NumberInput from './form/NumberInput'

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
      <SelectInput
        id={`${entityId}-body-type`}
        label="Body type"
        value={bodyType}
        onChange={(value) => onBodyTypeChange(value as Entity['bodyType'])}
        options={[
          { value: 'static', label: 'Static' },
          { value: 'dynamic', label: 'Dynamic' },
          { value: 'kinematic', label: 'Kinematic' },
        ]}
        disabled={disabled}
        entityId={entityId}
        propertyName="body type"
      />
      {bodyType === 'dynamic' && (
        <>
          <NumberInput
            id={`${entityId}-mass`}
            label="Mass"
            value={mass}
            onChange={onMassChange}
            min={0}
            step={0.1}
            defaultValue={0}
            disabled={disabled}
            entityId={entityId}
            propertyName="mass"
          />
          <NumberInput
            id={`${entityId}-restitution`}
            label="Restitution"
            value={restitution}
            onChange={onRestitutionChange}
            min={0}
            max={1}
            step={0.1}
            defaultValue={0}
            disabled={disabled}
            entityId={entityId}
            propertyName="restitution"
          />
        </>
      )}
      <NumberInput
        id={`${entityId}-friction`}
        label="Friction"
        value={friction}
        onChange={onFrictionChange}
        min={0}
        step={0.1}
        defaultValue={0}
        disabled={disabled}
        entityId={entityId}
        propertyName="friction"
      />
    </>
  )
}
