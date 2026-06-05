import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import CopyableArea from '@/components/CopyableArea'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import TransformerTemplateDialog from '@/components/TransformerTemplateDialog'
import { TransformerDocsContent } from '@/components/TransformerDocs'
import type { TransformerConfig, PresetTransformerType, TransformerDef, TransformerPipe } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import type { WorkspaceMonacoPayload, WorkspaceTarget } from '@/types/workspace'
import { entityPanelIconButtonStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'
import type { TransformerTraceStep } from '@/transformers/transformerTrace'
import { isPresetTransformerType } from '@/transformers/transformerPresets'
import { syncPriorities, sortAndSyncPriorities } from '@/transformers/transformerUtils'
import { effectiveCustomTransformerCode, validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { useCopyMenu } from '@/contexts/CopyContext'
import {
  allocateTransformerRegistryId,
  commitTransformerConfigsToWorld,
  mapTransformerRegistryIdsToEntity,
  assignPipeToEntity,
  decoupleEntityFromPipe,
  savePipeFromEntity,
} from '@/utils/commitTransformerConfigsToWorld'
import {
  subscribeCustomTransformerRuntimeError,
  getCustomTransformerRuntimeErrors,
  runtimeErrorTargetKey,
} from '@/runtime/customTransformerErrorBridge'
import { mergeTransformers } from '@/utils/entityInspectorMerge'
import {
  TransformerHorizontalPipeline,
  type TransformerCardErrorKind,
} from '@/components/workspace/TransformerPipelineHorizontal'
import { clamp } from '@/utils/numberUtils'
import { uiLogger } from '@/utils/uiLogger'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import WorkspaceGlobalTransformerPanel from '@/components/workspace/WorkspaceGlobalTransformerPanel'
import TransformerCodeErrorOverlay from '@/components/workspace/TransformerCodeErrorOverlay'
import TransformerWatchPanel from '@/components/workspace/TransformerWatchPanel'
import { useDebouncedCompileErrorDisplay } from '@/hooks/useDebouncedCompileErrorDisplay'

/** Workspace horizontal split (code ↔ docs). */
const POPOUT_DOCS_SPLIT_MIN_PX = 300
const POPOUT_DOCS_SPLIT_CODE_MIN_PX = 260
const POPOUT_DOCS_SPLIT_HANDLE_PX = 6
const POPOUT_DOCS_WIDTH_STORAGE_KEY = 'rennWorkspaceTransformerDocsWidthPx'

/** Preset toolbar sits in reserved left gutter; pipeline draws to the right (stage cards visually layer above). */
const PIPELINE_PRESET_TOOLS_GUTTER_PX = 52

function presetBehindPipelineChipStyle(active: boolean, locked: boolean): CSSProperties {
  return {
    ...entityPanelIconButtonStyle,
    width: 30,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: 6,
    padding: 0,
    border: active
      ? `1px solid ${theme.button.infoActiveBorder}`
      : `1px solid rgba(163, 177, 214, 0.32)`,
    background: active ? theme.button.infoActive : 'rgba(28, 33, 48, 0.62)',
    color: theme.text.accentBlue,
    backdropFilter: 'blur(10px)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
    opacity: locked ? 0.42 : active ? 0.95 : 0.82,
    cursor: locked ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.12s ease, border-color 0.12s ease, background 0.12s ease',
  }
}

const CODE_DEBOUNCE_MS = 350

function supportsTemplatePickers(type: string): boolean {
  return isPresetTransformerType(type) && type !== 'custom'
}

function formatCustomRuntimeErrorClipboard(snapshot: {
  message: string
  stack?: string
  code: string
  lineNumber?: number
}): string {
  let out = snapshot.message
  if (snapshot.lineNumber !== undefined) {
    out = `Line ${snapshot.lineNumber}: ${out}`
  }
  if (snapshot.stack?.trim()) {
    out += `\n\n${snapshot.stack.trim()}`
  }
  if (snapshot.code.trim()) {
    out += '\n\n---\nTransformer code\n\n'
    out += snapshot.code
  }
  return out
}

export interface WorkspaceTransformersTabProps {
  world: RennWorld
  selectedEntityIds: string[]
  entry: WorkspaceTarget | null | undefined
  /** Workspace panel `open`; gate entry-driven selection and Monaco publish. */
  workspaceOpen: boolean
  liveTraceSteps: TransformerTraceStep[] | null | undefined
  onWorldChange: (world: RennWorld) => void
  onEntityTransformersChange?: (
    entityIds: string[],
    transformers: TransformerConfig[],
    orderedRegistryIds?: string[],
    isShared?: boolean,
  ) => void
  setMonacoPayload: (payload: WorkspaceMonacoPayload) => void
  /** Host injects shared `TransformerCustomCodeEditor`; tab positions it inside the split layout. */
  monacoSlot: ReactNode
  onResetPoseToSavedWorld?: (entityIds: string[]) => void
  canResetPoseToSaved?: boolean
  resetPoseTitle?: string
  /** IndexedDB global library (Organize → Global → Edit). */
  globalLibrary?: GlobalBehaviorLibrary
  onGlobalLibraryChange?: (next: GlobalBehaviorLibrary) => void
  /** Keeps `entry.itemId` in sync when the user picks a pipeline stage (survives close/reopen). */
  onEntryChange?: (next: WorkspaceTarget) => void
}

/** Transformers Workspace body: pipeline strip, shared Monaco bindings, preset/custom detail panels. */
export default function WorkspaceTransformersTab(props: WorkspaceTransformersTabProps) {
  const gid = props.entry?.itemId
  const onGlobalDefChange = useCallback(
    (next: TransformerDef) => {
      if (!gid) return
      props.onGlobalLibraryChange!({
        ...props.globalLibrary!,
        transformers: { ...props.globalLibrary!.transformers, [gid]: next },
      })
    },
    [gid, props.globalLibrary, props.onGlobalLibraryChange],
  )

  if (
    props.entry?.itemSource === 'global' &&
    gid &&
    props.globalLibrary &&
    props.onGlobalLibraryChange
  ) {
    return (
      <WorkspaceGlobalTransformerPanel
        itemId={gid}
        def={props.globalLibrary.transformers[gid]}
        onDefChange={onGlobalDefChange}
        setMonacoPayload={props.setMonacoPayload}
        monacoSlot={props.monacoSlot}
      />
    )
  }
  return <WorkspaceTransformersTabEntity {...props} />
}

function WorkspaceTransformersTabEntity({
  world,
  selectedEntityIds,
  entry,
  workspaceOpen,
  liveTraceSteps = null,
  onWorldChange,
  onEntityTransformersChange,
  setMonacoPayload,
  monacoSlot,
  onResetPoseToSavedWorld,
  canResetPoseToSaved = false,
  resetPoseTitle = 'Restore saved position and rotation (from world)',
  onEntryChange,
}: WorkspaceTransformersTabProps) {
  const undo = useEditorUndo()
  const { openMenu } = useCopyMenu()
  const headerRef = useRef<HTMLDivElement>(null)

  const entities = useMemo(() => {
    const list: typeof world.entities = []
    for (const id of selectedEntityIds) {
      const e = world.entities.find((x) => x.id === id)
      if (e) list.push(e)
    }
    return list
  }, [selectedEntityIds, world])

  const entityIdsForEdit = entities.map((e) => e.id)
  const mergedIds = useMemo(() => mergeTransformers(entities), [entities])
  const anyLocked = entities.some((e) => e.locked)
  const transformersMixed = mergedIds === null
  const worldTf = useMemo(() => world.transformers ?? {}, [world.transformers])

  const linkedPipeId = entities.length === 1 ? entities[0].transformerPipe : undefined
  const linkedPipe = linkedPipeId ? (world.transformerPipes ?? {})[linkedPipeId] : undefined

  const usageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of world.entities) {
      e.transformers?.forEach((id) => {
        counts[id] = (counts[id] || 0) + 1
      })
    }
    return counts
  }, [world.entities])

  const sortedPairs = useMemo(() => {
    if (mergedIds == null) return null
    const raw = mergedIds
      .map((id) => ({ id, config: worldTf[id] }))
      .filter((x): x is { id: string; config: TransformerConfig } => x.config != null)
    raw.sort((a, b) => (a.config.priority ?? 10) - (b.config.priority ?? 10))
    return raw
  }, [mergedIds, worldTf])

  const list = useMemo(() => sortedPairs?.map((p) => p.config) ?? [], [sortedPairs])
  const transformerIds = useMemo(() => sortedPairs?.map((p) => p.id) ?? [], [sortedPairs])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isSharedMode, setIsSharedMode] = useState(false)

  const [savePipeDialogOpen, setSavePipeDialogOpen] = useState(false)
  const [savePipeName, setSavePipeName] = useState('')
  const [savePipeMode, setSavePipeMode] = useState<'linked' | 'copy'>('linked')

  const [addPipeModeDialogOpen, setAddPipeModeDialogOpen] = useState(false)
  const [addPipeDropdownOpen, setAddPipeDropdownOpen] = useState(false)
  const [selectedPipeForAdd, setSelectedPipeForAdd] = useState<TransformerPipe | null>(null)
  /** Entry anchor applied once per itemId — must not re-run when sortedPairs changes (e.g. reorder). */
  const appliedEntryAnchorRef = useRef<string | null>(null)

  /** Apply entry anchor when workspace opens or entry.itemId changes (not on stack reorder). */
  useEffect(() => {
    if (!workspaceOpen) {
      appliedEntryAnchorRef.current = null
      return
    }
    if (entry?.tab !== 'transformers' || !entry?.itemId || !sortedPairs?.length) return
    if (!sortedPairs.some((p) => p.id === entry.itemId)) return
    if (appliedEntryAnchorRef.current === entry.itemId) return
    appliedEntryAnchorRef.current = entry.itemId
    setSelectedId(entry.itemId)
  }, [workspaceOpen, entry?.itemId, entry?.tab, sortedPairs])

  const commitStacksRaw = useCallback(
    (nextConfigs: TransformerConfig[], orderedRegistryIds?: string[]) => {
      if (transformersMixed) return
      const baseIds = orderedRegistryIds ?? transformerIds
      if (onEntityTransformersChange) {
        onEntityTransformersChange(entityIdsForEdit, nextConfigs, baseIds, isSharedMode)
      } else {
        let nextWorld = world
        for (const entityId of entityIdsForEdit) {
          const idsForEntity =
            isSharedMode || entityIdsForEdit.length === 1 ?
              baseIds
            : mapTransformerRegistryIdsToEntity(baseIds, entityId)
          nextWorld = commitTransformerConfigsToWorld(nextWorld, entityId, nextConfigs, idsForEntity)
        }
        onWorldChange(nextWorld)
      }
    },
    [
      entityIdsForEdit,
      isSharedMode,
      onEntityTransformersChange,
      onWorldChange,
      transformersMixed,
      transformerIds,
      world,
    ],
  )

  const commitStacksRawRef = useRef(commitStacksRaw)
  commitStacksRawRef.current = commitStacksRaw

  const canMakeUniqueStage = entityIdsForEdit.length === 1

  const handleMakeUniqueTransformer = useCallback(
    (id: string) => {
      if (!canMakeUniqueStage) return

      const idx = transformerIds.indexOf(id)
      if (idx < 0) return

      const targetEntityId = entityIdsForEdit[0]
      if (!targetEntityId) return

      const nextWorldTransformers = { ...(world.transformers ?? {}) }
      const usedIds = new Set(Object.keys(nextWorldTransformers))
      const newId = allocateTransformerRegistryId(targetEntityId, nextWorldTransformers, usedIds)

      nextWorldTransformers[newId] = JSON.parse(JSON.stringify(nextWorldTransformers[id]))

      const nextWorld = {
        ...world,
        transformers: nextWorldTransformers,
        entities: world.entities.map((e) => {
          if (e.id === targetEntityId) {
            return {
              ...e,
              transformers: e.transformers?.map((tid) => (tid === id ? newId : tid)) ?? [],
              transformerPipe: undefined,
            }
          }
          return e
        }),
      }
      onWorldChange(nextWorld)
      setSelectedId(newId)
      if (onEntryChange && entry) {
        onEntryChange({ ...entry, itemId: newId })
      }
    },
    [transformerIds, entityIdsForEdit, canMakeUniqueStage, world, onWorldChange, onEntryChange, entry],
  )

  const selectedSortedIndex = useMemo(() => {
    if (!selectedId || !sortedPairs) return 0
    const idx = sortedPairs.findIndex((p) => p.id === selectedId)
    return idx >= 0 ? idx : 0
  }, [selectedId, sortedPairs])

  const selectedConfig = list[selectedSortedIndex] ?? null
  const selectedPreset = selectedConfig && isPresetTransformerType(selectedConfig.type) ? selectedConfig : null

  const [docsOpen, setDocsOpen] = useState(false)
  const [watchOpen, setWatchOpen] = useState(false)
  const [docsWidthPx, setDocsWidthPx] = useState(0)
  const [docsAreaWidth, setDocsAreaWidth] = useState(0)
  const splitRowRef = useRef<HTMLDivElement>(null)
  const docsContainerRef = useRef<HTMLDivElement>(null)
  const docsWidthRef = useRef(0)
  docsWidthRef.current = docsWidthPx
  const docsSplitDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  /** Custom code Monaco state */
  const [codeDraft, setCodeDraft] = useState('')
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [monacoRemountKey, setMonacoRemountKey] = useState(0)

  const debounceTimerRef = useRef<number | null>(null)
  const listRef = useRef(list)
  listRef.current = list
  const transformerIdsRef = useRef(transformerIds)
  transformerIdsRef.current = transformerIds
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const codeDraftRef = useRef(codeDraft)
  codeDraftRef.current = codeDraft
  const lastCommittedCodeRef = useRef('')
  const codeUndoPrimedRef = useRef(false)

  const flushPendingCode = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    const sid = selectedIdRef.current
    const cur = listRef.current
    const curIds = transformerIdsRef.current
    const idx = curIds.indexOf(sid ?? '')
    if (idx < 0 || cur[idx]?.type !== 'custom') return
    const text = codeDraftRef.current
    const prevEffective = effectiveCustomTransformerCode(cur[idx]!)
    if (text === prevEffective) return
    lastCommittedCodeRef.current = text
    commitStacksRawRef.current(
      syncPriorities(cur.map((t, i) => (i === idx ? { ...t, code: text } : t))),
      curIds,
    )
  }, [])

  const handleCommitStacks = useCallback(
    (nextConfigs: TransformerConfig[], orderedRegistryIds?: string[]) => {
      flushPendingCode()
      commitStacksRaw(nextConfigs, orderedRegistryIds)
    },
    [commitStacksRaw, flushPendingCode],
  )

  const handleSaveAsPipe = useCallback(() => {
    if (entityIdsForEdit.length === 0) return
    // If multiple entities, save from the first one
    const entityId = entityIdsForEdit[0]!
    const nextWorld = savePipeFromEntity(world, entityId, savePipeName, savePipeMode)
    onWorldChange(nextWorld)
    setSavePipeDialogOpen(false)
  }, [world, entityIdsForEdit, savePipeName, savePipeMode, onWorldChange])

  const handleAddPipe = useCallback(
    (pipe: TransformerPipe, mode: 'linked' | 'copy') => {
      let nextWorld = world
      for (const entityId of entityIdsForEdit) {
        nextWorld = assignPipeToEntity(nextWorld, entityId, pipe, mode)
      }
      onWorldChange(nextWorld)
      setAddPipeModeDialogOpen(false)
      setAddPipeDropdownOpen(false)
    },
    [world, entityIdsForEdit, onWorldChange],
  )

  const handleDecouple = useCallback(() => {
    let nextWorld = world
    for (const entityId of entityIdsForEdit) {
      nextWorld = decoupleEntityFromPipe(nextWorld, entityId)
    }
    onWorldChange(nextWorld)
  }, [world, entityIdsForEdit, onWorldChange])

  const runtimeErrorsByTarget = useSyncExternalStore(
    subscribeCustomTransformerRuntimeError,
    getCustomTransformerRuntimeErrors,
    () => new Map(),
  )

  const runtimeSnapshot = useMemo(() => {
    for (const entityId of selectedEntityIds) {
      const err = runtimeErrorsByTarget.get(runtimeErrorTargetKey(entityId, selectedSortedIndex))
      if (err) return err
    }
    return null
  }, [runtimeErrorsByTarget, selectedEntityIds, selectedSortedIndex])

  const lastErrorRef = useRef<{ message: string; stack?: string; code: string; lineNumber?: number } | null>(null)
  const runtimeErrorForSelection = useMemo(() => {
    if (runtimeSnapshot == null) {
      lastErrorRef.current = null
      return null
    }
    const isForSelection =
      selectedEntityIds.includes(runtimeSnapshot.entityId) &&
      runtimeSnapshot.configStackIndex === selectedSortedIndex
    if (!isForSelection) {
      lastErrorRef.current = null
      return null
    }

    const next = {
      message: runtimeSnapshot.message,
      stack: runtimeSnapshot.stack,
      code: runtimeSnapshot.code,
      lineNumber: runtimeSnapshot.lineNumber,
    }

    if (
      lastErrorRef.current &&
      lastErrorRef.current.message === next.message &&
      lastErrorRef.current.stack === next.stack &&
      lastErrorRef.current.code === next.code &&
      lastErrorRef.current.lineNumber === next.lineNumber
    ) {
      return lastErrorRef.current
    }

    lastErrorRef.current = next
    return next
  }, [runtimeSnapshot, selectedEntityIds, selectedSortedIndex])

  // Display state: keep the last runtime error visible for a short grace period even after
  // the runtime source clears. Show an "active" window briefly, then dim (80% opacity)
  // while keeping the message for KEEP_MS.
  const RUNTIME_KEEP_MS = 10_000
  const RUNTIME_ACTIVE_MS = 1500
  const [displayedRuntime, setDisplayedRuntime] = useState<null | { message: string; stack?: string; code: string; lineNumber?: number }>(
    runtimeErrorForSelection,
  )
  const [runtimeActive, setRuntimeActive] = useState<boolean>(true)
  const runtimeKeepTimerRef = useRef<number | null>(null)
  const runtimeActiveTimerRef = useRef<number | null>(null)
  const codeColumnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!workspaceOpen) setWatchOpen(false)
  }, [workspaceOpen])

  useEffect(() => {
    // If a new runtime error appears for the selection, show it immediately and start the
    // active window timer.
    if (runtimeErrorForSelection) {
      if (runtimeKeepTimerRef.current) {
        window.clearTimeout(runtimeKeepTimerRef.current)
        runtimeKeepTimerRef.current = null
      }

      // Only update state if it actually changed to avoid redundant re-renders.
      setDisplayedRuntime((prev) => {
        if (
          prev &&
          prev.message === runtimeErrorForSelection.message &&
          prev.stack === runtimeErrorForSelection.stack &&
          prev.code === runtimeErrorForSelection.code &&
          prev.lineNumber === runtimeErrorForSelection.lineNumber
        ) {
          return prev
        }
        return runtimeErrorForSelection
      })
      setRuntimeActive(true)

      // Only restart the active timer if the error is different or if it's not already running.
      // This prevents resetting it every frame during live trace updates.
      const isSameError =
        displayedRuntime &&
        displayedRuntime.message === runtimeErrorForSelection.message &&
        displayedRuntime.stack === runtimeErrorForSelection.stack &&
        displayedRuntime.code === runtimeErrorForSelection.code &&
        displayedRuntime.lineNumber === runtimeErrorForSelection.lineNumber

      if (!isSameError || !runtimeActiveTimerRef.current) {
        if (runtimeActiveTimerRef.current) {
          window.clearTimeout(runtimeActiveTimerRef.current)
        }
        runtimeActiveTimerRef.current = window.setTimeout(() => {
          runtimeActiveTimerRef.current = null
          setRuntimeActive(false)
        }, RUNTIME_ACTIVE_MS)
      }
      return
    }

    // If the source cleared but we still have a displayed message, dim it and schedule its removal.
    if (displayedRuntime) {
      setRuntimeActive(false)
      // Only start the keep timer if it's not already running. This prevents resetting
      // the timer every frame during live trace updates.
      if (!runtimeKeepTimerRef.current) {
        runtimeKeepTimerRef.current = window.setTimeout(() => {
          runtimeKeepTimerRef.current = null
          setDisplayedRuntime(null)
        }, RUNTIME_KEEP_MS)
      }
    }

    return () => {
      // NOTE: We do NOT clear timers on cleanup here because this effect re-runs frequently
      // during live traces. Timers are managed by the guards above to be stable across renders.
    }
  }, [runtimeErrorForSelection, displayedRuntime, runtimeActive])

  // Separate unmount cleanup to ensure no leaked timers.
  useEffect(() => {
    return () => {
      if (runtimeKeepTimerRef.current) window.clearTimeout(runtimeKeepTimerRef.current)
      if (runtimeActiveTimerRef.current) window.clearTimeout(runtimeActiveTimerRef.current)
    }
  }, [])

  const selectedCustomCompileKey =
    selectedConfig?.type === 'custom'
      ? `custom:p${selectedConfig.priority ?? 10}`
      : 'custom'

  const compileError = useMemo(() => {
    if (selectedConfig?.type !== 'custom') return null
    return validateCustomTransformerSource(codeDraft, selectedCustomCompileKey)
  }, [selectedConfig?.type, codeDraft, selectedCustomCompileKey])

  const displayedCompileError = useDebouncedCompileErrorDisplay(compileError, codeColumnRef)

  const cardErrorsByStackIndex = useMemo(() => {
    const errors: Record<number, TransformerCardErrorKind> = {}
    for (let i = 0; i < list.length; i++) {
      const config = list[i]
      if (config?.type !== 'custom') continue
      const source =
        i === selectedSortedIndex ?
          codeDraft || effectiveCustomTransformerCode(config)
        : effectiveCustomTransformerCode(config)
      const key = `custom:p${config.priority ?? 10}`
      if (validateCustomTransformerSource(source, key)) {
        errors[i] = 'compile'
      }
    }
    for (let i = 0; i < list.length; i++) {
      if (errors[i] === 'compile') continue
      for (const entityId of selectedEntityIds) {
        if (runtimeErrorsByTarget.has(runtimeErrorTargetKey(entityId, i))) {
          errors[i] = 'runtime'
          break
        }
      }
    }
    return errors
  }, [list, selectedSortedIndex, codeDraft, runtimeErrorsByTarget, selectedEntityIds])

  const syncCodeKey =
    selectedConfig?.type === 'custom'
      ? `${selectedId}:${selectedConfig.code ?? ''}`
      : ''

  useEffect(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (selectedConfig?.type !== 'custom') {
      setCodeDraft('')
      return
    }
    const worldCode = effectiveCustomTransformerCode(selectedConfig)
    setCodeDraft(worldCode)
    lastCommittedCodeRef.current = worldCode
    codeUndoPrimedRef.current = false
  }, [syncCodeKey, selectedConfig, selectedId])

  /** Default first stage when nothing selected (entry anchor effect sets itemId when present). */
  useEffect(() => {
    if (!workspaceOpen || !sortedPairs?.length || selectedId != null) return
    if (entry?.tab === 'transformers' && entry.itemId) return
    setSelectedId(sortedPairs[0]?.id ?? null)
  }, [workspaceOpen, sortedPairs, selectedId, entry?.tab, entry?.itemId])

  /** When the selected registry id disappears (removed), fall back to first stage. */
  useEffect(() => {
    if (sortedPairs != null && selectedId != null && !sortedPairs.some((p) => p.id === selectedId)) {
      setSelectedId(sortedPairs[0]?.id ?? null)
    }
  }, [sortedPairs, selectedId])

  const scheduleCodeCommit = useCallback((text: string) => {
    if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null
      const sid = selectedIdRef.current
      const cur = listRef.current
      const curIds = transformerIdsRef.current
      const idx = curIds.indexOf(sid ?? '')
      if (idx < 0 || cur[idx]?.type !== 'custom') return
      lastCommittedCodeRef.current = text
      commitStacksRawRef.current(
        syncPriorities(cur.map((t, i) => (i === idx ? { ...t, code: text } : t))),
        curIds,
      )
    }, CODE_DEBOUNCE_MS)
  }, [])

  const handleCodeChange = useCallback(
    (text: string) => {
      if (!codeUndoPrimedRef.current) {
        undo?.pushBeforeEdit()
        codeUndoPrimedRef.current = true
      }
      setCodeDraft(text)
      scheduleCodeCommit(text)
    },
    [scheduleCodeCommit, undo],
  )

  const changeSelectedIdWithFlush = useCallback(
    (nextId: string) => {
      flushPendingCode()
      setSelectedId(nextId)
      onEntryChange?.({
        entityId: entry?.entityId ?? entityIdsForEdit[0],
        tab: 'transformers',
        itemId: nextId,
        itemSource: entry?.itemSource,
      })
    },
    [entry?.entityId, entry?.itemSource, entityIdsForEdit, flushPendingCode, onEntryChange],
  )

  useEffect(() => {
    return () => {
      flushPendingCode()
    }
  }, [flushPendingCode])

  const handleCopyPipe = useCallback(() => {
    uiLogger.click('WorkspaceTransformersTab', 'Copy transformer pipe (JSON)')
    flushPendingCode()
    if (!sortedPairs) return

    const payload = transformerIds.map((id, i) => {
      const config = list[i]
      if (id === selectedId && config.type === 'custom') {
        return { id, ...config, code: codeDraft }
      }
      return { id, ...config }
    })

    const text = JSON.stringify(payload, null, 2)
    navigator.clipboard
      .writeText(text)
      .catch((err) => {
        console.error('Failed to copy transformer pipe:', err)
        alert('Failed to copy to clipboard')
      })
  }, [sortedPairs, transformerIds, list, selectedId, codeDraft, flushPendingCode])

  const monacoIsCustom = Boolean(selectedConfig?.type === 'custom')
  const monacoPayload = useMemo(() => {
    if (monacoIsCustom) {
      return {
        kind: 'transformer-ts' as const,
        value: codeDraft,
        onChange: handleCodeChange,
        disabled: anyLocked || transformersMixed || selectedEntityIds.length === 0,
        refreshKey: monacoRemountKey,
      }
    } else {
      return {
        kind: 'placeholder' as const,
        value: '// Select a custom transformer stage in the pipeline to edit TypeScript.',
        onChange: () => {},
        disabled: true,
        refreshKey: monacoRemountKey,
      }
    }
  }, [
    codeDraft,
    handleCodeChange,
    monacoIsCustom,
    anyLocked,
    transformersMixed,
    selectedEntityIds.length,
    monacoRemountKey,
  ])

  useLayoutEffect(() => {
    setMonacoPayload(monacoPayload)
  }, [monacoPayload, setMonacoPayload])

  useEffect(() => {
    if (!docsOpen || typeof window === 'undefined') return
    const el = docsContainerRef.current
    if (!el) return

    const update = () => {
      setDocsAreaWidth(el.clientWidth)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [docsOpen])

  useLayoutEffect(() => {
    if (!docsOpen || typeof window === 'undefined') return
    const row = splitRowRef.current
    if (!row) return

    const readBounds = () => {
      const inner = Math.max(0, row.clientWidth - POPOUT_DOCS_SPLIT_HANDLE_PX)
      const maxDocs = Math.max(POPOUT_DOCS_SPLIT_MIN_PX, inner - POPOUT_DOCS_SPLIT_CODE_MIN_PX)
      return { inner, maxDocs, minDocs: POPOUT_DOCS_SPLIT_MIN_PX }
    }

    const applySizing = (): void => {
      if (docsSplitDragRef.current !== null) return
      const bounds = readBounds()
      setDocsWidthPx((prev) => {
        let next =
          prev > 0 && Number.isFinite(prev)
            ? prev
            : (() => {
                try {
                  const raw = window.localStorage.getItem(POPOUT_DOCS_WIDTH_STORAGE_KEY)
                  const stored = Number(raw)
                  return Number.isFinite(stored) ? stored : NaN
                } catch {
                  return NaN
                }
              })()
        if (!(next > 0 && Number.isFinite(next))) {
          next = Math.round(bounds.inner * 0.4)
        }
        return clamp(next, bounds.minDocs, bounds.maxDocs)
      })
    }

    applySizing()
    const ro = new ResizeObserver(applySizing)
    ro.observe(row)
    return () => ro.disconnect()
  }, [docsOpen])

  const handleDocsSplitMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      e.preventDefault()
      if (!docsOpen) return
      const row = splitRowRef.current
      if (!row || row.clientWidth <= 0) return

      const inner = Math.max(0, row.clientWidth - POPOUT_DOCS_SPLIT_HANDLE_PX)
      const maxDocs = Math.max(POPOUT_DOCS_SPLIT_MIN_PX, inner - POPOUT_DOCS_SPLIT_CODE_MIN_PX)

      const docsMeas = docsContainerRef.current?.getBoundingClientRect()
      const roundedMeas =
        docsMeas != null && docsMeas.width > 0 ?
          Math.round(docsMeas.width)
        : 0
      const startBase =
        roundedMeas >= POPOUT_DOCS_SPLIT_MIN_PX ?
          roundedMeas
        : Math.round(Math.max(docsWidthRef.current || 0, POPOUT_DOCS_SPLIT_MIN_PX))

      const startWidth = clamp(startBase, POPOUT_DOCS_SPLIT_MIN_PX, maxDocs)

      docsSplitDragRef.current = { startX: e.clientX, startWidth }

      let lastCommitted = startWidth

      const onMove = (move: MouseEvent): void => {
        const data = docsSplitDragRef.current
        if (data == null) return

        const r = splitRowRef.current
        if (!r || r.clientWidth <= 0) return
        const inW = Math.max(0, r.clientWidth - POPOUT_DOCS_SPLIT_HANDLE_PX)
        const max = Math.max(POPOUT_DOCS_SPLIT_MIN_PX, inW - POPOUT_DOCS_SPLIT_CODE_MIN_PX)

        const dx = move.clientX - data.startX
        const next = clamp(data.startWidth - dx, POPOUT_DOCS_SPLIT_MIN_PX, max)
        docsWidthRef.current = next
        lastCommitted = next
        setDocsWidthPx(next)
      }

      const onUp = (): void => {
        docsSplitDragRef.current = null
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        try {
          window.localStorage.setItem(POPOUT_DOCS_WIDTH_STORAGE_KEY, String(lastCommitted))
        } catch {
          /* quota */
        }
      }

      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [docsOpen],
  )

  const copyPayload = useMemo(
    () => ({
      transformers: transformersMixed ? null : list,
      selectedEntityIds,
      workspaceTransformersTab: true as const,
    }),
    [list, transformersMixed, selectedEntityIds],
  )

  const handleRuntimeErrorContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      if (runtimeErrorForSelection == null) return
      e.preventDefault()
      e.stopPropagation()
      openMenu(e, () => formatCustomRuntimeErrorClipboard(runtimeErrorForSelection))
    },
    [openMenu, runtimeErrorForSelection],
  )

  if (selectedEntityIds.length === 0) {
    return (
      <div style={{ padding: 16, color: theme.text.muted }}>
        Select an entity in the inspector to edit transformers here.
      </div>
    )
  }

  if (transformersMixed) {
    return (
      <div style={{ padding: 16, color: theme.text.muted, fontSize: 13 }}>
        Transformer stacks differ across the selection. Align stacks by selecting entities with the same stack, or sync
        from the sidebar Transformers tab.
      </div>
    )
  }

  return (
    <CopyableArea
      copyPayload={copyPayload}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        ref={headerRef}
        style={{
          margin: 0,
          padding: '3px 0 4px',
          borderBottom: `1px solid ${theme.border.default}`,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 12,
          flexShrink: 0,
          minWidth: 0,
          overflow: 'visible',
          position: 'relative',
        }}
      >
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            paddingLeft:
              selectedPreset && supportsTemplatePickers(selectedPreset.type) ? PIPELINE_PRESET_TOOLS_GUTTER_PX : 0,
          }}
        >
          {entityIdsForEdit.length > 1 && (
            <div
              style={{
                position: 'absolute',
                top: -18,
                left: 0,
                fontSize: 10,
                fontWeight: 600,
                color: theme.text.accentBlue,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Editing {entityIdsForEdit.length} Entities
              <span style={{ fontWeight: 400, opacity: 0.8, fontStyle: 'italic' }}>
                — Edits here will be applied to all {entityIdsForEdit.length} selected entities.
              </span>
            </div>
          )}
          {selectedPreset && supportsTemplatePickers(selectedPreset.type) ?
            <div
              aria-label="Preset transformer tools"
              style={{
                position: 'absolute',
                left: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 0,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                pointerEvents: 'auto',
              }}
            >
              <button
                type="button"
                data-testid="workspace-preset-load-template"
                onClick={() => setTemplateDialogOpen(true)}
                disabled={anyLocked}
                title="Load transformer template"
                style={presetBehindPipelineChipStyle(false, anyLocked)}
              >
                {EntityPanelIcons.loadTemplate}
              </button>
            </div>
          : null}
          <div
            style={{
              position: 'relative',
              margin: 0,
              flex: '1 1 auto',
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              zIndex: 1,
              marginTop: entityIdsForEdit.length > 1 ? 4 : 0,
            }}
          >
            {linkedPipeId && (
              <div
                style={{
                  position: 'absolute',
                  top: entityIdsForEdit.length > 1 ? -32 : -18,
                  left: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  color: linkedPipe ? theme.text.infoSubtle : theme.text.warning,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  zIndex: 2,
                  whiteSpace: 'nowrap',
                }}
              >
                {linkedPipe ? (
                  <>
                    Shared pipe: <span style={{ color: theme.text.primary }}>{linkedPipe.name}</span> — editing stages
                    here affects all linked entities.
                  </>
                ) : (
                  <>Linked pipe not found (stale reference)</>
                )}
                <button
                  type="button"
                  onClick={handleDecouple}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    color: theme.accent,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Decouple
                </button>
              </div>
            )}
            <TransformerHorizontalPipeline
              transformers={list}
              transformerIds={transformerIds}
              registryEntityId={entityIdsForEdit.length === 1 ? entityIdsForEdit[0] : undefined}
              liveTraceSteps={liveTraceSteps ?? null}
              headerRef={headerRef}
              onCommit={handleCommitStacks}
              onSelectCode={changeSelectedIdWithFlush}
              onMakeUnique={canMakeUniqueStage ? handleMakeUniqueTransformer : undefined}
              makeUniqueDisabledReason={
                canMakeUniqueStage ? undefined : 'Select a single entity to make a shared stage unique'
              }
              usageCounts={usageCounts}
              existingRegistry={world.transformers}
              selectedId={selectedId}
              cardErrorsByStackIndex={cardErrorsByStackIndex}
            />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            marginLeft: 'auto',
          }}
        >
          {entityIdsForEdit.length > 1 && (
            <button
              type="button"
              title={
                isSharedMode ?
                  'Changes will be applied to the same registry IDs for all selected entities'
                : 'Changes will create unique registry IDs for each entity'
              }
              onClick={() => setIsSharedMode(!isSharedMode)}
              style={{
                ...entityPanelIconButtonStyle,
                fontSize: 10,
                padding: '0 8px',
                width: 'auto',
                height: 24,
                borderRadius: 4,
                border: `1px solid ${isSharedMode ? theme.accent : theme.border.default}`,
                background: isSharedMode ? 'rgba(0, 153, 255, 0.15)' : 'transparent',
                color: isSharedMode ? theme.accent : theme.text.muted,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              {isSharedMode ? '🔗 SHARED' : '✂️ ISOLATE'}
            </button>
          )}
          <button
            type="button"
            title={watchOpen ? 'Hide watch panel' : 'Show watch panel'}
            aria-pressed={watchOpen}
            data-testid="workspace-transformer-watch-toggle"
            disabled={!monacoIsCustom || selectedEntityIds.length !== 1}
            onClick={() => setWatchOpen((open) => !open)}
            style={{
              ...entityPanelIconButtonStyle,
              width: 'auto',
              padding: '0 8px',
              fontSize: 11,
              fontWeight: 600,
              opacity: watchOpen ? 1 : 0.65,
              color: watchOpen ? theme.accent : theme.text.muted,
              cursor: !monacoIsCustom || selectedEntityIds.length !== 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Watch
          </button>
          <button
            type="button"
            title={docsOpen ? 'Hide documentation' : 'Show documentation'}
            onClick={() => setDocsOpen(!docsOpen)}
            style={{
              ...entityPanelIconButtonStyle,
              opacity: docsOpen ? 1 : 0.65,
              color: docsOpen ? theme.accent : theme.text.muted,
            }}
          >
            {EntityPanelIcons.document}
          </button>
          {onResetPoseToSavedWorld ?
            <button
              type="button"
              title={resetPoseTitle}
              disabled={!canResetPoseToSaved}
              onClick={() => onResetPoseToSavedWorld(selectedEntityIds)}
              style={{
                ...entityPanelIconButtonStyle,
                cursor: canResetPoseToSaved ? 'pointer' : 'not-allowed',
                opacity: canResetPoseToSaved ? 0.85 : 0.45,
              }}
            >
              {EntityPanelIcons.reset}
            </button>
          : null}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              title="Add pipe from library"
              onClick={() => setAddPipeDropdownOpen(!addPipeDropdownOpen)}
              style={{
                ...entityPanelIconButtonStyle,
                width: 'auto',
                padding: '0 8px',
                fontSize: 11,
                fontWeight: 600,
                color: theme.accent,
                gap: 4,
              }}
            >
              + Add Pipe
            </button>
            {addPipeDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: theme.bg.panel,
                  border: `1px solid ${theme.border.default}`,
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  zIndex: 100,
                  minWidth: 160,
                  padding: '4px 0',
                }}
              >
                {Object.values(world.transformerPipes || {}).length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: theme.text.muted }}>No pipes in world</div>
                )}
                {Object.values(world.transformerPipes || {}).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPipeForAdd(p)
                      setAddPipeModeDialogOpen(true)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 12px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      color: theme.text.primary,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            title="Save current pipeline as a reusable pipe"
            disabled={list.length === 0}
            onClick={() => {
              setSavePipeName(entities[0]?.name || 'New Pipe')
              setSavePipeDialogOpen(true)
            }}
            style={{
              ...entityPanelIconButtonStyle,
              width: 'auto',
              padding: '0 8px',
              fontSize: 11,
              fontWeight: 600,
              opacity: list.length === 0 ? 0.5 : 1,
            }}
          >
            Save as Pipe
          </button>

          <button
            type="button"
            title="Copy transformer pipe (JSON)"
            onClick={handleCopyPipe}
            style={{
              ...entityPanelIconButtonStyle,
              opacity: 0.85,
            }}
          >
            {EntityPanelIcons.clone}
          </button>
          <button
            type="button"
            data-testid="workspace-transformers-refresh-editor"
            onClick={() => {
              flushPendingCode()
              setMonacoRemountKey((k) => k + 1)
            }}
            disabled={anyLocked || !monacoIsCustom}
            title="Reload Monaco editor (layout escape hatch)"
            style={{
              padding: '6px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: `1px solid ${theme.border.default}`,
              background: theme.bg.surface,
              color: theme.text.primary,
              cursor: anyLocked ? 'not-allowed' : 'pointer',
            }}
          >
            Refresh editor
          </button>
        </div>
      </div>

      <div
        ref={splitRowRef}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        <div
          ref={codeColumnRef}
          style={{
            position: 'relative',
            flex:
              docsOpen ?
                docsWidthPx > 0 ?
                  '1 1 0%'
                : '1 1 60%'
              : '1 1 100%',
            minWidth: docsOpen && docsWidthPx > 0 ? POPOUT_DOCS_SPLIT_CODE_MIN_PX : 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {monacoSlot}
          </div>

          {!monacoIsCustom && !selectedPreset ?
            <div style={{ padding: 12, color: theme.text.muted, flexShrink: 0 }}>
              Pick a transformer in the pipeline to edit configuration.
            </div>
          : null}

          {monacoIsCustom && selectedConfig ?
            <TransformerCodeErrorOverlay
              compileError={displayedCompileError}
              runtimeError={displayedRuntime}
              runtimeActive={runtimeActive}
              formatRuntimeClipboard={formatCustomRuntimeErrorClipboard}
              onRuntimeContextMenu={handleRuntimeErrorContextMenu}
            />
          : null}

          {watchOpen &&
          monacoIsCustom &&
          selectedConfig &&
          selectedEntityIds.length === 1 &&
          codeColumnRef.current ?
            <TransformerWatchPanel
              entityId={selectedEntityIds[0]!}
              configStackIndex={selectedSortedIndex}
              portalTarget={codeColumnRef.current}
              onClose={() => setWatchOpen(false)}
            />
          : null}
        </div>

        {docsOpen ?
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize documentation column"
              data-testid="custom-transformer-code-popout-docs-split"
              onMouseDown={handleDocsSplitMouseDown}
              style={{
                flexShrink: 0,
                width: POPOUT_DOCS_SPLIT_HANDLE_PX,
                alignSelf: 'stretch',
                cursor: 'ew-resize',
                background: theme.border.default,
                borderRadius: 2,
                margin: '4px 0',
              }}
            />
            <div
              ref={docsContainerRef}
              style={{
                flex: docsWidthPx > 0 ? 'none' : '1 1 40%',
                width: docsWidthPx > 0 ? docsWidthPx : undefined,
                minWidth: POPOUT_DOCS_SPLIT_MIN_PX,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: theme.bg.panel,
                border: `1px solid ${theme.border.default}`,
                borderRadius: 8,
                padding: 16,
              }}
            >
              <TransformerDocsContent forceCollapsedChapters={docsAreaWidth < 500} />
            </div>
          </>
        : null}
      </div>

      {templateDialogOpen && selectedPreset && supportsTemplatePickers(selectedPreset.type) ?
        <TransformerTemplateDialog
          isOpen={templateDialogOpen}
          onClose={() => setTemplateDialogOpen(false)}
          transformerType={selectedPreset.type as PresetTransformerType}
          currentConfig={selectedPreset}
          onLoadTemplate={(config) => {
            const next = list.map((t, i) => (i === selectedSortedIndex ? config : t))
            handleCommitStacks(sortAndSyncPriorities(next))
            setTemplateDialogOpen(false)
          }}
        />
      : null}

      {savePipeDialogOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: theme.bg.panel,
              padding: 20,
              borderRadius: 8,
              border: `1px solid ${theme.border.default}`,
              width: 300,
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Save as Pipe</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Pipe Name</label>
              <input
                autoFocus
                value={savePipeName}
                onChange={(e) => setSavePipeName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 4,
                  background: theme.bg.surface,
                  border: `1px solid ${theme.border.default}`,
                  color: theme.text.primary,
                }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Mode</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={savePipeMode === 'linked'}
                    onChange={() => setSavePipeMode('linked')}
                  />
                  Linked
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" checked={savePipeMode === 'copy'} onChange={() => setSavePipeMode('copy')} />
                  Copy
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setSavePipeDialogOpen(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  background: 'none',
                  border: 'none',
                  color: theme.text.muted,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAsPipe}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  background: theme.accent,
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {addPipeModeDialogOpen && selectedPipeForAdd && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: theme.bg.panel,
              padding: 20,
              borderRadius: 8,
              border: `1px solid ${theme.border.default}`,
              width: 300,
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Add Pipe: {selectedPipeForAdd.name}</h3>
            <p style={{ fontSize: 12, color: theme.text.muted, marginBottom: 16 }}>
              Choose how to assign this pipe.
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <button
                onClick={() => handleAddPipe(selectedPipeForAdd, 'linked')}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 6,
                  border: `1px solid ${theme.accent}`,
                  background: 'rgba(0,153,255,0.1)',
                  color: theme.accent,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 600 }}>Link</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>Shared edits</div>
              </button>
              <button
                onClick={() => handleAddPipe(selectedPipeForAdd, 'copy')}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 6,
                  border: `1px solid ${theme.border.default}`,
                  background: theme.bg.surface,
                  color: theme.text.primary,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 600 }}>Copy</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>Independent</div>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAddPipeModeDialogOpen(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  background: 'none',
                  border: 'none',
                  color: theme.text.muted,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </CopyableArea>
  )
}
