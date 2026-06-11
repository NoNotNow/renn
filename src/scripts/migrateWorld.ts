/**
 * Migrates legacy world JSON to the ScriptDef + entity.scripts string[] format.
 * Call before validateWorldDocument so schema validation sees the new shape.
 *
 * `migrateWorldSimplificationFields` clamps mesh simplification numbers to JSON schema ranges
 * (maxError ≥ 0.0001, maxTriangles ≥ 500) so saved worlds stay valid after UI typos.
 *
 * `migrateDistanceCullingFields` converts legacy `radius` / `minSize` to `maxDistance` /
 * `minSizeDistanceRatio`.
 *
 * `migrateWorldRingShapesToCylinder` converts removed `ring` shapes to `cylinder` (matches former physics proxy).
 */
import type { ScriptDef, EntityScriptsLegacy, TrimeshSimplificationConfig } from '@/types/world'

const SIMPLIFICATION_MIN_MAX_ERROR = 0.0001
const SIMPLIFICATION_MIN_MAX_TRIANGLES = 500

/** In-place clamp; returns true if any field changed. */
function clampSimplificationRecordInPlace(s: Record<string, unknown>): boolean {
  let changed = false
  if (typeof s.maxError === 'number' && Number.isFinite(s.maxError)) {
    const c = Math.max(SIMPLIFICATION_MIN_MAX_ERROR, s.maxError)
    if (c !== s.maxError) {
      s.maxError = c
      changed = true
    }
  }
  if (typeof s.maxTriangles === 'number' && Number.isFinite(s.maxTriangles)) {
    const c = Math.max(SIMPLIFICATION_MIN_MAX_TRIANGLES, Math.floor(s.maxTriangles))
    if (c !== s.maxTriangles) {
      s.maxTriangles = c
      changed = true
    }
  }
  return changed
}

/**
 * Clamp simplification config for persistence (Performance booster, builder patches).
 * Does not mutate the input.
 */
export function clampTrimeshSimplificationConfig(cfg: TrimeshSimplificationConfig): TrimeshSimplificationConfig {
  const next: TrimeshSimplificationConfig = { ...cfg }
  if (typeof next.maxError === 'number' && Number.isFinite(next.maxError)) {
    next.maxError = Math.max(SIMPLIFICATION_MIN_MAX_ERROR, next.maxError)
  }
  if (typeof next.maxTriangles === 'number' && Number.isFinite(next.maxTriangles)) {
    next.maxTriangles = Math.max(SIMPLIFICATION_MIN_MAX_TRIANGLES, Math.floor(next.maxTriangles))
  }
  return next
}

const SIMPLIFICATION_WARNING =
  'Mesh simplification settings were adjusted to valid ranges (maxError ≥ 0.0001, maxTriangles ≥ 500). Re-save the project to persist.'

/**
 * Mutates entity `shape.simplification` (trimesh) and `modelSimplification` in place.
 * Call after migrateWorldScripts and before validateWorldDocument.
 */
