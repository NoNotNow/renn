import type { Entity } from '@/types/world'
import SelectInput from './form/SelectInput'
import NumberInput from './form/NumberInput'
import { useEditorUndo } from '@/contexts/EditorUndoContext'

export interface PhysicsEditorProps {
  entityId: string
  bodyType: Entity['bodyType'] | null
  mass: number | null
  restitution: number | null
  friction: number | null
  linearDamping: number | null
  angularDamping: number | null
  onBodyTypeChange: (bodyType: Entity['bodyType']) => void
  onMassChange: (mass: number) => void
  onRestitutionChange: (restitution: number) => void
  onFrictionChange: (friction: number) => void
  onLinearDampingChange: (linearDamping: number) => void
  onAngularDampingChange: (angularDamping: number) => void
  disabled?: boolean
}

export default function PhysicsEditor({
  entityId,
  bodyType,
  mass,
  restitution,
  friction,
  linearDamping,
  angularDamping,
  onBodyTypeChange,
  onMassChange,
  onRestitutionChange,
  onFrictionChange,
  onLinearDampingChange,
  onAngularDampingChange,
  disabled = false,
}: PhysicsEditorProps) {
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()

  return (
    <>
      <SelectInput
        id={`${entityId}-body-type`}
        label="Body type"
        value={bodyType ?? ''}
        emptyLabel={bodyType == null ? '—' : undefined}
        onBeforeCommit={pushUndo}
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
      {(bodyType ?? 'static') === 'dynamic' && (
        <>
          <NumberInput onBeforeCommit={pushUndo}
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
          <NumberInput onBeforeCommit={pushUndo}
            id={`${entityId}-linear-damping`}
            label="Linear damping"
            value={linearDamping}
            onChange={onLinearDampingChange}
            min={0}
            step={0.05}
            defaultValue={0.3}
            disabled={disabled}
            entityId={entityId}
            propertyName="linear damping"
          />
          <NumberInput onBeforeCommit={pushUndo}
            id={`${entityId}-angular-damping`}
            label="Angular damping"
            value={angularDamping}
            onChange={onAngularDampingChange}
            min={0}
            step={0.05}
            defaultValue={0.3}
            disabled={disabled}
            entityId={entityId}
            propertyName="angular damping"
          />
          <NumberInput onBeforeCommit={pushUndo}
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
      <NumberInput onBeforeCommit={pushUndo}
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
