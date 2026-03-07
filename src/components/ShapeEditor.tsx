import { useState } from 'react'
import type { Shape, RennWorld } from '@/types/world'
import { type AddableShapeType } from '@/data/entityDefaults'
import { shapeWithPreservedSize } from '@/utils/shapeConversion'
import SelectInput from './form/SelectInput'
import NumberInput from './form/NumberInput'
import ModelDialog from './ModelDialog'
import ModelThumbnail from './ModelThumbnail'
import Switch from './Switch'
import { uploadModel } from '@/utils/assetUpload'
import { sidebarRowStyle, sidebarLabelStyle, thumbnailButtonStyle, thumbnailButtonStyleDisabled, removeButtonStyle, removeButtonStyleDisabled, secondaryButtonStyle, secondaryButtonStyleDisabled } from './sharedStyles'

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'cone', 'pyramid', 'ring', 'plane', 'trimesh']

export interface ShapeEditorProps {
  entityId: string
  shape: Shape | undefined
  onShapeChange: (shape: Shape) => void
  disabled?: boolean
  assets?: Map<string, Blob>
  world?: RennWorld
  onAssetsChange?: (assets: Map<string, Blob>) => void
  onWorldChange?: (world: RennWorld) => void
}

export default function ShapeEditor({
  entityId,
  shape,
  onShapeChange,
  disabled = false,
  assets = new Map(),
  world,
  onAssetsChange,
  onWorldChange,
}: ShapeEditorProps) {
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  
  const shapeType = (shape?.type ?? 'box') as AddableShapeType
  const effectiveShapeType = ADDABLE_SHAPE_TYPES.includes(shapeType) ? shapeType : 'box'

  const setShapeType = (newType: AddableShapeType) => {
    onShapeChange(shapeWithPreservedSize(shape, newType))
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
          { value: 'cone', label: 'Cone' },
          { value: 'pyramid', label: 'Pyramid' },
          { value: 'ring', label: 'Ring' },
          { value: 'plane', label: 'Plane' },
          { value: 'trimesh', label: 'Trimesh (3D Model)' },
        ]}
        disabled={disabled}
        entityId={entityId}
        propertyName="shape type"
        logComponent="PropertyPanel"
      />
      {shape?.type === 'box' && shape && (
        <>
          <NumberInput
            id={`${entityId}-box-width`}
            label="Width"
            value={shape.width}
            onChange={(newValue) => onShapeChange({ type: 'box', width: newValue, height: shape.height, depth: shape.depth })}
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
            value={shape.height}
            onChange={(newValue) => onShapeChange({ type: 'box', width: shape.width, height: newValue, depth: shape.depth })}
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
            value={shape.depth}
            onChange={(newValue) => onShapeChange({ type: 'box', width: shape.width, height: shape.height, depth: newValue })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="box depth"
          />
        </>
      )}
      {shape?.type === 'sphere' && shape && (
        <NumberInput
          id={`${entityId}-sphere-radius`}
          label="Radius"
          value={shape.radius}
          onChange={(newValue) => onShapeChange({ type: 'sphere', radius: newValue })}
          min={0.01}
          step={0.1}
          defaultValue={0.01}
          disabled={disabled}
          entityId={entityId}
          propertyName="sphere radius"
        />
      )}
      {shape?.type === 'cylinder' && shape && (
        <>
          <NumberInput
            id={`${entityId}-cylinder-radius`}
            label="Radius"
            value={shape.radius}
            onChange={(newValue) => onShapeChange({ type: 'cylinder', radius: newValue, height: shape.height })}
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
            value={shape.height}
            onChange={(newValue) => onShapeChange({ type: 'cylinder', radius: shape.radius, height: newValue })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="cylinder height"
          />
        </>
      )}
      {shape?.type === 'capsule' && shape && (
        <>
          <NumberInput
            id={`${entityId}-capsule-radius`}
            label="Radius"
            value={shape.radius}
            onChange={(newValue) => onShapeChange({ type: 'capsule', radius: newValue, height: shape.height })}
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
            value={shape.height}
            onChange={(newValue) => onShapeChange({ type: 'capsule', radius: shape.radius, height: newValue })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="capsule height"
          />
        </>
      )}
      {shape?.type === 'cone' && shape && (
        <>
          <NumberInput
            id={`${entityId}-cone-radius`}
            label="Radius"
            value={shape.radius}
            onChange={(newValue) => onShapeChange({ type: 'cone', radius: newValue, height: shape.height })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="cone radius"
          />
          <NumberInput
            id={`${entityId}-cone-height`}
            label="Height"
            value={shape.height}
            onChange={(newValue) => onShapeChange({ type: 'cone', radius: shape.radius, height: newValue })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="cone height"
          />
        </>
      )}
      {shape?.type === 'pyramid' && shape && (
        <>
          <NumberInput
            id={`${entityId}-pyramid-baseSize`}
            label="Base size"
            value={shape.baseSize}
            onChange={(newValue) => onShapeChange({ type: 'pyramid', baseSize: newValue, height: shape.height })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="pyramid base size"
          />
          <NumberInput
            id={`${entityId}-pyramid-height`}
            label="Height"
            value={shape.height}
            onChange={(newValue) => onShapeChange({ type: 'pyramid', baseSize: shape.baseSize, height: newValue })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="pyramid height"
          />
        </>
      )}
      {shape?.type === 'ring' && shape && (
        <>
          <NumberInput
            id={`${entityId}-ring-innerRadius`}
            label="Inner radius"
            value={shape.innerRadius}
            onChange={(newValue) => onShapeChange({ type: 'ring', innerRadius: newValue, outerRadius: shape.outerRadius, height: shape.height })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="ring inner radius"
          />
          <NumberInput
            id={`${entityId}-ring-outerRadius`}
            label="Outer radius"
            value={shape.outerRadius}
            onChange={(newValue) => onShapeChange({ type: 'ring', innerRadius: shape.innerRadius, outerRadius: newValue, height: shape.height })}
            min={0.01}
            step={0.1}
            defaultValue={0.01}
            disabled={disabled}
            entityId={entityId}
            propertyName="ring outer radius"
          />
          <NumberInput
            id={`${entityId}-ring-height`}
            label="Height (collision)"
            value={shape.height ?? 0.1}
            onChange={(newValue) => onShapeChange({ type: 'ring', innerRadius: shape.innerRadius, outerRadius: shape.outerRadius, height: newValue })}
            min={0.01}
            step={0.1}
            defaultValue={0.1}
            disabled={disabled}
            entityId={entityId}
            propertyName="ring height"
          />
          <div style={{ fontSize: 10, color: '#666', marginTop: 4, paddingLeft: 8 }}>
            Collision uses cylinder (outer radius, height)
          </div>
        </>
      )}
      {shape?.type === 'trimesh' && shape && (
        <>
          <div style={sidebarRowStyle}>
            <label style={sidebarLabelStyle}>Model</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {shape.model && assets.get(shape.model) ? (
                <>
                  <button
                    type="button"
                    onClick={() => setModelDialogOpen(true)}
                    disabled={disabled}
                    title="Click to change model"
                    style={{ ...thumbnailButtonStyle, ...(disabled && thumbnailButtonStyleDisabled) }}
                    onMouseEnter={(e) => {
                      if (!disabled) e.currentTarget.style.opacity = '0.8'
                    }}
                    onMouseLeave={(e) => {
                      if (!disabled) e.currentTarget.style.opacity = '1'
                    }}
                  >
                    <ModelThumbnail assetId={shape.model} blob={assets.get(shape.model)} size={32} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onShapeChange({ type: 'trimesh', model: '' })}
                    disabled={disabled}
                    title="Remove model"
                    style={{ ...removeButtonStyle, ...(disabled && removeButtonStyleDisabled) }}
                  >
                    🗑️
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setModelDialogOpen(true)}
                  disabled={disabled}
                  style={{ ...secondaryButtonStyle, ...(disabled && secondaryButtonStyleDisabled) }}
                  onMouseEnter={(e) => {
                    if (!disabled) e.currentTarget.style.background = '#222'
                  }}
                  onMouseLeave={(e) => {
                    if (!disabled) e.currentTarget.style.background = '#1a1a1a'
                  }}
                >
                  Select Model
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 4, paddingLeft: 8 }}>
            Model for visual and physics collision. Note: Trimesh shapes use their own model instead of the separate 3D Model section.
          </div>

          {shape.model && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2f3545' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: '#9aa4b2' }}>Simplify Collision Mesh</label>
                <Switch
                  checked={shape.simplification?.enabled ?? false}
                  onChange={(enabled) => {
                    onShapeChange({
                      type: 'trimesh',
                      model: shape.model,
                      simplification: {
                        enabled,
                        maxTriangles: shape.simplification?.maxTriangles ?? 5000,
                      },
                    })
                  }}
                  disabled={disabled}
                />
              </div>

              {shape.simplification?.enabled && (
                <>
                  <NumberInput
                    id={`${entityId}-simplification-maxTriangles`}
                    label="Max Triangles"
                    value={shape.simplification.maxTriangles ?? 5000}
                    onChange={(value) => {
                      const clampedValue = Math.max(500, value)
                      onShapeChange({
                        type: 'trimesh',
                        model: shape.model,
                        simplification: {
                          enabled: shape.simplification?.enabled ?? true,
                          maxTriangles: clampedValue,
                        },
                      })
                    }}
                    min={500}
                    max={50000}
                    step={100}
                    defaultValue={5000}
                    disabled={disabled}
                    entityId={entityId}
                    propertyName="simplification maxTriangles"
                  />
                  <div style={{ fontSize: 10, color: '#666', marginTop: 4, paddingLeft: 8 }}>
                    Reduces collision mesh complexity for better performance
                  </div>
                </>
              )}
            </div>
          )}

          {world && (
            <ModelDialog
              isOpen={modelDialogOpen}
              onClose={() => setModelDialogOpen(false)}
              assets={assets}
              world={world}
              selectedModelId={shape.model}
              onSelectModel={(assetId) => onShapeChange({ type: 'trimesh', model: assetId ?? '' })}
              onUploadModel={async (file: File, assetId: string) => {
                const { nextAssets, worldAssetEntry } = await uploadModel(file, assetId, assets)
                onAssetsChange?.(nextAssets)
                onWorldChange?.({ ...world, assets: { ...world.assets, [assetId]: worldAssetEntry } })
              }}
            />
          )}
        </>
      )}
    </>
  )
}