export function migrateWorldSimplificationFields(worldData: unknown, warningsOut?: string[]): void {
  if (!worldData || typeof worldData !== 'object') return
  const entities = (worldData as Record<string, unknown>).entities as unknown[] | undefined
  if (!Array.isArray(entities)) return

  let anyChanged = false
  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue
    const e = entity as Record<string, unknown>
    const shape = e.shape
    if (shape && typeof shape === 'object') {
      const sh = shape as Record<string, unknown>
      if (sh.type === 'trimesh' && sh.simplification && typeof sh.simplification === 'object') {
        if (clampSimplificationRecordInPlace(sh.simplification as Record<string, unknown>)) {
          anyChanged = true
        }
      }
    }
    if (e.modelSimplification && typeof e.modelSimplification === 'object') {
      if (clampSimplificationRecordInPlace(e.modelSimplification as Record<string, unknown>)) {
        anyChanged = true
      }
    }
  }

  if (anyChanged && warningsOut) {
    warningsOut.push(SIMPLIFICATION_WARNING)
  }
}

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

    const toScriptDef = (ev: string): ScriptDef => {
      if (ev === 'onTimer') return { event: 'onTimer', interval: 1, source }
      if (ev === 'onSpawn' || ev === 'onUpdate' || ev === 'onCollision') return { event: ev, source }
      return { event: 'onUpdate', source }
    }

    if (eventList.length <= 1) {
      ;(scripts as Record<string, ScriptDef>)[scriptId] = toScriptDef(event)
      continue
    }

    duplicatedScripts.set(scriptId, { firstEvent: event, events: eventsUsed })
    ;(scripts as Record<string, ScriptDef>)[scriptId] = toScriptDef(event)
    for (let i = 1; i < eventList.length; i++) {
      const e = eventList[i]!
      const newId = `${scriptId}_${e}`
      ;(scripts as Record<string, ScriptDef>)[newId] = toScriptDef(e)
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

/** Mutates `world.world.distanceCulling` in place when it uses legacy `radius` / `minSize`. */
export function migrateDistanceCullingFields(worldData: unknown): void {
  if (!worldData || typeof worldData !== 'object') return
  const root = worldData as Record<string, unknown>
  const world = root.world as Record<string, unknown> | undefined
  if (!world) return
  const dc = world.distanceCulling
  if (!dc || typeof dc !== 'object' || dc === null) return
  const o = dc as Record<string, unknown>
  if (o.maxDistance !== undefined) return
  if (typeof o.radius !== 'number' || !Number.isFinite(o.radius)) return
  const radius = o.radius
  const minSize = typeof o.minSize === 'number' && Number.isFinite(o.minSize) ? o.minSize : 1.0
  delete o.radius
  delete o.minSize
  o.maxDistance = radius
  o.minSizeDistanceRatio = radius > 0 ? minSize / radius : 0.02
}

/**
 * Assigns display names to legacy `type: "custom"` transformers missing `name`
 * (`Custom`, `Custom 2`, … per entity in stack order).
 */
export function migrateCustomTransformerNames(worldData: unknown): void {
  if (!worldData || typeof worldData !== 'object') return
  const entities = (worldData as Record<string, unknown>).entities as unknown[] | undefined
  if (!Array.isArray(entities)) return

  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue
    const transformers = (entity as Record<string, unknown>).transformers as unknown[] | undefined
    if (!Array.isArray(transformers)) continue

    let customOrdinal = 0
    for (const t of transformers) {
      if (!t || typeof t !== 'object') continue
      const cfg = t as Record<string, unknown>
      if (cfg.type !== 'custom') continue
      if (typeof cfg.name === 'string' && cfg.name.trim() !== '') continue
      customOrdinal += 1
      cfg.name = customOrdinal <= 1 ? 'Custom' : `Custom ${customOrdinal}`
    }
  }
}

/**
 * Migrates entity.transformers from embedded TransformerConfig[] to string[] IDs,
 * populating world.transformers registry. Safe to call on already-migrated data (no-op).
 *
 * ID format: `${entityId}_tf${index}` (0-based index in the original stack).
 * Call after migrateCustomTransformerNames so custom transformers have names before extraction.
 */
/**
 * Migrates legacy `entity.transformerPipe` (single string) to `transformerPipeStack`.
 * Safe to call on already-migrated data (no-op).
 */
export function migrateTransformerPipeToStack(worldData: unknown): void {
  if (!worldData || typeof worldData !== 'object') return
  const entities = (worldData as Record<string, unknown>).entities as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(entities)) return

  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue
    const legacy = entity.transformerPipe
    const stack = entity.transformerPipeStack
    if (typeof legacy !== 'string' || legacy.trim() === '') continue
    if (Array.isArray(stack) && stack.length > 0) {
      delete entity.transformerPipe
      continue
    }
    entity.transformerPipeStack = [{ pipeId: legacy }]
    delete entity.transformerPipe
  }
}

