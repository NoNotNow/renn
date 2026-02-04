import { useState } from 'react'
import type { Shape, RennWorld } from '@/types/world'
import { getDefaultShapeForType, type AddableShapeType } from '@/data/entityDefaults'
import SelectInput from './form/SelectInput'
import NumberInput from './form/NumberInput'
import ModelDialog from './ModelDialog'
import ModelThumbnail from './ModelThumbnail'
import Switch from './Switch'
import { ModelManager } from '@/utils/modelManager'
import { generateModelPreview } from '@/utils/modelPreview'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import { sidebarRowStyle, sidebarLabelStyle } from './sharedStyles'

const persistence = createIndexedDbPersistence()

const ADDABLE_SHAPE_TYPES: AddableShapeType[] = ['box', 'sphere', 'cylinder', 'capsule', 'plane', 'trimesh']

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
          { value: 'trimesh', label: 'Trimesh (3D Model)' },
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
      {shape?.type === 'trimesh' && (() => {
        const s = shape
        return (
          <>
            <div style={sidebarRowStyle}>
              <label style={sidebarLabelStyle}>Model</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {s.model && assets.get(s.model) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setModelDialogOpen(true)}
                      disabled={disabled}
                      title="Click to change model"
                      style={{
                        padding: 0,
                        background: 'transparent',
                        border: 'none',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        transition: 'opacity 0.15s ease',
                        opacity: disabled ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!disabled) e.currentTarget.style.opacity = '0.8'
                      }}
                      onMouseLeave={(e) => {
                        if (!disabled) e.currentTarget.style.opacity = '1'
                      }}
                    >
                      <ModelThumbnail assetId={s.model} blob={assets.get(s.model)} size={32} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onShapeChange({ type: 'trimesh', model: '' })
                      }}
                      disabled={disabled}
                      title="Remove model"
                      style={{
                        padding: '6px 8px',
                        background: disabled ? '#2a2a2a' : '#3a1b1b',
                        border: disabled ? '1px solid #2f3545' : '1px solid #6b2a2a',
                        color: disabled ? '#666' : '#f4d6d6',
                        borderRadius: 6,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 28,
                      }}
                    >
                      🗑️
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setModelDialogOpen(true)}
                    disabled={disabled}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      background: disabled ? '#2a2a2a' : '#1a1a1a',
                      border: '1px solid #2f3545',
                      color: disabled ? '#666' : '#e6e9f2',
                      borderRadius: 6,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      transition: 'background-color 0.15s ease',
                    }}
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
            
            {/* Simplification Configuration */}
            {s.model && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2f3545' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: '#9aa4b2' }}>Simplify Collision Mesh</label>
                  <Switch
                    checked={s.simplification?.enabled ?? false}
                    onChange={(enabled) => {
                      onShapeChange({
                        type: 'trimesh',
                        model: s.model,
                        simplification: { 
                          enabled,
                          maxTriangles: s.simplification?.maxTriangles ?? 5000
                        }
                      })
                    }}
                    disabled={disabled}
                  />
                </div>
                
                {s.simplification?.enabled && (
                  <>
                    <NumberInput
                      id={`${entityId}-simplification-maxTriangles`}
                      label="Max Triangles"
                      value={s.simplification.maxTriangles ?? 5000}
                      onChange={(value) => {
                        // Enforce minimum of 500 triangles to prevent simplification failures
                        const clampedValue = Math.max(500, value)
                        onShapeChange({
                          type: 'trimesh',
                          model: s.model,
                          simplification: { 
                            enabled: s.simplification?.enabled ?? true,
                            maxTriangles: clampedValue 
                          }
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
                selectedModelId={s.model}
                onSelectModel={(assetId) => {
                  onShapeChange({ type: 'trimesh', model: assetId ?? '' })
                }}
                onUploadModel={async (file: File, assetId: string) => {
                  // Validate using ModelManager
                  const validation = ModelManager.validateModelFile(file)
                  if (!validation.valid) {
                    throw new Error(validation.error)
                  }
                  
                  // Save to global store
                  const previewBlob = await generateModelPreview(file)
                  await persistence.saveAsset(assetId, file, previewBlob)
                  
                  // Update in-memory assets Map
                  const nextAssets = new Map(assets)
                  nextAssets.set(assetId, file)
                  onAssetsChange?.(nextAssets)
                  
                  // Update world assets reference
                  const nextWorldAssets = { ...world.assets, [assetId]: { path: `assets/${file.name}`, type: 'model' } }
                  onWorldChange?.({ ...world, assets: nextWorldAssets })
                }}
              />
            )}
          </>
        )
      })()}
    </>
  )
}
