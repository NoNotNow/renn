import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

/** Repo root relative to this module (src/globalPipeline). */
export const GLOBAL_PUBLIC_ROOT = resolve(moduleDir, '../../public/global')

export const SELF_DRIVING_CAR_TRANSFORMER_DIR = resolve(
  GLOBAL_PUBLIC_ROOT,
  'transformers/self-driving-car',
)

export const SELF_DRIVING_STAGE_FILES = {
  umlenker: 'umlenker.js',
  direction: 'direction.js',
  autoBrake: 'auto-brake.js',
  targetLine: 'target-line-visualizer.js',
} as const

export type SelfDrivingLogicalStage = keyof typeof SELF_DRIVING_STAGE_FILES

export function selfDrivingStagePath(logical: SelfDrivingLogicalStage): string {
  return resolve(SELF_DRIVING_CAR_TRANSFORMER_DIR, SELF_DRIVING_STAGE_FILES[logical])
}

export function readSelfDrivingStageCode(logical: SelfDrivingLogicalStage): string {
  return readFileSync(selfDrivingStagePath(logical), 'utf8')
}

export function sha256Short(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

export function selfDrivingStageChecksums(): Record<SelfDrivingLogicalStage, string> {
  const out = {} as Record<SelfDrivingLogicalStage, string>
  for (const key of Object.keys(SELF_DRIVING_STAGE_FILES) as SelfDrivingLogicalStage[]) {
    out[key] = sha256Short(readSelfDrivingStageCode(key))
  }
  return out
}