/**
 * Moves legacy `transformerPipes[*].defaultParams` into per-entity `binding.params`
 * when the binding has no params yet, then removes `defaultParams` from pipe definitions.
 */
export function migrateTransformerPipeDefaultParams(worldData: unknown): void {
  if (!worldData || typeof worldData !== 'object') return
  const world = worldData as Record<string, unknown>
  const pipes = world.transformerPipes as Record<string, Record<string, unknown>> | undefined
  const entities = world.entities as Array<Record<string, unknown>> | undefined
  if (!pipes || !Array.isArray(entities)) return

  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue
    const stack = entity.transformerPipeStack
    if (!Array.isArray(stack)) continue
    for (const rawBinding of stack) {
      if (!rawBinding || typeof rawBinding !== 'object') continue
      const binding = rawBinding as Record<string, unknown>
      const pipeId = binding.pipeId
      if (typeof pipeId !== 'string') continue
      const pipe = pipes[pipeId]
      if (!pipe) continue
      const legacyDefaults = pipe.defaultParams
      if (!legacyDefaults || typeof legacyDefaults !== 'object' || Array.isArray(legacyDefaults)) continue
      const existing = binding.params
      const hasParams =
        existing && typeof existing === 'object' && !Array.isArray(existing) && Object.keys(existing).length > 0
      if (!hasParams) {
        binding.params = { ...(legacyDefaults as Record<string, unknown>) }
      }
    }
  }

  for (const pipe of Object.values(pipes)) {
    if (pipe && typeof pipe === 'object') delete pipe.defaultParams
  }
}

export function migrateEntityTransformersToRegistry(worldData: unknown): void {
  if (!worldData || typeof worldData !== 'object') return
  const world = worldData as Record<string, unknown>
  const entities = world.entities as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(entities)) return

  if (!world.transformers || typeof world.transformers !== 'object') {
    world.transformers = {}
  }
  const registry = world.transformers as Record<string, unknown>

  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue
    const rawTransformers = entity.transformers
    if (!Array.isArray(rawTransformers) || rawTransformers.length === 0) continue

    // Skip if already migrated (all elements are strings)
    if (typeof rawTransformers[0] === 'string') continue

    const entityId = typeof entity.id === 'string' ? entity.id : 'unknown'
    const ids: string[] = []

    for (let i = 0; i < rawTransformers.length; i++) {
      const cfg = rawTransformers[i]
      if (!cfg || typeof cfg !== 'object') continue
      const id = `${entityId}_tf${i}`
      registry[id] = cfg
      ids.push(id)
    }

    entity.transformers = ids
  }
}

const RING_SHAPE_MIGRATION_WARNING =
  'Shape type "ring" is no longer supported; converted each ring to a cylinder (outer radius → radius, height preserved). Re-save to persist.'

/**
 * Legacy worlds used `shape.type: "ring"`; collision was already a cylinder from outer radius + height.
 * Mutates entities in place before schema validation.
 */
export function migrateWorldRingShapesToCylinder(worldData: unknown, warningsOut?: string[]): void {
  if (!worldData || typeof worldData !== 'object') return
  const entities = (worldData as Record<string, unknown>).entities as unknown[] | undefined
  if (!Array.isArray(entities)) return

  let anyChanged = false
  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue
    const e = entity as Record<string, unknown>
    const shape = e.shape
    if (!shape || typeof shape !== 'object') continue
    const sh = shape as Record<string, unknown>
    if (sh.type !== 'ring') continue

    const outer =
      typeof sh.outerRadius === 'number' && Number.isFinite(sh.outerRadius) ? sh.outerRadius : 0.5
    const hRaw = sh.height
    const h = typeof hRaw === 'number' && Number.isFinite(hRaw) ? hRaw : 0.1

    e.shape = { type: 'cylinder', radius: outer, height: h }
    anyChanged = true
  }

  if (anyChanged && warningsOut) {
    warningsOut.push(RING_SHAPE_MIGRATION_WARNING)
  }
}
