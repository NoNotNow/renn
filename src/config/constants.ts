/**
 * Application-wide configuration constants.
 * Centralizes magic numbers and hard-coded values for easier maintenance.
 */

// Database configuration
export const DB_CONFIG = {
  name: 'renn-worlds',
  version: 1,
  stores: {
    projects: 'projects',
    assets: 'assets',
  },
} as const

// UI Logger configuration
export const UI_LOGGER_CONFIG = {
  maxLogs: 1000,
} as const

// Entity defaults configuration
export const ENTITY_DEFAULTS = {
  colorRange: [0.2, 0.9] as const,
  scaleRange: [0.6, 1.4] as const,
  displacementRange: [-0.35, 0.35] as const,
  displacementYRange: [0, 0.35] as const,
} as const

// Asset path configuration
export const ASSET_CONFIG = {
  pathPrefix: 'assets/',
  defaultExtension: 'bin',
  mimeTypeExtensions: {
    'image/png': 'png',
    'model/gltf-binary': 'glb',
  },
} as const

// Physics configuration
export const PHYSICS_CONFIG = {
  defaultGravity: [0, -9.81, 0] as const,
  defaultFriction: 0.5,
  defaultRestitution: 0,
  defaultMass: 1,
} as const

// Material configuration
export const MATERIAL_CONFIG = {
  defaultColor: [0.7, 0.7, 0.7] as const,
  defaultRoughness: 0.5,
  defaultMetalness: 0,
} as const

// Geometry configuration
export const GEOMETRY_CONFIG = {
  planeSize: 100,
  sphereSegments: 32,
  cylinderSegments: 32,
  capsuleSegments: { radial: 8, height: 16 },
} as const
