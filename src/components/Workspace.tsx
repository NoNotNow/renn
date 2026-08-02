import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import EntitySearchPicker from '@/components/entitySearch/EntitySearchPicker'
import type { WorkspaceMonacoEditorChrome } from '@/types/workspaceMonacoChrome'
import { createPortal } from 'react-dom'
import type { editor } from 'monaco-editor'
import type { RennWorld } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import type {
  WorkspaceMonacoPayload,
  WorkspaceShellTabId,
  WorkspaceTarget,
  WorkspaceOrganizeKind,
  WorkspaceOrganizeScope,
} from '@/types/workspace'
import type { TransformerTraceStep } from '@/transformers/transformerTrace'
import WorkspaceTransformersTab from '@/components/workspace/WorkspaceTransformersTab'
import WorkspaceScriptsTab from '@/components/workspace/WorkspaceScriptsTab'
import WorkspaceOrganizeTab from '@/components/workspace/WorkspaceOrganizeTab'
import WorkspaceDocsSplit from '@/components/workspace/WorkspaceDocsSplit'
import TransformerCustomCodeEditor from '@/components/TransformerCustomCodeEditor'
import WorkspaceMonacoSlot from '@/components/workspace/WorkspaceMonacoSlot'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { entityPanelIconButtonStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'
import { addFullscreenChangeListener, getFullscreenElement } from '@/utils/fullscreenApi'
import { defaultPersistence } from '@/persistence/indexedDb'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { WorkspaceMonacoContext } from '@/contexts/WorkspaceMonacoContext'
import {
  WORKSPACE_EDITOR_OPEN_REFRESH_MS,
  isWorkspaceEditorInitialRefreshDone,
  markWorkspaceEditorInitialRefreshDone,
} from '@/components/workspaceMonacoSession'
import {
  loadWorkspaceEditorViewState,
  saveWorkspaceEditorViewState,
  workspaceEditorItemKey,
} from '@/utils/workspaceEditorViewState'

export type { WorkspaceMonacoPayload, WorkspaceTarget } from '@/types/workspace'

function useWorkspacePortalRoot(): Element {
  const [target, setTarget] = useState<Element>(() => getFullscreenElement() ?? document.body)

  useEffect(() => {
    const sync = () => setTarget(getFullscreenElement() ?? document.body)
    const remove = addFullscreenChangeListener(sync)
    sync()
    return remove
  }, [])

  return target
}

function useBuilderHeaderBottomInsetPx(active: boolean): number {
  const [inset, setInset] = useState(0)

  useLayoutEffect(() => {
    if (!active || typeof document === 'undefined') return
    const el = document.getElementById('builder-app-header')
    if (!el) {
      setInset(0)
      return
    }
    const update = (): void => {
      const bot = el.getBoundingClientRect().bottom
      setInset(Number.isFinite(bot) && bot > 0 ? bot : 0)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [active])

  return inset
}

const WORKSPACE_TAB_IDS = ['transformers', 'scripts', 'organize'] as const satisfies readonly WorkspaceShellTabId[]

function initialWorkspaceShellTab(
  panelOpen: boolean,
  workspaceEntry: WorkspaceTarget | null | undefined,
): WorkspaceShellTabId {
  if (!panelOpen) return 'transformers'
  const t = workspaceEntry?.tab
  if (t === 'scripts' || t === 'organize') return t
  return 'transformers'
}

const IDLE_MONACO: WorkspaceMonacoPayload = {
  kind: 'placeholder',
  value: '// Organize tab — Monaco idle.\n',
  disabled: true,
  onChange: () => {},
  refreshKey: 0,
}

/** Workspace shell background opacity steps (cycles on header toggle). */
const WORKSPACE_BACKGROUND_OPACITY_STEPS = [0.2, 0.4, 0.6, 1] as const

function workspaceShellBackground(opacity: number): { body: string; header: string } {
  if (opacity >= 1) {
    return { body: theme.bg.panelAlt, header: theme.bg.panel }
  }
  return {
    body: `rgba(26, 26, 26, ${opacity})`,
    header: `rgba(22, 24, 30, ${opacity})`,
  }
}

function workspaceBackgroundOpacityLabel(opacity: number): string {
  return `${Math.round(opacity * 100)}%`
}

export interface WorkspaceProps {
  open: boolean
  onClose: () => void
  /** Applied when `open` transitions to true (latest anchor from inspector / opener). */
  entry?: WorkspaceTarget | null
  world: RennWorld
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
  /** When multi-entity merges use the parent-provided transformer commit path (builder wiring). */
  onEntityTransformersChange?: (
    entityIds: string[],
    transformers: TransformerConfig[],
    orderedRegistryIds?: string[],
    isShared?: boolean,
  ) => void
  /** Live runtime sync after pipe param edits (merged upstream + stage params). */
  onMergedPipeParamSync?: (world: RennWorld, entityIds: string[]) => void
  /** Builder live transformer trace (`null` disables live IN/OUT in the pipeline strip). */
  liveTransformerTraceSteps?: TransformerTraceStep[] | null
  /** Same hook as Workspace — collapse side drawers when opening. */
  onWorkspaceOpenSideEffects?: () => void
  /** Keeps anchor entry in sync when switching shell tabs or navigating from Organize → editor. */
  onEntryChange?: (next: WorkspaceTarget) => void
  onSelectEntity?: (id: string) => void
  /** MRU entity ids for EntitySearchPicker. */
  entityWorkHistory?: string[]
  /** Whether the game is currently frozen (physics + scripts paused). */
  gameFrozen?: boolean
  /** Toggle game freeze on/off. */
  onToggleGameFrozen?: () => void
  /** Reset all (unlocked) entities to their saved world positions. */
  onResetAllEntities?: () => void
}

function workspaceTabStyle(active: boolean): CSSProperties {
  return {
    flex: '0 0 auto',
    margin: 0,
    padding: '8px 12px 7px',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    letterSpacing: '0.02em',
    border: 'none',
    borderBottom: `2px solid ${active ? theme.accent : 'transparent'}`,
    marginBottom: -1,
    borderRadius: '6px 6px 0 0',
    background: active ? 'rgba(43, 53, 80, 0.28)' : 'transparent',
    color: active ? theme.text.primary : theme.text.secondary,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'color 0.12s ease, border-color 0.12s ease, background 0.12s ease',
  }
}

export default function Workspace({
  open,
  onClose,
  entry,
  world,
  selectedEntityIds,
  onWorldChange,
  onEntityTransformersChange,
  onMergedPipeParamSync,
  liveTransformerTraceSteps = null,
  onWorkspaceOpenSideEffects,
  onEntryChange,
  onSelectEntity,
  entityWorkHistory = [],
  gameFrozen = false,
  onToggleGameFrozen,
  onResetAllEntities,
}: WorkspaceProps) {
  const portalTarget = useWorkspacePortalRoot()
  const builderHeaderBottomInsetPx = useBuilderHeaderBottomInsetPx(open)

  const monacoEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoEditorAreaRef = useRef<HTMLDivElement | null>(null)

  const [activeTab, setActiveTab] = useState<WorkspaceShellTabId>(() =>
    initialWorkspaceShellTab(open, entry),
  )
  const [backgroundOpacityStep, setBackgroundOpacityStep] = useState(0)
  const backgroundOpacity = WORKSPACE_BACKGROUND_OPACITY_STEPS[backgroundOpacityStep]
  const shellBackground = workspaceShellBackground(backgroundOpacity)
  const shellGlass = backgroundOpacity < 1
  const [docsOpen, setDocsOpen] = useState(false)
  const [monacoChrome, setMonacoChrome] = useState<WorkspaceMonacoEditorChrome | null>(null)
  const [monacoEditorAreaEpoch, setMonacoEditorAreaEpoch] = useState(0)
  const [monacoPayload, setMonacoPayload] = useState<WorkspaceMonacoPayload>(IDLE_MONACO)
  const monacoPayloadRef = useRef(monacoPayload)
  monacoPayloadRef.current = monacoPayload
  const [editorOpenRefreshNonce, setEditorOpenRefreshNonce] = useState(0)
  const [manualMonacoRefreshNonce, setManualMonacoRefreshNonce] = useState(0)

  const prevOpenRef = useRef(false)

  const monacoHostVisible = open && (activeTab === 'transformers' || activeTab === 'scripts')

  const editorItemKey = useMemo(() => {
    if (!open || !monacoHostVisible || monacoPayload.kind === 'placeholder') return null
    return workspaceEditorItemKey({
      entityId: entry?.entityId ?? selectedEntityIds[0],
      tab: activeTab,
      itemId: entry?.itemId,
      pipeNavPath: entry?.pipeNavPath,
    })
  }, [
    open,
    monacoHostVisible,
    monacoPayload.kind,
    entry?.entityId,
    entry?.itemId,
    entry?.pipeNavPath,
    selectedEntityIds,
    activeTab,
  ])

  const prevEditorItemKeyRef = useRef<string | null>(null)
  const editorItemKeyRef = useRef<string | null>(null)
  editorItemKeyRef.current = editorItemKey
  /** Ignore scroll/cursor saves briefly after programmatic restore (Monaco emits scroll=0). */
  const suppressViewStateSaveUntilRef = useRef(0)

  const persistEditorViewStateForKey = useCallback((key: string | null, opts?: { force?: boolean }) => {
    if (!opts?.force && performance.now() < suppressViewStateSaveUntilRef.current) return
    const ed = monacoEditorRef.current
    if (!ed || !key) return
    const state = ed.saveViewState()
    if (state) saveWorkspaceEditorViewState(key, state)
  }, [])

  const persistEditorViewState = useCallback(() => {
    persistEditorViewStateForKey(prevEditorItemKeyRef.current, { force: true })
  }, [persistEditorViewStateForKey])

  const restoreEditorViewState = useCallback((ed: editor.IStandaloneCodeEditor, key: string) => {
    const saved = loadWorkspaceEditorViewState(key)
    if (!saved) return
    suppressViewStateSaveUntilRef.current = performance.now() + 400
    ed.restoreViewState(saved)
    const scrollTop = (saved as { scrollTop?: number }).scrollTop
    if (scrollTop != null && scrollTop > 0) {
      ed.setScrollTop(scrollTop)
    }
  }, [])

  const restoreTimersRef = useRef<number[]>([])

  const clearRestoreTimers = useCallback(() => {
    for (const id of restoreTimersRef.current) {
      window.clearTimeout(id)
    }
    restoreTimersRef.current = []
  }, [])

  /** Restore after @monaco-editor/react applies controlled `value` (its sync runs in useEffect). */
  const scheduleRestoreEditorViewState = useCallback(() => {
    clearRestoreTimers()
    const key = editorItemKeyRef.current
    const ed = monacoEditorRef.current
    if (!ed || !key) return

    const restore = (): void => {
      if (editorItemKeyRef.current !== key) return
      restoreEditorViewState(ed, key)
    }

    restore()
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore)
    })
    for (const delayMs of [0, 50, 220, 300]) {
      restoreTimersRef.current.push(window.setTimeout(restore, delayMs))
    }
  }, [clearRestoreTimers, restoreEditorViewState])

  /** Save outgoing item view state before the next item's model/value loads. */
  useLayoutEffect(() => {
    const prevKey = prevEditorItemKeyRef.current
    if (prevKey && prevKey !== editorItemKey) {
      persistEditorViewStateForKey(prevKey, { force: true })
    }
    prevEditorItemKeyRef.current = editorItemKey
  }, [editorItemKey, persistEditorViewStateForKey])

  useEffect(() => {
    if (!open || !editorItemKey) return
    scheduleRestoreEditorViewState()
    return clearRestoreTimers
  }, [open, editorItemKey, monacoPayload.value, scheduleRestoreEditorViewState, clearRestoreTimers])

  useEffect(() => () => clearRestoreTimers(), [clearRestoreTimers])

  useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = open
    if (!open || wasOpen) return
    onWorkspaceOpenSideEffects?.()
  }, [open, onWorkspaceOpenSideEffects])

  /** Remount shared Monaco once per session, 200ms after it first becomes visible (same as Refresh editor). */
  useEffect(() => {
    if (!monacoHostVisible || isWorkspaceEditorInitialRefreshDone()) return
    markWorkspaceEditorInitialRefreshDone()
    const timer = window.setTimeout(() => {
      setEditorOpenRefreshNonce((n) => n + 1)
    }, WORKSPACE_EDITOR_OPEN_REFRESH_MS)
    return () => window.clearTimeout(timer)
  }, [monacoHostVisible])

  useEffect(() => {
    if (!open) return
    setActiveTab(initialWorkspaceShellTab(open, entry))
  }, [open, entry])

  const anchoredEntityId = entry?.entityId ?? null

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of world.entities) {
      map.set(e.id, e.name ?? e.id)
    }
    return map
  }, [world.entities])

  const shellMetaLine = useMemo(() => {
    const itemSource = entry?.itemSource
    const itemId = entry?.itemId
    if (itemSource === 'global' && itemId != null) return `Global library · ${itemId}`
    if (entry?.tab === 'organize' && entry?.organize?.scope === 'global') return 'Global library'
    if (anchoredEntityId != null) {
      const count = selectedEntityIds.length
      const multiInfo = count > 1 ? `[Editing ${count} entities] ` : ''
      const entityLabel = entityNameMap.get(anchoredEntityId) ?? anchoredEntityId
      return `${multiInfo}${entityLabel}${itemId != null ? ` · ${itemId}` : ''}`
    }
    return ''
  }, [anchoredEntityId, entry?.itemId, entry?.itemSource, entry?.tab, entry?.organize?.scope, entityNameMap, selectedEntityIds.length])

  const showEntitySearchPicker = useMemo(() => {
    if (entry?.itemSource === 'global') return false
    if (entry?.tab === 'organize' && entry?.organize?.scope === 'global') return false
    return true
  }, [entry?.itemSource, entry?.tab, entry?.organize?.scope])

  const [globalLibrary, setGlobalLibrary] = useState<GlobalBehaviorLibrary>(EMPTY_GLOBAL_BEHAVIOR_LIBRARY)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void defaultPersistence.loadGlobalBehaviorLibrary().then((lib) => {
      if (!cancelled) setGlobalLibrary(lib)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const persistGlobalLibrary = useCallback((next: GlobalBehaviorLibrary) => {
    setGlobalLibrary(next)
    void defaultPersistence.saveGlobalBehaviorLibrary(next)
  }, [])

  const resolveEntityId = useCallback(
    () => entry?.entityId ?? selectedEntityIds[0] ?? '',
    [entry?.entityId, selectedEntityIds],
  )

  const handleShellTabClick = useCallback(
    (id: WorkspaceShellTabId) => {
      setActiveTab(id)
      if (!onEntryChange) return
      const entityId = resolveEntityId()
      const editorAnchor = {
        itemId: entry?.itemId,
        itemSource: entry?.itemSource,
        pipeNavPath: entry?.pipeNavPath,
        pipeNavSelectedIndex: entry?.pipeNavSelectedIndex,
      }
      if (id === 'organize') {
        onEntryChange({
          entityId,
          tab: 'organize',
          organize: entry?.organize ?? { scope: 'project', kind: 'transformers' },
          ...editorAnchor,
        })
      } else if (id === 'transformers') {
        onEntryChange({
          entityId,
          tab: 'transformers',
          ...editorAnchor,
        })
      } else {
        onEntryChange({
          entityId,
          tab: 'scripts',
          ...editorAnchor,
        })
      }
    },
    [
      entry?.itemId,
      entry?.itemSource,
      entry?.organize,
      entry?.pipeNavPath,
      entry?.pipeNavSelectedIndex,
      onEntryChange,
      resolveEntityId,
    ],
  )

  const navigateToEditorFromOrganize = useCallback(
    (target: WorkspaceTarget) => {
      if (target.tab === 'organize') {
        setActiveTab('organize')
      } else {
        setActiveTab(target.tab === 'scripts' ? 'scripts' : 'transformers')
      }
      onEntryChange?.(target)
    },
    [onEntryChange],
  )

  const handleOrganizeContextChange = useCallback(
    (scope: WorkspaceOrganizeScope, kind: WorkspaceOrganizeKind) => {
      onEntryChange?.({
        entityId: resolveEntityId(),
        tab: 'organize',
        organize: { scope, kind },
      })
    },
    [onEntryChange, resolveEntityId],
  )

  const openOrganizeScriptsForEntity = useCallback(() => {
    const entityId = resolveEntityId()
    setActiveTab('organize')
    onEntryChange?.({
      entityId,
      tab: 'organize',
      organize: { scope: 'entity', kind: 'scripts' },
    })
  }, [onEntryChange, resolveEntityId])

  const handleSelectEntityFromWorkspace = useCallback(
    (id: string) => {
      onSelectEntity?.(id)
    },
    [onSelectEntity],
  )

  const close = useCallback(() => {
    persistEditorViewState()
    monacoPayloadRef.current.beforeRefresh?.()
    onClose()
  }, [onClose, persistEditorViewState])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.shiftKey) return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (activeTab === 'organize') {
      setMonacoPayload((prev) => ({
        ...IDLE_MONACO,
        refreshKey: prev.refreshKey,
      }))
    }
  }, [activeTab, open])

  useEffect(() => {
    setMonacoChrome(null)
  }, [activeTab])

  const monacoCtxValue = useMemo(() => monacoEditorRef, [])

  const handleMonacoRefresh = useCallback(() => {
    monacoPayload.beforeRefresh?.()
    setManualMonacoRefreshNonce((n) => n + 1)
  }, [monacoPayload])

  const handleMonacoEditorAreaReady = useCallback(() => {
    setMonacoEditorAreaEpoch((n) => n + 1)
  }, [])

  const monacoScriptEvent =
    monacoPayload.kind === 'script-js' ? monacoPayload.scriptEvent : undefined

  const handleAfterDelayedLayout = useCallback(() => {
    scheduleRestoreEditorViewState()
  }, [scheduleRestoreEditorViewState])

  const handleMonacoEditorReady = useCallback((ed: editor.IStandaloneCodeEditor) => {
    monacoEditorRef.current = ed
    scheduleRestoreEditorViewState()
    const disposeCursor = ed.onDidChangeCursorPosition(() => {
      if (performance.now() < suppressViewStateSaveUntilRef.current) return
      const key = editorItemKeyRef.current
      if (!key) return
      const state = ed.saveViewState()
      if (state) saveWorkspaceEditorViewState(key, state)
    })
    const disposeScroll = ed.onDidScrollChange(() => {
      if (performance.now() < suppressViewStateSaveUntilRef.current) return
      const key = editorItemKeyRef.current
      if (!key) return
      const state = ed.saveViewState()
      if (state) saveWorkspaceEditorViewState(key, state)
    })
    ed.onDidDispose(() => {
      disposeCursor.dispose()
      disposeScroll.dispose()
    })
  }, [scheduleRestoreEditorViewState])

  const monacoEditor = useMemo(() => {
    if (activeTab !== 'transformers' && activeTab !== 'scripts') return null
    return (
      <TransformerCustomCodeEditor
        layout="fill"
        key={`ws-monaco-${activeTab}-${monacoPayload.refreshKey}-${editorOpenRefreshNonce}-${manualMonacoRefreshNonce}`}
        transparent={shellGlass}
        delayedLayoutMs={200}
        modelPath={editorItemKey ?? undefined}
        onAfterDelayedLayout={handleAfterDelayedLayout}
        value={monacoPayload.value}
        onChange={monacoPayload.onChange}
        disabled={monacoPayload.disabled}
        codeIntelliSense={monacoPayload.kind === 'script-js' ? 'script' : 'transformer'}
        scriptCtxEvent={monacoScriptEvent}
        onEditorReady={handleMonacoEditorReady}
      />
    )
  }, [
    activeTab,
    monacoPayload.refreshKey,
    editorOpenRefreshNonce,
    manualMonacoRefreshNonce,
    monacoPayload.value,
    monacoPayload.onChange,
    monacoPayload.disabled,
    monacoPayload.kind,
    monacoScriptEvent,
    shellGlass,
    handleMonacoEditorReady,
    handleAfterDelayedLayout,
    editorItemKey,
  ])

  const monacoSlot =
    monacoEditor ?
      <WorkspaceMonacoSlot
        monacoSlot={monacoEditor}
        testId="workspace-monaco-refresh-editor"
        onRefresh={handleMonacoRefresh}
        editorAreaRef={monacoEditorAreaRef}
        onEditorAreaReady={handleMonacoEditorAreaReady}
        toolbarExtra={monacoChrome?.toolbarExtra}
        overlay={monacoChrome?.overlay}
      />
    : null

  return open ?
      createPortal(
        <WorkspaceMonacoContext.Provider value={monacoCtxValue}>
          <div
            role="dialog"
              aria-modal="true"
              aria-label="Behavior workspace"
              data-testid="workspace-panel"
              style={{
                position: 'fixed',
                top: builderHeaderBottomInsetPx,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme.bg.modalBackdropSoft,
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'stretch',
                zIndex: theme.zIndex.modal,
                padding: 0,
                boxSizing: 'border-box',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) close()
              }}
            >
              <div
                style={{
                  flex: '1 1 auto',
                  width: '100%',
                  minHeight: 0,
                  backgroundColor: shellBackground.body,
                  border: `1px solid ${theme.border.default}`,
                  borderRadius: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'none',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    padding: '10px 16px',
                    borderBottom: `1px solid ${theme.border.default}`,
                    backgroundColor: shellBackground.header,
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                <div role="tablist" aria-label="Workspace views" style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                  {WORKSPACE_TAB_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === id}
                      data-testid={`workspace-tab-${id}`}
                      onClick={() => handleShellTabClick(id)}
                      style={workspaceTabStyle(activeTab === id)}
                    >
                      {id === 'transformers' ? 'Transformers' : id === 'scripts' ? 'Scripts' : 'Organize'}
                    </button>
                  ))}
                </div>
                <div
                  data-testid="workspace-shell-meta-line"
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {showEntitySearchPicker ?
                    <EntitySearchPicker
                      entities={world.entities}
                      entityWorkHistory={entityWorkHistory}
                      selectedEntityId={anchoredEntityId}
                      onSelectEntity={handleSelectEntityFromWorkspace}
                      variant="compact"
                      selectedLabel={shellMetaLine || null}
                      hoverReveal
                      testId="workspace-shell-entity-search"
                    />
                  : (
                    <span
                      style={{
                        fontSize: 11,
                        color: theme.text.muted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                      }}
                      title={shellMetaLine}
                    >
                      {shellMetaLine}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {onResetAllEntities && (
                    <button
                      type="button"
                      data-testid="workspace-reset-all-entities"
                      title="Reset all entities to original positions"
                      aria-label="Reset all entities to original positions"
                      onClick={onResetAllEntities}
                      style={{
                        ...entityPanelIconButtonStyle,
                        color: theme.text.muted,
                      }}
                    >
                      ↺
                    </button>
                  )}
                  {onToggleGameFrozen && (
                    <button
                      type="button"
                      data-testid="workspace-stop-game"
                      title={gameFrozen ? 'Resume game' : 'Stop game (freeze physics & scripts)'}
                      aria-label={gameFrozen ? 'Resume game' : 'Stop game'}
                      onClick={onToggleGameFrozen}
                      style={{
                        ...entityPanelIconButtonStyle,
                        color: gameFrozen ? theme.accent : theme.text.muted,
                        opacity: gameFrozen ? 1 : 0.65,
                      }}
                    >
                      {gameFrozen ? '▶' : '⏹'}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="workspace-docs-toggle"
                    title={docsOpen ? 'Hide documentation' : 'Show documentation'}
                    aria-label={docsOpen ? 'Hide documentation' : 'Show documentation'}
                    aria-pressed={docsOpen}
                    onClick={() => setDocsOpen((open) => !open)}
                    style={{
                      ...entityPanelIconButtonStyle,
                      opacity: docsOpen ? 1 : 0.65,
                      color: docsOpen ? theme.accent : theme.text.muted,
                    }}
                  >
                    {EntityPanelIcons.document}
                  </button>
                  <button
                    type="button"
                    data-testid="workspace-opacity-toggle"
                    title={`Background opacity: ${workspaceBackgroundOpacityLabel(backgroundOpacity)} (click for ${workspaceBackgroundOpacityLabel(WORKSPACE_BACKGROUND_OPACITY_STEPS[(backgroundOpacityStep + 1) % WORKSPACE_BACKGROUND_OPACITY_STEPS.length])})`}
                    aria-label={`Background opacity ${workspaceBackgroundOpacityLabel(backgroundOpacity)}`}
                    onClick={() =>
                      setBackgroundOpacityStep(
                        (step) => (step + 1) % WORKSPACE_BACKGROUND_OPACITY_STEPS.length,
                      )
                    }
                    style={{
                      ...entityPanelIconButtonStyle,
                      opacity: shellGlass ? 0.65 : 1,
                      color: shellGlass ? theme.text.muted : theme.accent,
                    }}
                  >
                    {EntityPanelIcons.opacity}
                  </button>
                  <button
                    type="button"
                    data-testid="workspace-close"
                    onClick={close}
                    aria-label="Close workspace"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.text.muted,
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: 'pointer',
                      padding: 4,
                      borderRadius: 4,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  padding: '5px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                }}
              >
                <WorkspaceDocsSplit open={docsOpen} onClose={() => setDocsOpen(false)}>
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {activeTab === 'transformers' ? (
                      <WorkspaceTransformersTab
                        key={entry?.entityId ?? 'none'}
                        world={world}
                        selectedEntityIds={selectedEntityIds}
                        entry={entry}
                        workspaceOpen={open}
                        liveTraceSteps={liveTransformerTraceSteps}
                        onWorldChange={onWorldChange}
                        onEntityTransformersChange={onEntityTransformersChange}
                        onMergedPipeParamSync={onMergedPipeParamSync}
                        setMonacoPayload={setMonacoPayload}
                        setMonacoEditorChrome={setMonacoChrome}
                        monacoEditorAreaRef={monacoEditorAreaRef}
                        monacoEditorAreaEpoch={monacoEditorAreaEpoch}
                        monacoSlot={monacoSlot}
                        entityWorkHistory={entityWorkHistory}
                        onSelectEntity={handleSelectEntityFromWorkspace}
                        globalLibrary={globalLibrary}
                        onGlobalLibraryChange={persistGlobalLibrary}
                        onEntryChange={onEntryChange}
                      />
                    ) : activeTab === 'scripts' ? (
                      <WorkspaceScriptsTab
                        world={world}
                        selectedEntityIds={selectedEntityIds}
                        entry={entry}
                        workspaceOpen={open}
                        onWorldChange={onWorldChange}
                        setMonacoPayload={setMonacoPayload}
                        monacoSlot={monacoSlot}
                        onOpenOrganizeScripts={openOrganizeScriptsForEntity}
                        globalLibrary={globalLibrary}
                        onGlobalLibraryChange={persistGlobalLibrary}
                      entityWorkHistory={entityWorkHistory}
                      onSelectEntity={handleSelectEntityFromWorkspace}
                    />
                  ) : (
                      <WorkspaceOrganizeTab
                        world={world}
                        selectedEntityIds={selectedEntityIds}
                        entry={entry}
                        onWorldChange={onWorldChange}
                        onNavigateToEditor={navigateToEditorFromOrganize}
                        onOrganizeContextChange={handleOrganizeContextChange}
                        globalLibrary={globalLibrary}
                        onGlobalLibraryChange={persistGlobalLibrary}
                        entityWorkHistory={entityWorkHistory}
                        onSelectEntity={handleSelectEntityFromWorkspace}
                      />
                    )}
                  </div>
                </WorkspaceDocsSplit>
              </div>
            </div>
          </div>
        </WorkspaceMonacoContext.Provider>,
        portalTarget,
      )
    : null
}
