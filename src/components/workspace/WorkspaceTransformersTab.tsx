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
import TransformerFieldReference from '@/components/TransformerFieldReference'
import { TransformerDocsContent } from '@/components/TransformerDocs'
import type { TransformerConfig, PresetTransformerType } from '@/types/transformer'
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
  commitTransformerConfigsToWorld,
} from '@/utils/commitTransformerConfigsToWorld'
import {
  subscribeCustomTransformerRuntimeError,
  getCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'
import { mergeTransformers } from '@/utils/entityInspectorMerge'
import { TransformerHorizontalPipeline } from '@/components/workspace/TransformerPipelineHorizontal'
import { clamp } from '@/utils/numberUtils'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import WorkspaceGlobalTransformerPanel from '@/components/workspace/WorkspaceGlobalTransformerPanel'

/** Workspace horizontal split (code ↔ docs). */
const POPOUT_DOCS_SPLIT_MIN_PX = 300
const POPOUT_DOCS_SPLIT_CODE_MIN_PX = 260
const POPOUT_DOCS_SPLIT_HANDLE_PX = 6
const POPOUT_DOCS_WIDTH_STORAGE_KEY = 'rennWorkspaceTransformerDocsWidthPx'

/** Preset toolbar sits in reserved left gutter; pipeline draws to the right (stage cards visually layer above). */
const PIPELINE_PRESET_TOOLS_GUTTER_PAIR_PX = 76
const PIPELINE_PRESET_TOOLS_GUTTER_SINGLE_PX = 52

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
}): string {
  let out = snapshot.message
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
  onEntityTransformersChange?: (entityIds: string[], transformers: TransformerConfig[]) => void
  setMonacoPayload: (payload: WorkspaceMonacoPayload) => void
  /** Host injects shared `TransformerCustomCodeEditor`; tab positions it inside the split layout. */
  monacoSlot: ReactNode
  onResetPoseToSavedWorld?: (entityIds: string[]) => void
  canResetPoseToSaved?: boolean
  resetPoseTitle?: string
  /** IndexedDB global library (Organize → Global → Edit). */
  globalLibrary?: GlobalBehaviorLibrary
  onGlobalLibraryChange?: (next: GlobalBehaviorLibrary) => void
}

