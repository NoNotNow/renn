import type { Shape } from '@/types/world'
import { getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'
import SelectInput from './form/SelectInput'
import NumberInput from './form/NumberInput'

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane']

export interface ShapeEditorProps {
  entityId: string
  shape: Shape | undefined
  onShapeChange: (shape: Shape) => void
  disabled?: boolean
}

export default function ShapeEditor({
  entityId,
  shape,
  onShapeChange,
  disabled = false,
}: ShapeEditorProps) {
  const shapeType = (shape?.type ?? 'box') as AddableShapeType
  const effectiveShapeType = ADDABLE_SHAPE_TYPES.includes(shapeType) ? shapeType : 'box'

  const setShapeType = (newType: AddableShapeType) => {
    onShapeChange(getDefaultShapeForType(newType))
  }

  return (
    <>
      <SelectInput
        id={`${entityId}-shape`}
        label="Shape"
        value={effectiveShapeType}
        onChange={(value) => setShapeType(value as AddableShapeType)}
        options={[
          { value: 'box', label: 'Box' },
          { value: 'sphere', label: 'Sphere' },
          { value: 'cylinder', label: 'Cylinder' },
          { value: 'capsule', label: 'Capsule' },
          { value: 'plane', label: 'Plane' },
        ]}
        disabled={disabled}
        entityId={entityId}
        propertyName="shape type"
        logComponent="PropertyPanel"
      />
      {shape?.type === 'box' && (() => {
        const s = shape
        return (
          <>
            <NumberInput
              id={`${entityId}-box-width`}
              label="Width"
              value={s.width}
              onChange={(newValue) => onShapeChange({ type: 'box', width: newValue, height: s.height, depth: s.depth })}
              min={0.01}
              step={0.1}
              defaultValue={0.01}
              disabled={disabled}
              entityId={entityId}
              propertyName="box width"
            />
            <NumberInput
              id={`${entityId}-box-height`}
              label="Height"
              value={s.height}
              onChange={(newValue) => onShapeChange({ type: 'box', width: s.width, height: newValue, depth: s.depth })}
              min={0.01}
              step={0.1}
              defaultValue={0.01}
              disabled={disabled}
              entityId={entityId}
              propertyName="box height"
            />
            <NumberInput
              id={`${entityId}-box-depth`}
              label="Depth"
              value={s.depth}
              onChange={(newValue) => onShapeChange({ type: 'box', width: s.width, height: s.height, depth: newValue })}
              min={0.01}
              step={0.1}
              defaultValue={0.01}
              disabled={disabled}
              entityId={entityId}
              propertyName="box depth"
            />
          </>
        )
      })()}
      {shape?.type === 'sphere' && (() => {
        const s = shape
        return (
          <NumberInput
            id={`${entityId}-sphere-radius`}
            label="Radius"
            value={s.radius}
            onChange={(newValue) => onShapeChange({ type: 'sphere', radius: newValue })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="sphere radius"
          />
        )
      })()}
      {shape?.type === 'cylinder' && (() => {
        const s = shape
        return (
          <>
            <NumberInput
              id={`${entityId}-cylinder-radius`}
              label="Radius"
              value={s.radius}
              onChange={(newValue) => onShapeChange({ type: 'cylinder', radius: newValue, height: s.height })}
              min={0.01}
              step={0.1}
              defaultValue={0.01}
              disabled={disabled}
              entityId={entityId}
              propertyName="cylinder radius"
            />
            <NumberInput
              id={`${entityId}-cylinder-height`}
              label="Height"
              value={s.height}
              onChange={(newValue) => onShapeChange({ type: 'cylinder', radius: s.radius, height: newValue })}
              min={0.01}
              step={0.1}
              defaultValue={0.01}
              disabled={disabled}
              entityId={entityId}
              propertyName="cylinder height"
            />
          </>
        )
      })()}
      {shape?.type === 'capsule' && (() => {
        const s = shape
        return (
          <>
            <NumberInput
              id={`${entityId}-capsule-radius`}
              label="Radius"
              value={s.radius}
              onChange={(newValue) => onShapeChange({ type: 'capsule', radius: newValue, height: s.height })}
              min={0.01}
              step={0.1}
              defaultValue={0.01}
              disabled={disabled}
              entityId={entityId}
              propertyName="capsule radius"
            />
            <NumberInput
              id={`${entityId}-capsule-height`}
              label="Height"
              value={s.height}
              onChange={(newValue) => onShapeChange({ type: 'capsule', radius: s.radius, height: newValue })}
              min={0.01}
              step={0.1}
              defaultValue={0.01}
              disabled={disabled}
              entityId={entityId}
              propertyName="capsule height"
            />
          </>
        )
      })()}
    </>
  )
}
