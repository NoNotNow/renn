import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from 'react'
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
import TransformerCustomCodeEditor from '@/components/TransformerCustomCodeEditor'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { entityPanelIconButtonStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'
import { addFullscreenChangeListener, getFullscreenElement } from '@/utils/fullscreenApi'
import { defaultPersistence } from '@/persistence/indexedDb'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'

export type { WorkspaceMonacoPayload, WorkspaceTarget } from '@/types/workspace'

/** Shared Monaco editor handle for Transformers / Scripts tabs (Phase 3+ consume this). */
export const WorkspaceMonacoContext = createContext<MutableRefObject<editor.IStandaloneCodeEditor | null> | null>(
  null,
)

export function useWorkspaceMonacoEditorRef(): MutableRefObject<editor.IStandaloneCodeEditor | null> {
  const ref = useContext(WorkspaceMonacoContext)
  if (!ref) {
    throw new Error('useWorkspaceMonacoEditorRef must be used inside Workspace')
  }
  return ref
}

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

/** Remount shared Monaco shortly after open so layout settles (same effect as Refresh editor). */
const WORKSPACE_EDITOR_OPEN_REFRESH_MS = 100

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
  /** Builder live transformer trace (`null` disables live IN/OUT in the pipeline strip). */
  liveTransformerTraceSteps?: TransformerTraceStep[] | null
  onResetPoseToSavedWorld?: (entityIds: string[]) => void
  canResetPoseToSaved?: boolean
  resetPoseTitle?: string
  /** Same hook as Workspace — collapse side drawers when opening. */
  onWorkspaceOpenSideEffects?: () => void
  /** Keeps anchor entry in sync when switching shell tabs or navigating from Organize → editor. */
  onEntryChange?: (next: WorkspaceTarget) => void
  onSelectEntity?: (id: string) => void
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
  liveTransformerTraceSteps = null,
  onResetPoseToSavedWorld,
  canResetPoseToSaved,
  resetPoseTitle,
  onWorkspaceOpenSideEffects,
  onEntryChange,
  onSelectEntity,
}: WorkspaceProps) {
  const portalTarget = useWorkspacePortalRoot()
  const builderHeaderBottomInsetPx = useBuilderHeaderBottomInsetPx(open)

  const monacoEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const [activeTab, setActiveTab] = useState<WorkspaceShellTabId>(() =>
    initialWorkspaceShellTab(open, entry),
  )
  const [opaque, setOpaque] = useState(false)
  const [monacoPayload, setMonacoPayload] = useState<WorkspaceMonacoPayload>(IDLE_MONACO)
  const [editorOpenRefreshNonce, setEditorOpenRefreshNonce] = useState(0)

  const prevOpenRef = useRef(false)

  useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = open
    if (!open || wasOpen) return
    onWorkspaceOpenSideEffects?.()
    const timer = window.setTimeout(() => {
      setEditorOpenRefreshNonce((n) => n + 1)
    }, WORKSPACE_EDITOR_OPEN_REFRESH_MS)
    return () => window.clearTimeout(timer)
  }, [open, onWorkspaceOpenSideEffects])

  useEffect(() => {
    if (!open) return
    setActiveTab(initialWorkspaceShellTab(open, entry))
  }, [open, entry?.tab])

  const anchoredEntityId = entry?.entityId ?? null

  const shellMetaLine = useMemo(() => {
    const itemSource = entry?.itemSource
    const itemId = entry?.itemId
    if (itemSource === 'global' && itemId != null) return `Global library · ${itemId}`
    if (anchoredEntityId != null) {
      const count = selectedEntityIds.length
      const multiInfo = count > 1 ? `[Editing ${count} entities] ` : ''
      return `${multiInfo}Entity ${anchoredEntityId}${itemId != null ? ` · ${itemId}` : ''}`
    }
    return 'Select an entity in the inspector'
  }, [anchoredEntityId, entry?.itemId, entry?.itemSource])

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
      if (id === 'organize') {
        onEntryChange({
          entityId,
          tab: 'organize',
          organize: entry?.organize ?? { scope: 'project', kind: 'transformers' },
        })
      } else if (id === 'transformers') {
        onEntryChange({
          entityId,
          tab: 'transformers',
          itemId: entry?.itemId,
          itemSource: entry?.itemSource,
        })
      } else {
        onEntryChange({
          entityId,
          tab: 'scripts',
          itemId: entry?.itemId,
          itemSource: entry?.itemSource,
        })
      }
    },
    [entry?.itemId, entry?.organize, onEntryChange, resolveEntityId],
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
      if (onEntryChange) {
        onEntryChange({
          ...entry,
          entityId: id,
        } as WorkspaceTarget)
      }
    },
    [entry, onEntryChange, onSelectEntity],
  )

  const close = useCallback(() => {
    onClose()
  }, [onClose])

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

  const monacoCtxValue = useMemo(() => monacoEditorRef, [])

  const monacoEditor = useMemo(() => {
    if (activeTab !== 'transformers' && activeTab !== 'scripts') return null
    return (
      <TransformerCustomCodeEditor
        layout="fill"
        key={`ws-monaco-${activeTab}-${monacoPayload.refreshKey}-${editorOpenRefreshNonce}`}
        transparent={!opaque}
        delayedLayoutMs={200}
        value={monacoPayload.value}
        onChange={monacoPayload.onChange}
        disabled={monacoPayload.disabled}
        codeIntelliSense={monacoPayload.kind === 'script-js' ? 'script' : 'transformer'}
        scriptCtxEvent={monacoPayload.kind === 'script-js' ? monacoPayload.scriptEvent : undefined}
        onEditorReady={(ed) => {
          monacoEditorRef.current = ed
        }}
      />
    )
  }, [
    activeTab,
    monacoPayload.refreshKey,
    editorOpenRefreshNonce,
    monacoPayload.value,
    monacoPayload.onChange,
    monacoPayload.disabled,
    monacoPayload.kind,
    monacoPayload.scriptEvent,
    opaque,
  ])

  const portal =
    open ?
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
                  backgroundColor: opaque ? theme.bg.panelAlt : theme.bg.modalGlass,
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
                    backgroundColor: opaque ? theme.bg.panel : theme.bg.modalGlassHeader,
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
                    fontSize: 11,
                    color: theme.text.muted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={shellMetaLine}
                >
                  {shellMetaLine}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    data-testid="workspace-opacity-toggle"
                    title={opaque ? 'Make window transparent' : 'Make window fully opaque'}
                    aria-label="Toggle window opacity"
                    onClick={() => setOpaque(!opaque)}
                    style={{
                      ...entityPanelIconButtonStyle,
                      opacity: opaque ? 1 : 0.65,
                      color: opaque ? theme.accent : theme.text.muted,
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
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {activeTab === 'transformers' ? (
                    <WorkspaceTransformersTab
                      world={world}
                      selectedEntityIds={selectedEntityIds}
                      entry={entry}
                      workspaceOpen={open}
                      liveTraceSteps={liveTransformerTraceSteps}
                      onWorldChange={onWorldChange}
                      onEntityTransformersChange={onEntityTransformersChange}
                      setMonacoPayload={setMonacoPayload}
                      monacoSlot={monacoEditor}
                      onResetPoseToSavedWorld={onResetPoseToSavedWorld}
                      canResetPoseToSaved={canResetPoseToSaved}
                      resetPoseTitle={resetPoseTitle}
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
                      monacoSlot={monacoEditor}
                      onOpenOrganizeScripts={openOrganizeScriptsForEntity}
                      globalLibrary={globalLibrary}
                      onGlobalLibraryChange={persistGlobalLibrary}
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
                      onSelectEntity={handleSelectEntityFromWorkspace}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </WorkspaceMonacoContext.Provider>,
        portalTarget,
      )
    : null

  return portal
}
