import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { RennWorld, ScriptDef } from '@/types/world'
import type { TransformerDef, TransformerPipe } from '@/types/transformer'
import type { WorkspaceOrganizeKind, WorkspaceOrganizeScope, WorkspaceTarget } from '@/types/workspace'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import WorkspaceOrganizeCard from '@/components/workspace/WorkspaceOrganizeCard'
import WorkspaceConflictDialog from '@/components/workspace/WorkspaceConflictDialog'
import AssignEntitiesDialog from '@/components/workspace/AssignEntitiesDialog'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { getScriptDef } from '@/scripts/scriptDef'
import { uiLogger } from '@/utils/uiLogger'
import { theme } from '@/config/theme'
import { assignPipeToEntity, deletePipeFromWorld } from '@/utils/commitTransformerConfigsToWorld'

const SUBTAB_BTN: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${theme.border.default}`,
  background: theme.bg.surface,
  color: theme.text.primary,
  cursor: 'pointer',
  fontSize: 12,
}

function tabStyle(active: boolean): CSSProperties {
  return {
    ...SUBTAB_BTN,
    borderBottom: `2px solid ${active ? theme.accent : 'transparent'}`,
    marginBottom: -1,
    fontWeight: active ? 600 : 500,
    background: active ? 'rgba(43, 53, 80, 0.28)' : theme.bg.surface,
  }
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

function getScriptEventLabel(def: ReturnType<typeof getScriptDef>): string {
  if (!def) return '?'
  return def.event === 'onTimer' ? `onTimer (${def.interval}s)` : def.event
}

function getEntitiesUsingScript(world: RennWorld, scriptId: string): { id: string; name?: string }[] {
  return world.entities.filter((e) => e.scripts?.includes(scriptId)).map((e) => ({ id: e.id, name: e.name }))
}

function getEntitiesUsingTransformer(world: RennWorld, transformerId: string): { id: string; name?: string }[] {
  return world.entities.filter((e) => e.transformers?.includes(transformerId)).map((e) => ({ id: e.id, name: e.name }))
}

function getEntitiesUsingPipe(world: RennWorld, pipeId: string): { id: string; name?: string }[] {
  return world.entities.filter((e) => e.transformerPipe === pipeId).map((e) => ({ id: e.id, name: e.name }))
}

function scriptIdsIntersectionForEntities(entities: { scripts?: string[] }[]): string[] {
  if (entities.length === 0) return []
  let common = new Set(entities[0]!.scripts ?? [])
  for (let i = 1; i < entities.length; i++) {
    const next = new Set(entities[i]!.scripts ?? [])
    common = new Set([...common].filter((id) => next.has(id)))
  }
  return [...common]
}

function transformerIdsIntersectionForEntities(entities: { transformers?: string[] }[]): string[] {
  if (entities.length === 0) return []
  let common = new Set(entities[0]!.transformers ?? [])
  for (let i = 1; i < entities.length; i++) {
    const next = new Set(entities[i]!.transformers ?? [])
    common = new Set([...common].filter((id) => next.has(id)))
  }
  return [...common]
}

function pipeIdsIntersectionForEntities(entities: { transformerPipe?: string }[]): string[] {
  if (entities.length === 0) return []
  const firstPipe = entities[0]!.transformerPipe
  if (!firstPipe) return []
  for (let i = 1; i < entities.length; i++) {
    if (entities[i]!.transformerPipe !== firstPipe) return []
  }
  return [firstPipe]
}

function suggestCopyId(base: string, taken: Set<string>): string {
  let i = 0
  let c = `${base}_copy`
  while (taken.has(c)) {
    i += 1
    c = `${base}_copy${i}`
  }
  return c
}

type AssignTarget =
  | { registry: 'scripts'; id: string }
  | { registry: 'transformers'; id: string }
  | { registry: 'pipes'; id: string }

type IdConflict =
  | {
      target: 'world'
      registry: 'scripts' | 'transformers' | 'pipes'
      attemptedId: string
      def: ScriptDef | TransformerDef | TransformerPipe
      /** Set when copying from the global library for immediate assign after the definition lands in the project. */
      openAssignAfter?: boolean
    }
  | {
      target: 'global'
      registry: 'scripts' | 'transformers' | 'pipes'
      attemptedId: string
      def: ScriptDef | TransformerDef | TransformerPipe
    }

export interface WorkspaceOrganizeTabProps {
  world: RennWorld
  selectedEntityIds: string[]
  entry: WorkspaceTarget | null | undefined
  onWorldChange: (world: RennWorld) => void
  /** Switch shell tab + anchor editor (Organize → Edit). */
  onNavigateToEditor: (target: WorkspaceTarget) => void
  /** Keep `entry` in sync when user changes Organize subtabs (optional). */
  onOrganizeContextChange?: (scope: WorkspaceOrganizeScope, kind: WorkspaceOrganizeKind) => void
  globalLibrary: GlobalBehaviorLibrary
  onGlobalLibraryChange: (next: GlobalBehaviorLibrary) => void
  onSelectEntity?: (id: string) => void
}

export default function WorkspaceOrganizeTab({
  world,
  selectedEntityIds,
  entry,
  onWorldChange,
  onNavigateToEditor,
  onOrganizeContextChange,
  globalLibrary,
  onGlobalLibraryChange,
  onSelectEntity,
}: WorkspaceOrganizeTabProps) {
  const undo = useEditorUndo()
  const pushUndo = useCallback(() => undo?.pushBeforeEdit(), [undo])

  const selectedEntities = useMemo(
    () =>
      selectedEntityIds
        .map((id) => world.entities.find((e) => e.id === id))
        .filter((e): e is NonNullable<typeof e> => e != null),
    [selectedEntityIds, world.entities],
  )

  const [scope, setScope] = useState<WorkspaceOrganizeScope>('project')
  const [kind, setKind] = useState<WorkspaceOrganizeKind>('transformers')
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (entry?.tab === 'organize' && entry.organize) {
      setScope(entry.organize.scope)
      setKind(entry.organize.kind)
    }
  }, [entry?.tab, entry?.organize])

  useEffect(() => {
    setExpandedTypes(new Set())
  }, [scope, kind])

  const syncOrganize = useCallback(
    (nextScope: WorkspaceOrganizeScope, nextKind: WorkspaceOrganizeKind) => {
      setScope(nextScope)
      setKind(nextKind)
      onOrganizeContextChange?.(nextScope, nextKind)
    },
    [onOrganizeContextChange],
  )

  const scripts = useMemo(() => world.scripts ?? {}, [world.scripts])
  const transformers = useMemo(() => world.transformers ?? {}, [world.transformers])
  const pipes = world.transformerPipes ?? {}
  const globalScripts = useMemo(() => globalLibrary.scripts ?? {}, [globalLibrary.scripts])
  const globalTransformers = useMemo(() => globalLibrary.transformers ?? {}, [globalLibrary.transformers])
  const globalPipes = globalLibrary.transformerPipes ?? {}

  const entityIntersectionScriptIds = scriptIdsIntersectionForEntities(selectedEntities)
  const entityIntersectionTransformerIds = transformerIdsIntersectionForEntities(selectedEntities)

  const scriptIdsForCards = useMemo(() => {
    if (scope === 'global') return Object.keys(globalScripts).sort()
    if (scope === 'entity') {
      return entityIntersectionScriptIds.filter((id) => scripts[id] != null)
    }
    return Object.keys(scripts).sort()
  }, [scope, entityIntersectionScriptIds, scripts, globalScripts])

  const transformerIdsForCards = useMemo(() => {
    if (scope === 'global') return Object.keys(globalTransformers).sort()
    if (scope === 'entity') {
      return entityIntersectionTransformerIds.filter((id) => transformers[id] != null)
    }
    return Object.keys(transformers).sort()
  }, [scope, entityIntersectionTransformerIds, transformers, globalTransformers])

  const pipeIdsForCards = useMemo(() => {
    const registry = scope === 'global' ? globalLibrary.transformerPipes ?? {} : world.transformerPipes ?? {}
    if (scope === 'entity') {
      return pipeIdsIntersectionForEntities(selectedEntities).filter((id) => registry[id] != null)
    }
    return Object.keys(registry).sort()
  }, [scope, selectedEntities, world.transformerPipes, globalLibrary.transformerPipes])

  const toggleTypeExpanded = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const groupedScripts = useMemo(() => {
    const registry = scope === 'global' ? globalScripts : scripts
    const groups: Record<string, string[]> = {}
    for (const id of scriptIdsForCards) {
      const def = getScriptDef(registry, id)
      const title = getScriptEventLabel(def)
      if (!groups[title]) groups[title] = []
      groups[title].push(id)
    }
    return groups
  }, [scriptIdsForCards, scope, globalScripts, scripts])

  const groupedTransformers = useMemo(() => {
    const registry = scope === 'global' ? globalTransformers : transformers
    const groups: Record<string, string[]> = {}
    for (const id of transformerIdsForCards) {
      const def = registry[id]!
      const title = def.name || def.type
      if (!groups[title]) groups[title] = []
      groups[title].push(id)
    }
    return groups
  }, [transformerIdsForCards, scope, globalTransformers, transformers])

  const groupedPipes = useMemo(() => {
    const registry = scope === 'global' ? globalLibrary.transformerPipes ?? {} : world.transformerPipes ?? {}
    const groups: Record<string, string[]> = {}
    for (const id of pipeIdsForCards) {
      const def = registry[id]!
      const title = def.name || 'Untitled Pipe'
      if (!groups[title]) groups[title] = []
      groups[title].push(id)
    }
    return groups
  }, [pipeIdsForCards, scope, globalLibrary.transformerPipes, world.transformerPipes])

  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null)
  const [pipeAssignMode, setPipeAssignMode] = useState<'linked' | 'copy'>('linked')
  const [idConflict, setIdConflict] = useState<IdConflict | null>(null)

  const assignInitialSelection = useMemo(() => {
    if (!assignTarget) return new Set<string>()
    const users =
      assignTarget.registry === 'scripts'
        ? getEntitiesUsingScript(world, assignTarget.id)
        : assignTarget.registry === 'pipes'
        ? getEntitiesUsingPipe(world, assignTarget.id)
        : getEntitiesUsingTransformer(world, assignTarget.id)
    return new Set(users.map((u) => u.id))
  }, [assignTarget, world])

  const openAssign = (t: AssignTarget) => {
    setAssignTarget(t)
  }

  const applyAssign = (want: Set<string>) => {
    if (!assignTarget) return
    pushUndo()
    const id = assignTarget.id
    uiLogger.click('WorkspaceOrganizeTab', 'Apply assign', {
      registry: assignTarget.registry,
      id,
      entityCount: want.size,
    })
    if (assignTarget.registry === 'pipes') {
      const pipe = (world.transformerPipes ?? {})[id] || (globalLibrary.transformerPipes ?? {})[id]
      if (pipe) {
        let nextWorld = world
        for (const e of world.entities) {
          const had = e.transformerPipe === id
          const should = want.has(e.id)
          if (should) {
            nextWorld = assignPipeToEntity(nextWorld, e.id, pipe, pipeAssignMode)
          } else if (had) {
            nextWorld = {
              ...nextWorld,
              entities: nextWorld.entities.map((ent) =>
                ent.id === e.id ? { ...ent, transformerPipe: undefined } : ent,
              ),
            }
          }
        }
        onWorldChange(nextWorld)
      }
    } else if (assignTarget.registry === 'scripts') {
      onWorldChange({
        ...world,
        entities: world.entities.map((e) => {
          const had = e.scripts?.includes(id) ?? false
          const should = want.has(e.id)
          if (had === should) return e
          const arr = [...(e.scripts ?? [])]
          if (should && !arr.includes(id)) arr.push(id)
          if (!should) {
            return { ...e, scripts: arr.filter((x) => x !== id) }
          }
          return { ...e, scripts: arr }
        }),
      })
    } else {
      onWorldChange({
        ...world,
        entities: world.entities.map((e) => {
          const had = e.transformers?.includes(id) ?? false
          const should = want.has(e.id)
          if (had === should) return e
          const arr = [...(e.transformers ?? [])]
          if (should && !arr.includes(id)) arr.push(id)
          if (!should) {
            return { ...e, transformers: arr.filter((x) => x !== id) }
          }
          return { ...e, transformers: arr }
        }),
      })
    }
  }

  const anchorEntityId = entry?.entityId ?? selectedEntityIds[0] ?? ''

  const handleEdit = (registry: WorkspaceOrganizeKind, itemId: string, itemSource: 'project' | 'global' = 'project') => {
    let targetEntityId = anchorEntityId

    // If no entity is selected, or the current selection doesn't use this item, try to find one that does.
    if (itemSource === 'project') {
      const isUsedByCurrent =
        targetEntityId &&
        (registry === 'scripts'
          ? world.entities.find((e) => e.id === targetEntityId)?.scripts?.includes(itemId)
          : registry === 'pipes'
          ? world.entities.find((e) => e.id === targetEntityId)?.transformerPipe === itemId
          : world.entities.find((e) => e.id === targetEntityId)?.transformers?.includes(itemId))

      if (!isUsedByCurrent) {
        const users =
          registry === 'scripts'
            ? getEntitiesUsingScript(world, itemId)
            : registry === 'pipes'
            ? getEntitiesUsingPipe(world, itemId)
            : getEntitiesUsingTransformer(world, itemId)
        if (users.length > 0) {
          targetEntityId = users[0]!.id
          onSelectEntity?.(targetEntityId)
        }
      }
    }

    onNavigateToEditor({
      entityId: targetEntityId,
      tab: registry === 'scripts' ? 'scripts' : 'transformers',
      itemId: registry === 'pipes' ? undefined : itemId,
      ...(itemSource === 'global' ? { itemSource: 'global' as const } : {}),
    })
  }

  const handleEntityLinkClick = useCallback(
    (entityId: string, itemId: string, kind: WorkspaceOrganizeKind, source: 'project' | 'global') => {
      onSelectEntity?.(entityId)
      onNavigateToEditor({
        entityId,
        tab: kind === 'scripts' ? 'scripts' : 'transformers',
        itemId,
        ...(source === 'global' ? { itemSource: 'global' as const } : {}),
      })
    },
    [onNavigateToEditor, onSelectEntity],
  )

  const handleDeletePipe = (id: string) => {
    if (scope === 'global') {
      if (!window.confirm(`Remove pipe "${id}" from the global library?`)) return
      const next = { ...(globalLibrary.transformerPipes ?? {}) }
      delete next[id]
      onGlobalLibraryChange({ ...globalLibrary, transformerPipes: next })
      return
    }

    const entitiesUsing = getEntitiesUsingPipe(world, id)
    if (entitiesUsing.length > 0) {
      if (
        !window.confirm(
          `This pipe is used by ${entitiesUsing.length} entities. Deleting it will decouple them. Continue?`,
        )
      )
        return
    } else if (!window.confirm(`Delete pipe "${id}"?`)) {
      return
    }

    pushUndo()
    onWorldChange(deletePipeFromWorld(world, id))
  }

  const handleRenamePipe = (oldId: string) => {
    const registry = scope === 'global' ? globalLibrary.transformerPipes ?? {} : world.transformerPipes ?? {}
    const def = registry[oldId]
    if (!def) return
    const raw = window.prompt('New pipe ID:', oldId)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId || newId === oldId) return
    if (registry[newId]) {
      window.alert('A pipe with this ID already exists.')
      return
    }

    if (scope === 'global') {
      const next = { ...(globalLibrary.transformerPipes ?? {}) }
      delete next[oldId]
      onGlobalLibraryChange({ ...globalLibrary, transformerPipes: { ...next, [newId]: { ...def, id: newId } } })
    } else {
      pushUndo()
      const nextPipes = { ...(world.transformerPipes ?? {}) }
      delete nextPipes[oldId]
      nextPipes[newId] = { ...def, id: newId }
      const nextEntities = world.entities.map((e) =>
        e.transformerPipe === oldId ? { ...e, transformerPipe: newId } : e,
      )
      onWorldChange({ ...world, transformerPipes: nextPipes, entities: nextEntities })
    }
  }

  const handlePromotePipeToGlobal = (id: string) => {
    const def = world.transformerPipes?.[id]
    if (!def) return
    if (globalLibrary.transformerPipes?.[id]) {
      setIdConflict({ target: 'global', registry: 'pipes', attemptedId: id, def: deepClone(def) })
      return
    }
    onGlobalLibraryChange({
      ...globalLibrary,
      transformerPipes: { ...(globalLibrary.transformerPipes ?? {}), [id]: deepClone(def) },
    })
  }

  const handleCopyGlobalPipeToProject = (id: string) => {
    const def = globalLibrary.transformerPipes?.[id]
    if (!def) return
    const taken = new Set(Object.keys(world.transformerPipes ?? {}))
    const suggestion = suggestCopyId(id, taken)
    const raw = window.prompt('Project pipe ID:', suggestion)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId) return

    pushUndo()
    onWorldChange({
      ...world,
      transformerPipes: { ...(world.transformerPipes ?? {}), [newId]: { ...deepClone(def), id: newId } },
    })
  }

  const handleAssignPipeFromGlobal = (id: string) => {
    const def = globalLibrary.transformerPipes?.[id]
    if (!def) return
    const taken = world.transformerPipes ?? {}
    if (taken[id]) {
      setIdConflict({
        target: 'world',
        registry: 'pipes',
        attemptedId: id,
        def: deepClone(def),
        openAssignAfter: true,
      })
      return
    }
    pushUndo()
    onWorldChange({
      ...world,
      transformerPipes: { ...(world.transformerPipes ?? {}), [id]: deepClone(def) },
    })
    setAssignTarget({ registry: 'pipes', id })
  }

  const handleDeleteScript = (id: string) => {
    if (!window.confirm(`Delete script "${id}" from the world? Entities will detach.`)) return
    pushUndo()
    const { [id]: _removed, ...rest } = scripts
    onWorldChange({
      ...world,
      scripts: rest,
      entities: world.entities.map((e) => ({
        ...e,
        scripts: e.scripts?.filter((sid) => sid !== id) ?? [],
      })),
    })
  }

  const handleDeleteTransformer = (id: string) => {
    if (!window.confirm(`Delete transformer "${id}" from the world? Entities will detach.`)) return
    pushUndo()
    const { [id]: _removed, ...rest } = transformers
    onWorldChange({
      ...world,
      transformers: rest,
      entities: world.entities.map((e) => ({
        ...e,
        transformers: e.transformers?.filter((tid) => tid !== id) ?? [],
      })),
    })
  }

  const handleRenameScript = (oldId: string) => {
    const def = getScriptDef(scripts, oldId)
    if (!def) return
    const raw = window.prompt('New script ID:', oldId)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId || newId === oldId) return
    if (scripts[newId]) {
      window.alert('A script with this ID already exists.')
      return
    }
    pushUndo()
    const { [oldId]: _removed, ...rest } = scripts
    onWorldChange({
      ...world,
      scripts: { ...rest, [newId]: def },
      entities: world.entities.map((e) => ({
        ...e,
        scripts: e.scripts?.map((sid) => (sid === oldId ? newId : sid)) ?? [],
      })),
    })
  }

  const handleRenameTransformer = (oldId: string) => {
    const def = transformers[oldId]
    if (!def) return
    const raw = window.prompt('New transformer ID:', oldId)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId || newId === oldId) return
    if (transformers[newId]) {
      window.alert('A transformer with this ID already exists.')
      return
    }
    pushUndo()
    const { [oldId]: _removed, ...rest } = transformers
    onWorldChange({
      ...world,
      transformers: { ...rest, [newId]: def },
      entities: world.entities.map((e) => ({
        ...e,
        transformers: e.transformers?.map((tid) => (tid === oldId ? newId : tid)) ?? [],
      })),
    })
  }

  const handleToggleEnabledTransformer = (id: string) => {
    const def = transformers[id]
    if (!def) return
    pushUndo()
    onWorldChange({
      ...world,
      transformers: {
        ...transformers,
        [id]: { ...def, enabled: def.enabled === false },
      },
    })
  }

  const finishCopyScript = (targetId: string, def: ScriptDef, openAssignAfter?: boolean) => {
    if (scripts[targetId]) {
      setIdConflict({
        target: 'world',
        registry: 'scripts',
        attemptedId: targetId,
        def: deepClone(def),
        openAssignAfter,
      })
      return
    }
    pushUndo()
    onWorldChange({
      ...world,
      scripts: { ...scripts, [targetId]: deepClone(def) },
    })
    if (openAssignAfter) setAssignTarget({ registry: 'scripts', id: targetId })
  }

  const finishCopyTransformer = (targetId: string, def: TransformerDef, openAssignAfter?: boolean) => {
    if (transformers[targetId]) {
      setIdConflict({
        target: 'world',
        registry: 'transformers',
        attemptedId: targetId,
        def: deepClone(def),
        openAssignAfter,
      })
      return
    }
    pushUndo()
    onWorldChange({
      ...world,
      transformers: { ...transformers, [targetId]: deepClone(def) },
    })
    if (openAssignAfter) setAssignTarget({ registry: 'transformers', id: targetId })
  }

  const handleCopyScript = (id: string) => {
    const def = getScriptDef(scripts, id)
    if (!def) return
    const taken = new Set(Object.keys(scripts))
    const suggestion = suggestCopyId(id, taken)
    const raw = window.prompt('New script ID (copy):', suggestion)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId) return
    finishCopyScript(newId, def)
  }

  const handleCopyTransformer = (id: string) => {
    const def = transformers[id]
    if (!def) return
    const taken = new Set(Object.keys(transformers))
    const suggestion = suggestCopyId(id, taken)
    const raw = window.prompt('New transformer ID (copy):', suggestion)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId) return
    finishCopyTransformer(newId, def)
  }

  const resolveIdConflict = (choice: 'overwrite' | 'rename', newId?: string) => {
    if (!idConflict) return
    let finalId = idConflict.attemptedId
    if (choice === 'rename') {
      const rid = newId?.trim() ?? ''
      if (!rid) return
      finalId = rid
      if (idConflict.target === 'world') {
        const taken =
          idConflict.registry === 'scripts' ? scripts
          : idConflict.registry === 'pipes' ? pipes
          : transformers
        if (taken[finalId]) {
          window.alert('That ID is also taken. Choose another name.')
          return
        }
      } else {
        const taken =
          idConflict.registry === 'scripts' ? globalScripts
          : idConflict.registry === 'pipes' ? globalPipes
          : globalTransformers
        if (taken[finalId]) {
          window.alert('That ID is also taken. Choose another name.')
          return
        }
      }
    }

    if (idConflict.target === 'world') {
      const { registry, def, openAssignAfter } = idConflict
      pushUndo()
      if (registry === 'scripts') {
        onWorldChange({
          ...world,
          scripts: { ...scripts, [finalId]: deepClone(def as ScriptDef) },
        })
      } else if (registry === 'pipes') {
        onWorldChange({
          ...world,
          transformerPipes: { ...pipes, [finalId]: { ...deepClone(def as TransformerPipe), id: finalId } },
        })
      } else {
        onWorldChange({
          ...world,
          transformers: { ...transformers, [finalId]: deepClone(def as TransformerDef) },
        })
      }
      if (openAssignAfter) setAssignTarget({ registry, id: finalId })
    } else {
      const { registry, def } = idConflict
      if (registry === 'scripts') {
        onGlobalLibraryChange({
          ...globalLibrary,
          scripts: { ...globalScripts, [finalId]: deepClone(def as ScriptDef) },
        })
      } else if (registry === 'pipes') {
        onGlobalLibraryChange({
          ...globalLibrary,
          transformerPipes: { ...globalPipes, [finalId]: { ...deepClone(def as TransformerPipe), id: finalId } },
        })
      } else {
        onGlobalLibraryChange({
          ...globalLibrary,
          transformers: { ...globalTransformers, [finalId]: deepClone(def as TransformerDef) },
        })
      }
    }
    setIdConflict(null)
  }

  const handleDetachScript = (id: string) => {
    if (selectedEntityIds.length === 0) {
      window.alert('Select at least one entity to detach from.')
      return
    }
    pushUndo()
    const idSet = new Set(selectedEntityIds)
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        idSet.has(e.id) ? { ...e, scripts: e.scripts?.filter((sid) => sid !== id) ?? [] } : e,
      ),
    })
  }

  const handleDetachTransformer = (id: string) => {
    if (selectedEntityIds.length === 0) {
      window.alert('Select at least one entity to detach from.')
      return
    }
    pushUndo()
    const idSet = new Set(selectedEntityIds)
    onWorldChange({
      ...world,
      entities: world.entities.map((e) =>
        idSet.has(e.id) ? { ...e, transformers: e.transformers?.filter((tid) => tid !== id) ?? [] } : e,
      ),
    })
  }

  const handleCleanupUnused = useCallback(() => {
    const usedIds = new Set<string>()
    for (const e of world.entities) {
      if (kind === 'scripts') {
        e.scripts?.forEach((id) => usedIds.add(id))
      } else {
        e.transformers?.forEach((id) => usedIds.add(id))
      }
    }
    const allIds = Object.keys(kind === 'scripts' ? world.scripts ?? {} : world.transformers ?? {})
    const unusedIds = allIds.filter((id) => !usedIds.has(id))

    if (unusedIds.length === 0) {
      window.alert(`No unused ${kind} found.`)
      return
    }

    if (!window.confirm(`Remove ${unusedIds.length} unused ${kind} from the project registry?`)) {
      return
    }

    pushUndo()
    if (kind === 'scripts') {
      const nextScripts = { ...(world.scripts ?? {}) }
      unusedIds.forEach((id) => delete nextScripts[id])
      onWorldChange({ ...world, scripts: nextScripts })
    } else {
      const nextTransformers = { ...(world.transformers ?? {}) }
      unusedIds.forEach((id) => delete nextTransformers[id])
      onWorldChange({ ...world, transformers: nextTransformers })
    }
    uiLogger.click('WorkspaceOrganizeTab', `Cleaned up unused ${kind}`, { count: unusedIds.length, kind })
  }, [world, kind, pushUndo, onWorldChange])

  const handleDeleteGlobalScript = (id: string) => {
    if (!window.confirm(`Remove script "${id}" from the global library?`)) return
    const { [id]: _removed, ...rest } = globalScripts
    onGlobalLibraryChange({ ...globalLibrary, scripts: rest })
  }

  const handleDeleteGlobalTransformer = (id: string) => {
    if (!window.confirm(`Remove transformer "${id}" from the global library?`)) return
    const { [id]: _removed, ...rest } = globalTransformers
    onGlobalLibraryChange({ ...globalLibrary, transformers: rest })
  }

  const handleRenameGlobalScript = (oldId: string) => {
    const def = globalScripts[oldId]
    if (!def) return
    const raw = window.prompt('New global script ID:', oldId)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId || newId === oldId) return
    if (globalScripts[newId]) {
      window.alert('A global script with this ID already exists.')
      return
    }
    const { [oldId]: _removed, ...rest } = globalScripts
    onGlobalLibraryChange({ ...globalLibrary, scripts: { ...rest, [newId]: def } })
  }

  const handleRenameGlobalTransformer = (oldId: string) => {
    const def = globalTransformers[oldId]
    if (!def) return
    const raw = window.prompt('New global transformer ID:', oldId)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId || newId === oldId) return
    if (globalTransformers[newId]) {
      window.alert('A global transformer with this ID already exists.')
      return
    }
    const { [oldId]: _removed, ...rest } = globalTransformers
    onGlobalLibraryChange({ ...globalLibrary, transformers: { ...rest, [newId]: def } })
  }

  const handleToggleEnabledGlobalTransformer = (id: string) => {
    const def = globalTransformers[id]
    if (!def) return
    onGlobalLibraryChange({
      ...globalLibrary,
      transformers: {
        ...globalTransformers,
        [id]: { ...def, enabled: def.enabled === false },
      },
    })
  }

  const handleCopyGlobalScriptToProject = (id: string) => {
    const def = globalScripts[id]
    if (!def) return
    const taken = new Set(Object.keys(scripts))
    const suggestion = suggestCopyId(id, taken)
    const raw = window.prompt('Project script ID:', suggestion)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId) return
    finishCopyScript(newId, deepClone(def))
  }

  const handleCopyGlobalTransformerToProject = (id: string) => {
    const def = globalTransformers[id]
    if (!def) return
    const taken = new Set(Object.keys(transformers))
    const suggestion = suggestCopyId(id, taken)
    const raw = window.prompt('Project transformer ID:', suggestion)
    if (raw == null) return
    const newId = raw.trim()
    if (!newId) return
    finishCopyTransformer(newId, deepClone(def))
  }

  const handleAssignFromGlobal = (registry: 'scripts' | 'transformers', id: string) => {
    const def = registry === 'scripts' ? globalScripts[id] : globalTransformers[id]
    if (!def) return
    const taken = registry === 'scripts' ? scripts : transformers
    if (taken[id]) {
      setIdConflict({
        target: 'world',
        registry,
        attemptedId: id,
        def: deepClone(def as ScriptDef & TransformerDef),
        openAssignAfter: true,
      })
      return
    }
    pushUndo()
    if (registry === 'scripts') {
      onWorldChange({
        ...world,
        scripts: { ...scripts, [id]: deepClone(def as ScriptDef) },
      })
    } else {
      onWorldChange({
        ...world,
        transformers: { ...transformers, [id]: deepClone(def as TransformerDef) },
      })
    }
    setAssignTarget({ registry, id })
  }

  const handlePromoteScriptToGlobal = (id: string) => {
    const def = getScriptDef(scripts, id)
    if (!def) return
    if (globalScripts[id]) {
      setIdConflict({ target: 'global', registry: 'scripts', attemptedId: id, def: deepClone(def) })
      return
    }
    onGlobalLibraryChange({
      ...globalLibrary,
      scripts: { ...globalScripts, [id]: deepClone(def) },
    })
  }

  const handlePromoteTransformerToGlobal = (id: string) => {
    const def = transformers[id]
    if (!def) return
    if (globalTransformers[id]) {
      setIdConflict({ target: 'global', registry: 'transformers', attemptedId: id, def: deepClone(def) })
      return
    }
    onGlobalLibraryChange({
      ...globalLibrary,
      transformers: { ...globalTransformers, [id]: deepClone(def) },
    })
  }

  const showProjectActions = scope === 'project'
  const showEntityActions = scope === 'entity'
  const showGlobalActions = scope === 'global'

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        gap: 12,
      }}
      data-testid="workspace-organize-tab"
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          borderBottom: `1px solid ${theme.border.default}`,
          paddingBottom: 10,
        }}
        role="tablist"
        aria-label="Organize scope"
      >
        {(['global', 'project', 'entity'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={scope === s}
            data-testid={`workspace-organize-scope-${s}`}
            style={tabStyle(scope === s)}
            onClick={() => syncOrganize(s, kind)}
          >
            {s === 'global' ? 'Global' : s === 'project' ? 'Project' : 'Entity'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }} role="tablist" aria-label="Organize registry">
        {(['transformers', 'scripts', 'pipes'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            data-testid={`workspace-organize-kind-${k}`}
            style={tabStyle(kind === k)}
            onClick={() => syncOrganize(scope, k)}
          >
            {k === 'transformers' ? 'Transformers' : k === 'scripts' ? 'Scripts' : 'Pipes'}
          </button>
        ))}
        {scope === 'project' && (
          <button
            type="button"
            onClick={handleCleanupUnused}
            title={`Remove all ${kind} that are not assigned to any entity`}
            style={{
              ...SUBTAB_BTN,
              marginLeft: 'auto',
              background: 'transparent',
              color: theme.text.muted,
              borderColor: theme.border.default,
              fontSize: 11,
              padding: '4px 8px',
            }}
          >
            🧹 Cleanup Unused
          </button>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 10,
          alignContent: 'start',
          paddingBottom: 8,
        }}
      >
        {scope === 'entity' && selectedEntityIds.length === 0 && (
          <div style={{ gridColumn: '1 / -1', fontSize: 13, color: theme.text.muted }}>
            Select entities to use Entity scope.
          </div>
        )}
        {kind === 'scripts' &&
          scope === 'global' &&
          Object.entries(groupedScripts).map(([title, ids]) => {
            const isExpanded = expandedTypes.has(title)
            if (ids.length > 1 && !isExpanded) {
              return (
                <WorkspaceOrganizeCard
                  key={`stack-script-${title}`}
                  title={title}
                  subtitle={`${ids.length} scripts`}
                  usageLine="Click to expand"
                  assignments={[]}
                  showAssign={false}
                  showDetach={false}
                  showDelete={false}
                  showCopy={false}
                  showRename={false}
                  onEdit={() => {}}
                  onAssign={() => {}}
                  onDetach={() => {}}
                  onCopy={() => {}}
                  onRename={() => {}}
                  onDelete={() => {}}
                  stackCount={ids.length}
                  onExpand={() => toggleTypeExpanded(title)}
                  testId={`workspace-organize-stack-global-script-${title}`}
                />
              )
            }
            return ids.map((id) => {
              const def = getScriptDef(globalScripts, id)
              const subtitle = getScriptEventLabel(def)
              const inProject = scripts[id] != null
              const users = inProject ? getEntitiesUsingScript(world, id) : []
              const usageLine = inProject
                ? `Also in this world · used by ${users.length} entity(ies)`
                : 'Not in this world yet'
              return (
                <WorkspaceOrganizeCard
                  key={id}
                  title={subtitle}
                  subtitle={id}
                  usageLine={usageLine}
                  assignments={[]}
                  showAssign={showGlobalActions}
                  showDetach={false}
                  showDelete={showGlobalActions}
                  showCopy={showGlobalActions}
                  showRename={showGlobalActions}
                  onEdit={() => handleEdit('scripts', id, 'global')}
                  onAssign={() => handleAssignFromGlobal('scripts', id)}
                  onDetach={() => {}}
                  onCopy={() => handleCopyGlobalScriptToProject(id)}
                  onRename={() => handleRenameGlobalScript(id)}
                  onDelete={() => handleDeleteGlobalScript(id)}
                  testId={`workspace-organize-card-global-script-${id}`}
                  onRegroup={isExpanded ? () => toggleTypeExpanded(title) : undefined}
                />
              )
            })
          })}
        {kind === 'pipes' &&
          Object.entries(groupedPipes).map(([title, ids]) => {
            const isExpanded = expandedTypes.has(title)
            if (ids.length > 1 && !isExpanded) {
              return (
                <WorkspaceOrganizeCard
                  key={`stack-pipe-${title}`}
                  title={title}
                  subtitle={`${ids.length} pipes`}
                  usageLine="Click to expand"
                  assignments={[]}
                  showAssign={false}
                  showDetach={false}
                  showDelete={false}
                  showCopy={false}
                  showRename={false}
                  stackCount={ids.length}
                  onExpand={() => toggleTypeExpanded(title)}
                  onEdit={() => {}}
                  onAssign={() => {}}
                  onDetach={() => {}}
                  onCopy={() => {}}
                  onRename={() => {}}
                  onDelete={() => {}}
                />
              )
            }
            return ids.map((id) => {
              const def = (scope === 'global' ? globalLibrary.transformerPipes ?? {} : world.transformerPipes ?? {})[id]
              if (!def) return null
              const users = getEntitiesUsingPipe(world, id)
              return (
                <WorkspaceOrganizeCard
                  key={id}
                  title={id}
                  subtitle={`${def.stages.length} stages`}
                  usageLine={`Used by ${users.length} entities`}
                  assignments={
                    scope === 'global'
                      ? []
                      : users.map((u) => ({ id: u.id, name: u.name ?? u.id }))
                  }
                  showAssign={scope !== 'entity'}
                  showDetach={scope === 'entity' || users.length > 0}
                  showDelete={true}
                  showCopy={scope === 'global'}
                  showRename={true}
                  showPromote={scope === 'project'}
                  onEdit={() => handleEdit('pipes', id, scope === 'global' ? 'global' : 'project')}
                  onAssign={() => {
                    if (scope === 'global') handleAssignPipeFromGlobal(id)
                    else setAssignTarget({ registry: 'pipes', id })
                  }}
                  onDetach={() => {
                    pushUndo()
                    const nextWorld = {
                      ...world,
                      entities: world.entities.map((e) =>
                        e.transformerPipe === id ? { ...e, transformerPipe: undefined } : e,
                      ),
                    }
                    onWorldChange(nextWorld)
                  }}
                  onCopy={() => handleCopyGlobalPipeToProject(id)}
                  onRename={() => handleRenamePipe(id)}
                  onDelete={() => handleDeletePipe(id)}
                  onPromote={() => handlePromotePipeToGlobal(id)}
                  onSelectEntity={scope === 'global' ? undefined : onSelectEntity}
                  onRegroup={ids.length > 1 ? () => toggleTypeExpanded(title) : undefined}
                />
              )
            })
          })}
        {kind === 'transformers' &&
          scope === 'global' &&
          Object.entries(groupedTransformers).map(([title, ids]) => {
            const isExpanded = expandedTypes.has(title)
            if (ids.length > 1 && !isExpanded) {
              return (
                <WorkspaceOrganizeCard
                  key={`stack-tf-${title}`}
                  title={title}
                  subtitle={`${ids.length} transformers`}
                  usageLine="Click to expand"
                  assignments={[]}
                  showAssign={false}
                  showDetach={false}
                  showDelete={false}
                  showCopy={false}
                  showRename={false}
                  onEdit={() => {}}
                  onAssign={() => {}}
                  onDetach={() => {}}
                  onCopy={() => {}}
                  onRename={() => {}}
                  onDelete={() => {}}
                  stackCount={ids.length}
                  onExpand={() => toggleTypeExpanded(title)}
                  testId={`workspace-organize-stack-global-tf-${title}`}
                />
              )
            }
            return ids.map((id) => {
              const def = globalTransformers[id]!
              const title = def.name || def.type
              const subtitle = `${id}${def.enabled === false ? ' · disabled' : ''}`
              const inProject = transformers[id] != null
              const users = inProject ? getEntitiesUsingTransformer(world, id) : []
              const usageLine = inProject
                ? `Also in this world · used by ${users.length} entity(ies)`
                : 'Not in this world yet'
              return (
                <WorkspaceOrganizeCard
                  key={id}
                  title={title}
                  subtitle={subtitle}
                  usageLine={usageLine}
                  assignments={[]}
                  showAssign={showGlobalActions}
                  showDetach={false}
                  showDelete={showGlobalActions}
                  showCopy={showGlobalActions}
                  showRename={showGlobalActions}
                  enabled={def.enabled !== false}
                  onToggleEnabled={() => handleToggleEnabledGlobalTransformer(id)}
                  onEdit={() => handleEdit('transformers', id, 'global')}
                  onAssign={() => handleAssignFromGlobal('transformers', id)}
                  onDetach={() => {}}
                  onCopy={() => handleCopyGlobalTransformerToProject(id)}
                  onRename={() => handleRenameGlobalTransformer(id)}
                  onDelete={() => handleDeleteGlobalTransformer(id)}
                  testId={`workspace-organize-card-global-tf-${id}`}
                  onRegroup={isExpanded ? () => toggleTypeExpanded(title) : undefined}
                />
              )
            })
          })}
        {kind === 'scripts' &&
          scope !== 'global' &&
          Object.entries(groupedScripts).map(([title, ids]) => {
            const isExpanded = expandedTypes.has(title)
            if (ids.length > 1 && !isExpanded) {
              return (
                <WorkspaceOrganizeCard
                  key={`stack-script-${title}`}
                  title={title}
                  subtitle={`${ids.length} scripts`}
                  usageLine="Click to expand"
                  assignments={[]}
                  showAssign={false}
                  showDetach={false}
                  showDelete={false}
                  showCopy={false}
                  showRename={false}
                  onEdit={() => {}}
                  onAssign={() => {}}
                  onDetach={() => {}}
                  onCopy={() => {}}
                  onRename={() => {}}
                  onDelete={() => {}}
                  stackCount={ids.length}
                  onExpand={() => toggleTypeExpanded(title)}
                  testId={`workspace-organize-stack-script-${title}`}
                />
              )
            }
            return ids.map((id) => {
              const def = getScriptDef(scripts, id)
              const users = getEntitiesUsingScript(world, id)
              const title = getScriptEventLabel(def)
              const subtitle = id
              const usageLine = `Used by ${users.length} entity(ies)`
              const assignments = users.map((u) => ({ id: u.id, name: u.name ?? u.id }))
              return (
                <WorkspaceOrganizeCard
                  key={id}
                  title={title}
                  subtitle={subtitle}
                  usageLine={usageLine}
                  assignments={assignments}
                  showAssign={showProjectActions}
                  showDetach={showEntityActions}
                  showDelete={showProjectActions}
                  showCopy={showProjectActions}
                  showRename={showProjectActions}
                  showPromote={showProjectActions}
                  onEdit={() => handleEdit('scripts', id)}
                  onAssign={() => openAssign({ registry: 'scripts', id })}
                  onDetach={() => handleDetachScript(id)}
                  onCopy={() => handleCopyScript(id)}
                  onRename={() => handleRenameScript(id)}
                  onDelete={() => handleDeleteScript(id)}
                  onPromote={() => handlePromoteScriptToGlobal(id)}
                  onSelectEntity={(eid) => handleEntityLinkClick(eid, id, 'scripts', 'project')}
                  testId={`workspace-organize-card-script-${id}`}
                  onRegroup={isExpanded ? () => toggleTypeExpanded(title) : undefined}
                />
              )
            })
          })}
        {kind === 'transformers' &&
          scope !== 'global' &&
          Object.entries(groupedTransformers).map(([title, ids]) => {
            const isExpanded = expandedTypes.has(title)
            if (ids.length > 1 && !isExpanded) {
              return (
                <WorkspaceOrganizeCard
                  key={`stack-tf-${title}`}
                  title={title}
                  subtitle={`${ids.length} transformers`}
                  usageLine="Click to expand"
                  assignments={[]}
                  showAssign={false}
                  showDetach={false}
                  showDelete={false}
                  showCopy={false}
                  showRename={false}
                  onEdit={() => {}}
                  onAssign={() => {}}
                  onDetach={() => {}}
                  onCopy={() => {}}
                  onRename={() => {}}
                  onDelete={() => {}}
                  stackCount={ids.length}
                  onExpand={() => toggleTypeExpanded(title)}
                  testId={`workspace-organize-stack-tf-${title}`}
                />
              )
            }
            return ids.map((id) => {
              const def = transformers[id]!
              const title = def.name || def.type
              const subtitle = `${id}${def.enabled === false ? ' · disabled' : ''}`
              const users = getEntitiesUsingTransformer(world, id)
              const usageLine = `Used by ${users.length} entity(ies)`
              const assignments = users.map((u) => ({ id: u.id, name: u.name ?? u.id }))
              return (
                <WorkspaceOrganizeCard
                  key={id}
                  title={title}
                  subtitle={subtitle}
                  usageLine={usageLine}
                  assignments={assignments}
                  showAssign={showProjectActions}
                  showDetach={showEntityActions}
                  showDelete={showProjectActions}
                  showCopy={showProjectActions}
                  showRename={showProjectActions}
                  showPromote={showProjectActions}
                  enabled={def.enabled !== false}
                  onToggleEnabled={() => handleToggleEnabledTransformer(id)}
                  onEdit={() => handleEdit('transformers', id)}
                  onAssign={() => openAssign({ registry: 'transformers', id })}
                  onDetach={() => handleDetachTransformer(id)}
                  onCopy={() => handleCopyTransformer(id)}
                  onRename={() => handleRenameTransformer(id)}
                  onDelete={() => handleDeleteTransformer(id)}
                  onPromote={() => handlePromoteTransformerToGlobal(id)}
                  onSelectEntity={(eid) => handleEntityLinkClick(eid, id, 'transformers', 'project')}
                  testId={`workspace-organize-card-tf-${id}`}
                  onRegroup={isExpanded ? () => toggleTypeExpanded(title) : undefined}
                />
              )
            })
          })}
        {kind === 'scripts' && scriptIdsForCards.length === 0 && scope === 'global' && (
          <div style={{ gridColumn: '1 / -1', color: theme.text.muted, fontSize: 13 }}>
            No scripts in the global library. Promote a script from the Project scope to add one.
          </div>
        )}
        {kind === 'transformers' && transformerIdsForCards.length === 0 && scope === 'global' && (
          <div style={{ gridColumn: '1 / -1', color: theme.text.muted, fontSize: 13 }}>
            No transformers in the global library. Promote from the Project scope to add one.
          </div>
        )}
        {kind === 'scripts' && scriptIdsForCards.length === 0 && scope === 'project' && (
          <div style={{ gridColumn: '1 / -1', color: theme.text.muted, fontSize: 13 }}>No scripts in this world.</div>
        )}
        {kind === 'transformers' && transformerIdsForCards.length === 0 && scope === 'project' && (
          <div style={{ gridColumn: '1 / -1', color: theme.text.muted, fontSize: 13 }}>No transformers in registry.</div>
        )}
        {kind === 'scripts' && scope === 'entity' && selectedEntityIds.length > 0 && scriptIdsForCards.length === 0 && (
          <div style={{ gridColumn: '1 / -1', color: theme.text.muted, fontSize: 13 }}>No shared scripts on the selection.</div>
        )}
        {kind === 'transformers' &&
          scope === 'entity' &&
          selectedEntityIds.length > 0 &&
          transformerIdsForCards.length === 0 && (
            <div style={{ gridColumn: '1 / -1', color: theme.text.muted, fontSize: 13 }}>
              No shared transformers on the selection.
            </div>
          )}
        {kind === 'pipes' && pipeIdsForCards.length === 0 && (
          <div style={{ gridColumn: '1 / -1', color: theme.text.muted, fontSize: 13 }}>
            {scope === 'global'
              ? 'No pipes in the global library. Promote from the Project scope to add one.'
              : scope === 'project'
              ? 'No pipes in this world.'
              : 'No shared pipes on the selection.'}
          </div>
        )}
      </div>

      <AssignEntitiesDialog
        isOpen={assignTarget != null}
        onClose={() => setAssignTarget(null)}
        title={
          assignTarget?.registry === 'scripts'
            ? `Assign script "${assignTarget.id}"`
            : assignTarget?.registry === 'pipes'
            ? `Assign pipe "${assignTarget.id}"`
            : assignTarget
            ? `Assign transformer "${assignTarget.id}"`
            : ''
        }
        entities={world.entities.map((e) => ({ id: e.id, name: e.name }))}
        initialSelection={assignInitialSelection}
        onApply={applyAssign}
        subheaderExtra={
          assignTarget?.registry === 'pipes' ? (
            <div style={{ display: 'flex', gap: 16 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: theme.text.secondary,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  checked={pipeAssignMode === 'linked'}
                  onChange={() => setPipeAssignMode('linked')}
                />
                Linked (Live edits)
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: theme.text.secondary,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  checked={pipeAssignMode === 'copy'}
                  onChange={() => setPipeAssignMode('copy')}
                />
                Copy (Independent)
              </label>
            </div>
          ) : undefined
        }
      />

      <WorkspaceConflictDialog
        isOpen={idConflict != null}
        onClose={() => setIdConflict(null)}
        message={
          idConflict?.target === 'global'
            ? 'That ID already exists in the global library. Overwrite the stored template, or choose a new ID.'
            : 'That ID is already present in this world. Overwrite the existing definition, or choose a new ID.'
        }
        conflictingId={idConflict?.attemptedId ?? ''}
        onResolve={(choice, newId) => {
          if (choice === 'overwrite') {
            resolveIdConflict('overwrite')
          } else {
            resolveIdConflict('rename', newId)
          }
        }}
      />
    </div>
  )
}
