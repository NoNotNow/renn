/**
 * Migrates legacy world JSON to the ScriptDef + entity.scripts string[] format.
 * Call before validateWorldDocument so schema validation sees the new shape.
 */
import type { RennWorld, ScriptDef, EntityScriptsLegacy } from '@/types/world'

const SCRIPT_EVENTS = ['onSpawn', 'onUpdate', 'onCollision'] as const

function isLegacyScriptsMap(scripts: unknown): scripts is EntityScriptsLegacy {
  if (!scripts || typeof scripts !== 'object') return false
  const o = scripts as Record<string, unknown>
  return !Array.isArray(scripts) && (typeof o.onSpawn === 'string' || typeof o.onUpdate === 'string' || typeof o.onCollision === 'string')
}

function isScriptDef(v: unknown): v is ScriptDef {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.event !== 'string' || typeof o.source !== 'string') return false
  if (o.event === 'onTimer') return typeof o.interval === 'number'
  return true
}

/**
 * Mutates worldData in place to convert legacy scripts and entity.scripts to the new format.
 * Safe to call on already-migrated data (no-op).
 */
export function migrateWorldScripts(worldData: unknown): void {
  if (!worldData || typeof worldData !== 'object') return
  const world = worldData as Record<string, unknown>
  const scripts = world.scripts as Record<string, unknown> | undefined
  const entities = world.entities as Array<Record<string, unknown>> | undefined
  if (!scripts || !entities) return

  const duplicatedScripts = new Map<string, { firstEvent: string; events: Set<string> }>()

  for (const [scriptId, value] of Object.entries(scripts)) {
    if (isScriptDef(value)) continue
    if (typeof value !== 'string') continue

    const eventsUsed = new Set<string>()
    for (const entity of entities) {
      const s = entity.scripts
      if (!isLegacyScriptsMap(s)) continue
      for (const ev of SCRIPT_EVENTS) {
        if (s[ev] === scriptId) eventsUsed.add(ev)
      }
    }

    const eventList = Array.from(eventsUsed)
    const event = eventList[0] ?? 'onUpdate'
    const source = value

    if (eventList.length <= 1) {
      ;(scripts as Record<string, ScriptDef>)[scriptId] = { event: event as ScriptDef['event'], source }
      continue
    }

    duplicatedScripts.set(scriptId, { firstEvent: event, events: eventsUsed })
    ;(scripts as Record<string, ScriptDef>)[scriptId] = { event: event as ScriptDef['event'], source }
    for (let i = 1; i < eventList.length; i++) {
      const e = eventList[i]
      const newId = `${scriptId}_${e}`
      ;(scripts as Record<string, ScriptDef>)[newId] = { event: e as ScriptDef['event'], source }
    }
  }

  function getScriptId(scriptId: string, event: string): string {
    const d = duplicatedScripts.get(scriptId)
    if (!d || d.firstEvent === event) return scriptId
    return `${scriptId}_${event}`
  }

  for (const entity of entities) {
    const s = entity.scripts
    if (!isLegacyScriptsMap(s)) continue
    const ids: string[] = []
    for (const ev of SCRIPT_EVENTS) {
      const id = s[ev]
      if (typeof id === 'string') ids.push(getScriptId(id, ev))
    }
    entity.scripts = ids
  }
}