/** Transformers Workspace body: pipeline strip, shared Monaco bindings, preset/custom detail panels. */
export default function WorkspaceTransformersTab(props: WorkspaceTransformersTabProps) {
  if (
    props.entry?.itemSource === 'global' &&
    props.entry.itemId &&
    props.globalLibrary &&
    props.onGlobalLibraryChange
  ) {
    const gid = props.entry.itemId
    return (
      <WorkspaceGlobalTransformerPanel
        itemId={gid}
        def={props.globalLibrary.transformers[gid]}
        onDefChange={(next) => {
          props.onGlobalLibraryChange!({
            ...props.globalLibrary!,
            transformers: { ...props.globalLibrary!.transformers, [gid]: next },
          })
        }}
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
  }, [selectedEntityIds, world.entities])

  const entityIdsForEdit = entities.map((e) => e.id)
  const entityIdsFingerprint = entityIdsForEdit.join(',')
  const mergedIds = mergeTransformers(entities)
  const anyLocked = entities.some((e) => e.locked)
  const transformersMixed = mergedIds === null
  const worldTf = world.transformers ?? {}

  const sortedPairs = useMemo(() => {
    if (mergedIds == null) return null
    const raw = mergedIds
      .map((id) => ({ id, config: worldTf[id] }))
      .filter((x): x is { id: string; config: TransformerConfig } => x.config != null)
    raw.sort((a, b) => (a.config.priority ?? 10) - (b.config.priority ?? 10))
    return raw
  }, [mergedIds, worldTf])

  const list = sortedPairs?.map((p) => p.config) ?? []

  const [selectedSortedIndex, setSelectedSortedIndex] = useState(0)

  /** Apply entry anchor whenever workspace opens / entry changes while open. */
  useEffect(() => {
    if (!workspaceOpen || !sortedPairs?.length || !entry?.itemId) return
    if (entry.tab !== 'transformers') return
    const idx = sortedPairs.findIndex((p) => p.id === entry.itemId)
    if (idx >= 0) setSelectedSortedIndex(idx)
  }, [workspaceOpen, entry?.itemId, entry?.tab, sortedPairs])

  const handleCommitStacks = useCallback(
    (nextConfigs: TransformerConfig[]) => {
      if (transformersMixed) return
      if (onEntityTransformersChange) {
        onEntityTransformersChange(entityIdsForEdit, nextConfigs)
      } else {
        let nextWorld = world
        for (const entityId of entityIdsForEdit) {
          nextWorld = commitTransformerConfigsToWorld(nextWorld, entityId, nextConfigs)
        }
        onWorldChange(nextWorld)
      }
    },
    [entityIdsFingerprint, onEntityTransformersChange, onWorldChange, transformersMixed, world],
  )

  const selectedConfig = list[selectedSortedIndex] ?? null
  const selectedPreset = selectedConfig && isPresetTransformerType(selectedConfig.type) ? selectedConfig : null

  const [docsOpen, setDocsOpen] = useState(false)
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
  const [fieldRefOpen, setFieldRefOpen] = useState(false)
  const [monacoRemountKey, setMonacoRemountKey] = useState(0)

  const debounceTimerRef = useRef<number | null>(null)
  const listRef = useRef(list)
  listRef.current = list
  const selectedSortedIndexRef = useRef(selectedSortedIndex)
  selectedSortedIndexRef.current = selectedSortedIndex
  const codeDraftRef = useRef(codeDraft)
  codeDraftRef.current = codeDraft
  const lastCommittedCodeRef = useRef('')
  const onCommitStacksRef = useRef(handleCommitStacks)
  onCommitStacksRef.current = handleCommitStacks
  const codeUndoPrimedRef = useRef(false)

  const flushPendingCode = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    const idx = selectedSortedIndexRef.current
    const cur = listRef.current
    if (idx < 0 || cur[idx]?.type !== 'custom') return
    const text = codeDraftRef.current
    const prevEffective = effectiveCustomTransformerCode(cur[idx]!)
    if (text === prevEffective) return
    lastCommittedCodeRef.current = text
    onCommitStacksRef.current(syncPriorities(cur.map((t, i) => (i === idx ? { ...t, code: text } : t))))
  }, [])

  const runtimeSnapshot = useSyncExternalStore(
    subscribeCustomTransformerRuntimeError,
    getCustomTransformerRuntimeError,
    () => null,
  )

  const runtimeErrorForSelection = useMemo(() => {
    if (runtimeSnapshot == null) return null
    if (!selectedEntityIds.includes(runtimeSnapshot.entityId)) return null
    if (runtimeSnapshot.configStackIndex !== selectedSortedIndex) return null
    return {
      message: runtimeSnapshot.message,
      stack: runtimeSnapshot.stack,
      code: runtimeSnapshot.code,
    }
  }, [runtimeSnapshot, selectedEntityIds, selectedSortedIndex])

  const selectedCustomCompileKey =
    selectedConfig?.type === 'custom'
      ? `custom:p${selectedConfig.priority ?? 10}`
      : 'custom'

  const compileError = useMemo(() => {
    if (selectedConfig?.type !== 'custom') return null
    return validateCustomTransformerSource(codeDraft, selectedCustomCompileKey)
  }, [selectedConfig?.type, codeDraft, selectedCustomCompileKey])

  const syncCodeKey =
    selectedConfig?.type === 'custom'
      ? `${selectedSortedIndex}:${selectedConfig.code ?? ''}`
      : ''

  useEffect(() => {
    if (selectedConfig?.type !== 'custom') {
      setCodeDraft('')
      return
    }
    const worldCode = effectiveCustomTransformerCode(selectedConfig)
    if (worldCode !== lastCommittedCodeRef.current) {
      setCodeDraft(worldCode)
      lastCommittedCodeRef.current = worldCode
    }
    codeUndoPrimedRef.current = false
  }, [syncCodeKey, selectedConfig, selectedSortedIndex])

  /** Strip selection → custom Monaco */
  useEffect(() => {
    if (sortedPairs != null && selectedSortedIndex >= sortedPairs.length) {
      setSelectedSortedIndex(Math.max(0, sortedPairs.length - 1))
    }
  }, [sortedPairs, selectedSortedIndex])

  const scheduleCodeCommit = useCallback((text: string) => {
    if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null
      const idx = selectedSortedIndexRef.current
      const cur = listRef.current
      if (cur[idx]?.type !== 'custom') return
      lastCommittedCodeRef.current = text
      onCommitStacksRef.current(syncPriorities(cur.map((t, i) => (i === idx ? { ...t, code: text } : t))))
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

  const changeSelectedIndexWithFlush = useCallback(
    (nextIdx: number) => {
      flushPendingCode()
      setSelectedSortedIndex(nextIdx)
    },
    [flushPendingCode],
  )

  useEffect(() => {
    return () => {
      flushPendingCode()
    }
  }, [flushPendingCode])

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

  const compileErrorPanel = compileError ? (
    <div
      data-testid="workspace-transformer-compile-error"
      style={{
        marginTop: 8,
        padding: '8px 10px',
        fontSize: 12,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: theme.text.error,
        border: `1px solid ${theme.border.error}`,
        borderRadius: 6,
        background: theme.bg.errorFallback,
        flexShrink: 0,
      }}
    >
      {compileError}
    </div>
  ) : null

  const handleRuntimeErrorContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      if (runtimeErrorForSelection == null) return
      e.preventDefault()
      e.stopPropagation()
      openMenu(e, () => formatCustomRuntimeErrorClipboard(runtimeErrorForSelection))
    },
    [openMenu, runtimeErrorForSelection],
  )

  const runtimeErrorPanel =
    runtimeErrorForSelection ?
      <div
        data-testid="workspace-transformer-runtime-error"
        onContextMenu={handleRuntimeErrorContextMenu}
        style={{
          marginTop: 8,
          padding: '8px 10px',
          fontSize: 12,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: theme.text.warning,
          border: `1px solid ${theme.text.warning}`,
          borderRadius: 6,
          background: theme.bg.sectionMuted,
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11 }}>Runtime error</div>
        <div style={{ marginBottom: 4 }}>{runtimeErrorForSelection.message}</div>
        {runtimeErrorForSelection.stack ? (
          <pre style={{ margin: '6px 0 0', fontSize: 11, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }}>
            {runtimeErrorForSelection.stack}
          </pre>
        ) : null}
      </div>
    : null

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
              selectedPreset ?
                supportsTemplatePickers(selectedPreset.type) ?
                  PIPELINE_PRESET_TOOLS_GUTTER_PAIR_PX
                : PIPELINE_PRESET_TOOLS_GUTTER_SINGLE_PX
              : 0,
          }}
        >
          {selectedPreset ?
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
              {supportsTemplatePickers(selectedPreset.type) ?
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
              : null}
              <button
                type="button"
                data-testid="workspace-preset-field-reference"
                onClick={() => setFieldRefOpen((o) => !o)}
                disabled={anyLocked}
                title="Field reference"
                aria-pressed={fieldRefOpen}
                style={presetBehindPipelineChipStyle(fieldRefOpen, anyLocked)}
              >
                {EntityPanelIcons.document}
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
            }}
          >
            <TransformerHorizontalPipeline
              transformers={list}
              liveTraceSteps={liveTraceSteps ?? null}
              headerRef={headerRef}
              onCommit={handleCommitStacks}
              onSelectCode={changeSelectedIndexWithFlush}
              selectedListIndex={selectedSortedIndex}
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
          style={{
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
            {selectedPreset && fieldRefOpen && isPresetTransformerType(selectedPreset.type) ? (
              <div style={{ flexShrink: 0, marginBottom: 8 }}>
                <TransformerFieldReference transformerType={selectedPreset.type} />
              </div>
            ) : null}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {monacoSlot}
            </div>
          </div>

          {monacoIsCustom && selectedConfig ? (
            <>
              {compileErrorPanel}
              {runtimeErrorPanel}
            </>
          ) : !selectedPreset ? (
            <div style={{ padding: 12, color: theme.text.muted, flexShrink: 0 }}>
              Pick a transformer in the pipeline to edit configuration.
            </div>
          ) : null}
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
    </CopyableArea>
  )
}
