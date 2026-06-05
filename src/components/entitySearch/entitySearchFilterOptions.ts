import type { AddableShapeType } from '@/data/entityDefaults'

export const SHAPE_FILTER_OPTIONS: { value: 'any' | AddableShapeType; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'box', label: 'Box' },
  { value: 'sphere', label: 'Sphere' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'cone', label: 'Cone' },
  { value: 'pyramid', label: 'Pyramid' },
  { value: 'plane', label: 'Plane' },
  { value: 'trimesh', label: 'Trimesh' },
]

export const TRI_STATE_FILTER_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const
