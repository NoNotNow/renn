/**
 * Load transformer preset templates from the project data folder.
 * Uses Vite's import.meta.glob so files are bundled but loadable at runtime.
 */

import type { TransformerConfig } from '@/types/transformer'

export type PresetTransformerType =
  | 'input'
  | 'car2'
  | 'person'
  | 'targetPoseInput'
  | 'kinematicMovement'
  | 'wanderer'
  | 'follow'

const presetModules = import.meta.glob<string>('./**/*.json', {
  query: '?raw',
  import: 'default',
  eager: false,
})

function pathToTypeAndName(relativePath: string): { type: PresetTransformerType; name: string } | null {
  const match = relativePath.match(
    /^\.\/(car2|input|person|targetPoseInput|kinematicMovement|wanderer|follow)\/(.+)\.json$/,
  )
  if (!match) return null
  const [, type, name] = match
  return { type: type as PresetTransformerType, name }
}

/**
 * List preset names for a transformer type (filename without .json).
 */
export function listPresetNames(transformerType: PresetTransformerType): string[] {
  const names: string[] = []
  for (const path of Object.keys(presetModules)) {
    const parsed = pathToTypeAndName(path)
    if (parsed && parsed.type === transformerType) {
      names.push(parsed.name)
    }
  }
  return names.sort()
}

/**
 * Load a preset by type and name. Returns null if not found or invalid.
 * Validates that the config type matches the requested type.
 */
export async function loadPreset(
  transformerType: PresetTransformerType,
  name: string,
): Promise<TransformerConfig | null> {
  const path = `./${transformerType}/${name}.json`
  const loader = presetModules[path]
  if (typeof loader !== 'function') return null

  try {
    const raw = await loader()
    const config = JSON.parse(raw) as TransformerConfig
    if (config.type !== transformerType) return null
    return config
  } catch {
    return null
  }
}
