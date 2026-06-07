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
  type RefObject,
} from 'react'
import CopyableArea from '@/components/CopyableArea'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import TransformerTemplateDialog from '@/components/TransformerTemplateDialog'
import type { TransformerConfig, PresetTransformerType, TransformerDef } from '@/types/transformer'
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
} from '@/utils/commitTransformerConfigsToWorld'
import { usePipeNavController } from '@/hooks/usePipeNavController'
import { findUngroupedStageIds } from '@/utils/pipeNavResolve'
import { wrapUngroupedStagesIntoStackPipe } from '@/utils/pipeNavMutations'
import { nextFreeDefaultPipeName } from '@/utils/allocatePipeId'
import TransformerPipeNavSidebar, {
  readPipeNavOpen,
  writePipeNavOpen,
} from '@/components/workspace/pipeNav/TransformerPipeNavSidebar'
import PipeFocusedStrip from '@/components/workspace/pipeNav/PipeFocusedStrip'
import PipeNavDialogs from '@/components/workspace/pipeNav/PipeNavDialogs'
import PipeNavOpenToggle from '@/components/workspace/pipeNav/PipeNavOpenToggle'
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
import { uiLogger } from '@/utils/uiLogger'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import WorkspaceGlobalTransformerPanel from '@/components/workspace/WorkspaceGlobalTransformerPanel'
import TransformerCodeErrorOverlay from '@/components/workspace/TransformerCodeErrorOverlay'
import TransformerWatchPanel from '@/components/workspace/TransformerWatchPanel'
import { workspaceMonacoToolbarButtonStyle } from '@/components/workspace/WorkspaceMonacoSlot'
import EntitySearchPicker from '@/components/entitySearch/EntitySearchPicker'
import type { WorkspaceMonacoEditorChrome } from '@/types/workspaceMonacoChrome'
import { useDebouncedCompileErrorDisplay } from '@/hooks/useDebouncedCompileErrorDisplay'

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
  onMergedPipeParamSync?: (world: RennWorld, entityIds: string[]) => void
  setMonacoPayload: (payload: WorkspaceMonacoPayload) => void
  /** Registers watch and other editor-toolbar controls on the shared Monaco slot. */
  setMonacoEditorChrome?: (chrome: WorkspaceMonacoEditorChrome | null) => void
  /** Editor pane ref (left of vertical toolbar) for floating watch panel portal. */
  monacoEditorAreaRef?: RefObject<HTMLDivElement | null>
  /** Bumps when the editor pane ref attaches so watch overlay can portal in. */
  monacoEditorAreaEpoch?: number
  /** Host injects shared `TransformerCustomCodeEditor`; tab positions it inside the split layout. */
  monacoSlot: ReactNode
  /** IndexedDB global library (Organize → Global → Edit). */
  globalLibrary?: GlobalBehaviorLibrary
  onGlobalLibraryChange?: (next: GlobalBehaviorLibrary) => void
  /** Keeps `entry.itemId` in sync when the user picks a pipeline stage (survives close/reopen). */
  onEntryChange?: (next: WorkspaceTarget) => void
  entityWorkHistory?: string[]
  onSelectEntity?: (id: string) => void
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
  onMergedPipeParamSync,
  setMonacoPayload,
  setMonacoEditorChrome,
  monacoEditorAreaRef,
  monacoEditorAreaEpoch = 0,
  monacoSlot,
  onEntryChange,
  entityWorkHistory = [],
  onSelectEntity,
}: WorkspaceTransformersTabProps) {
  const undo = useEditorUndo()
  const { openMenu } = useCopyMenu()
  const floatingDrawerPortalRef = useRef<HTMLDivElement>(null)
  const [floatingDrawerPortalEpoch, setFloatingDrawerPortalEpoch] = useState(0)

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

  const singleEntity = entities.length === 1 ? entities[0] : undefined
  const usePipeNav = Boolean(singleEntity)
  const [pipeNavOpen, setPipeNavOpen] = useState(readPipeNavOpen)
  const setPipeNavSidebarOpen = useCallback((open: boolean) => {
    setPipeNavOpen(open)
    writePipeNavOpen(open)
  }, [])

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
              transformerPipeStack: undefined,
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

  const [watchOpen, setWatchOpen] = useState(false)

  /** Custom code Monaco state */
  const [codeDraft, setCodeDraft] = useState('')
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

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

  const pipeNav = usePipeNavController(
    world,
    singleEntity ?? ({ id: '', transformers: [] } as (typeof entities)[0]),
    entry,
    onWorldChange,
    onEntryChange,
    handleCommitStacks,
    onMergedPipeParamSync,
  )

  const editorStageIds =
    usePipeNav && pipeNav.view?.mode !== 'pipe_siblings' ? pipeNav.stageData.ids : transformerIds
  const editorStageConfigs =
    usePipeNav && pipeNav.view?.mode !== 'pipe_siblings' ? pipeNav.stageData.configs : list

  const selectedSortedIndex = useMemo(() => {
    if (!selectedId) return 0
    const idx = editorStageIds.indexOf(selectedId)
    return idx >= 0 ? idx : 0
  }, [selectedId, editorStageIds])

  const selectedConfig = editorStageConfigs[selectedSortedIndex] ?? null
  const selectedPreset = selectedConfig && isPresetTransformerType(selectedConfig.type) ? selectedConfig : null

  const ungroupedStageIds = useMemo(() => {
    if (!singleEntity) return []
    return findUngroupedStageIds(world, singleEntity)
  }, [singleEntity, world])

  const handleWrapUngroupedStages = useCallback(() => {
    if (!singleEntity || ungroupedStageIds.length === 0) return
    undo?.pushBeforeEdit()
    const name = nextFreeDefaultPipeName(world.transformerPipes)
    const nextWorld = wrapUngroupedStagesIntoStackPipe(world, singleEntity.id, name)
    onWorldChange(nextWorld)
  }, [singleEntity, ungroupedStageIds.length, world, undo, onWorldChange])

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
  const monacoPlaceholderTarget = useMemo(() => {
    if (selectedEntityIds.length === 0) return null
    if (singleEntity && usePipeNav) return pipeNav.focusedTitle
    if (entities.length === 1) return entities[0]!.name ?? entities[0]!.id
    return 'the pipeline'
  }, [selectedEntityIds.length, singleEntity, usePipeNav, pipeNav.focusedTitle, entities])

  const monacoPayload = useMemo(() => {
    if (monacoIsCustom) {
      return {
        kind: 'transformer-ts' as const,
        value: codeDraft,
        onChange: handleCodeChange,
        disabled: anyLocked || transformersMixed || selectedEntityIds.length === 0,
        refreshKey: 0,
        beforeRefresh: flushPendingCode,
      }
    }
    const placeholderValue =
      monacoPlaceholderTarget == null
        ? '// Select an entity in the builder to edit transformer code.\n'
        : `// Add a custom transformer to ${monacoPlaceholderTarget} using the + button.\n`
    return {
      kind: 'placeholder' as const,
      value: placeholderValue,
      onChange: () => {},
      disabled: true,
      refreshKey: 0,
      beforeRefresh: flushPendingCode,
    }
  }, [
    codeDraft,
    handleCodeChange,
    monacoIsCustom,
    monacoPlaceholderTarget,
    anyLocked,
    transformersMixed,
    selectedEntityIds.length,
    flushPendingCode,
  ])

  useLayoutEffect(() => {
    setMonacoPayload(monacoPayload)
  }, [monacoPayload, setMonacoPayload])

  const watchAvailable = monacoIsCustom && selectedEntityIds.length === 1 && selectedConfig != null
  const watchPortalTarget = floatingDrawerPortalRef.current

  useLayoutEffect(() => {
    if (floatingDrawerPortalRef.current) {
      setFloatingDrawerPortalEpoch((n) => n + 1)
    }
  }, [selectedEntityIds.length])

  useEffect(() => {
    if (!watchAvailable) setWatchOpen(false)
  }, [watchAvailable])

  useLayoutEffect(() => {
    if (!setMonacoEditorChrome) return

    const watchTitle =
      !watchAvailable
        ? 'Watch panel — select a custom transformer on a single entity'
        : watchOpen
          ? 'Hide watch panel'
          : 'Show watch panel'

    const watchToggle = (
      <button
        type="button"
        title={watchTitle}
        aria-pressed={watchOpen}
        aria-disabled={!watchAvailable}
        data-testid="workspace-transformer-watch-toggle"
        disabled={!watchAvailable}
        onClick={() => {
          if (!watchAvailable) return
          setWatchOpen((open) => !open)
        }}
        style={{
          ...workspaceMonacoToolbarButtonStyle,
          opacity: !watchAvailable ? 0.45 : watchOpen ? 1 : 0.8,
          color: watchOpen && watchAvailable ? theme.accent : theme.text.muted,
          cursor: !watchAvailable ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!watchAvailable) return
          e.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          if (!watchAvailable) return
          e.currentTarget.style.opacity = watchOpen ? '1' : '0.8'
        }}
      >
        {EntityPanelIcons.eye}
      </button>
    )

    const watchOverlay =
      watchOpen && watchAvailable && watchPortalTarget ?
        <TransformerWatchPanel
          entityId={selectedEntityIds[0]!}
          configStackIndex={selectedSortedIndex}
          portalTarget={watchPortalTarget}
          onClose={() => setWatchOpen(false)}
        />
      : null

    setMonacoEditorChrome({
      toolbarExtra: watchToggle,
      overlay: watchOverlay,
    })
  }, [
    setMonacoEditorChrome,
    watchAvailable,
    watchOpen,
    watchPortalTarget,
    selectedEntityIds[0],
    selectedSortedIndex,
    selectedId,
    monacoEditorAreaEpoch,
    floatingDrawerPortalEpoch,
  ])

  useEffect(() => {
    return () => setMonacoEditorChrome?.(null)
  }, [setMonacoEditorChrome])

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

  if (transformersMixed && selectedEntityIds.length > 0) {
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
      {selectedEntityIds.length === 0 ?
        <div style={{ flexShrink: 0, padding: '0 0 12px', borderBottom: `1px solid ${theme.border.default}` }}>
          <EntitySearchPicker
            entities={world.entities}
            entityWorkHistory={entityWorkHistory}
            onSelectEntity={(id) => onSelectEntity?.(id)}
            variant="panel"
            autoFocus
            testId="workspace-transformers-entity-search"
          />
        </div>
      : null}
      {selectedEntityIds.length === 0 ?
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {monacoSlot}
        </div>
      : null}
      {selectedEntityIds.length === 0 ? null : (
      <div
        ref={floatingDrawerPortalRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
      {usePipeNav && singleEntity && pipeNav.view && pipeNavOpen ?
        <TransformerPipeNavSidebar
          world={world}
          entity={singleEntity}
          focusPath={pipeNav.focus.path}
          selectedIndex={pipeNav.focus.selectedSiblingIndex}
          focusedPipeName={pipeNav.focusedTitle}
          canGoUp={pipeNav.view.canGoUp}
          siblingCount={pipeNav.view.siblingCount}
          open={pipeNavOpen}
          onOpenChange={setPipeNavSidebarOpen}
          onPathChange={(path, index, stageId) => {
            pipeNav.setPath(path, index)
            if (stageId) changeSelectedIdWithFlush(stageId)
          }}
          onGoUp={pipeNav.goUp}
          onGoLeft={pipeNav.goLeft}
          onGoRight={pipeNav.goRight}
          onRenamePipe={pipeNav.focusedPipeId ? pipeNav.handleRename : undefined}
          onTreeDelete={pipeNav.handleTreeDelete}
          onTreeContext={pipeNav.handleTreeContext}
          onTreeDrop={pipeNav.handleTreeDrop}
          drawerPortalTarget={floatingDrawerPortalRef}
          stackIndexForPipeId={pipeNav.stackIndexForPipeId}
          onPipeControlToggle={pipeNav.togglePipeEnabled}
          onPipeParamChange={pipeNav.updatePipeParam}
          onPipeParamsReplace={pipeNav.replacePipeParams}
          onDecouplePipeBinding={pipeNav.decouplePipeBinding}
        />
      : null}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
      <div
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
            {usePipeNav && !pipeNavOpen ?
              <PipeNavOpenToggle onClick={() => setPipeNavSidebarOpen(true)} />
            : null}
            {usePipeNav && singleEntity && pipeNav.view ?
              <PipeFocusedStrip
                world={world}
                entity={singleEntity}
                view={pipeNav.view}
                focusPath={pipeNav.focus.path}
                depth={pipeNav.focus.path.length}
                selectedIndex={pipeNav.focus.selectedSiblingIndex}
                stageConfigs={pipeNav.stageData.configs}
                stageIds={pipeNav.stageData.ids}
                registryEntityId={singleEntity.id}
                liveTraceSteps={liveTraceSteps ?? null}
                drawerPortalTarget={floatingDrawerPortalRef}
                onCommitStages={pipeNav.handleCommitStagesWrapped}
                onSelectStageId={changeSelectedIdWithFlush}
                onSelectPipeIndex={pipeNav.selectSibling}
                onDrillIntoPipe={pipeNav.drillInto}
                onCreatePipe={pipeNav.handleCreatePipe}
                onAddChildPipe={pipeNav.handleAddChildPipe}
                onAddExistingPipe={pipeNav.handleAddExistingPipe}
                stackIndexForPipeId={pipeNav.stackIndexForPipeId}
                onPipeControlToggle={pipeNav.togglePipeEnabled}
                onPipeParamChange={pipeNav.updatePipeParam}
                onPipeParamsReplace={pipeNav.replacePipeParams}
                onDecouplePipeBinding={pipeNav.decouplePipeBinding}
                onMakeUnique={handleMakeUniqueTransformer}
                usageCounts={usageCounts}
                selectedStageId={selectedId}
                cardErrorsByStackIndex={cardErrorsByStackIndex}
              />
            : <TransformerHorizontalPipeline
                transformers={list}
                transformerIds={transformerIds}
                registryEntityId={entityIdsForEdit.length === 1 ? entityIdsForEdit[0] : undefined}
                liveTraceSteps={liveTraceSteps ?? null}
                drawerPortalTarget={floatingDrawerPortalRef}
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
            }
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
            title="Copy transformer pipe (JSON)"
            onClick={handleCopyPipe}
            style={{
              ...entityPanelIconButtonStyle,
              opacity: 0.85,
            }}
          >
            {EntityPanelIcons.clone}
          </button>
        </div>
      </div>

      {usePipeNav && singleEntity && ungroupedStageIds.length > 0 ?
        <div
          data-testid="pipe-ungrouped-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 10px',
            margin: '0 0 4px',
            borderRadius: 6,
            border: `1px solid ${theme.pipeNav.accentMuted}`,
            background: theme.pipeNav.levelBg[0],
            fontSize: 11,
            color: theme.text.secondary,
            flexShrink: 0,
          }}
        >
          <span>
            {ungroupedStageIds.length} ungrouped stage{ungroupedStageIds.length !== 1 ? 's' : ''} remain outside the
            pipe stack.
          </span>
          <button
            type="button"
            onClick={handleWrapUngroupedStages}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: `1px solid ${theme.pipeNav.accentBorder}`,
              background: theme.pipeNav.treeSelected,
              color: theme.pipeNav.accent,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Wrap into pipe
          </button>
        </div>
      : null}

      <div
        ref={codeColumnRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
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

      {usePipeNav ?
        <PipeNavDialogs
          nameDialog={pipeNav.nameDialog}
          onNameChange={(n) => pipeNav.setNameDialog((d) => (d ? { ...d, name: n } : null))}
          onNameConfirm={pipeNav.confirmNameDialog}
          onNameCancel={() => pipeNav.setNameDialog(null)}
        />
      : null}
      </div>
      </div>
      )}
    </CopyableArea>
  )
}
