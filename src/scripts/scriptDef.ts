import type { ScriptDef } from '@/types/world'

/**
 * Resolve a script entry from world.scripts (string shorthand or full ScriptDef).
 */
export function getScriptDef(scripts: Record<string, ScriptDef>, id: string): ScriptDef | null {
  const raw = scripts[id]
  if (raw == null) return null
  if (typeof raw === 'string') return { event: 'onUpdate', source: raw }
  return raw
}
