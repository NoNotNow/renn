import { useMemo, useState, useSyncExternalStore } from 'react'
import { theme } from '@/config/theme'
import WorkspaceFloatingDrawer from '@/components/workspace/WorkspaceFloatingDrawer'

const WATCH_PANEL_POSITION_STORAGE_KEY = 'rennWorkspaceWatchPanelPos'
import {
  clearTransformerWatchEntries,
  getTransformerWatchEntriesForTarget,
  getTransformerWatchRunId,
  subscribeTransformerWatch,
} from '@/runtime/transformerWatchBridge'
import {
  clearTransformerSnapshot,
  getLatestTransformerSnapshot,
  requestTransformerSnapshot,
  subscribeTransformerSnapshot,
} from '@/runtime/transformerSnapshotBridge'

const headerButtonStyle = {
  background: 'transparent',
  border: `1px solid ${theme.border.default}`,
  borderRadius: 4,
  color: theme.text.muted,
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1,
  padding: '2px 6px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
} as const

export interface TransformerWatchPanelProps {
  entityId: string
  configStackIndex: number
  portalTarget: Element
  onClose: () => void
}

export default function TransformerWatchPanel({
  entityId,
  configStackIndex,
  portalTarget,
  onClose,
}: TransformerWatchPanelProps) {
  const getEntriesSnapshot = useMemo(
    () => () => getTransformerWatchEntriesForTarget(entityId, configStackIndex),
    [entityId, configStackIndex],
  )
  const currentRunId = useSyncExternalStore(subscribeTransformerWatch, getTransformerWatchRunId, () => 0)
  const entries = useSyncExternalStore(subscribeTransformerWatch, getEntriesSnapshot, () => [])
  const snapshot = useSyncExternalStore(subscribeTransformerSnapshot, getLatestTransformerSnapshot, () => null)
  const [copied, setCopied] = useState(false)
  const snapshotJson = useMemo(
    () => (snapshot && snapshot.entityId === entityId ? JSON.stringify(snapshot, null, 2) : null),
    [snapshot, entityId],
  )
  const copySnapshot = () => {
    if (!snapshotJson) return
    void navigator.clipboard?.writeText(snapshotJson).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => undefined,
    )
  }
  const downloadSnapshot = () => {
    if (!snapshotJson) return
    const url = URL.createObjectURL(new Blob([snapshotJson], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `transformer-snapshot-${entityId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <WorkspaceFloatingDrawer
      title="Watch"
      onClose={onClose}
      portalTarget={portalTarget}
      anchor="top-right"
      positionStorageKey={WATCH_PANEL_POSITION_STORAGE_KEY}
      initialTop={12}
      width={300}
      initialHeight={280}
      resizable
      minWidth={220}
      minHeight={120}
      maxResizeHeight={640}
      testId="workspace-transformer-watch-panel"
      headerExtra={
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <button
            type="button"
            data-testid="workspace-transformer-snapshot"
            onClick={(e) => {
              e.stopPropagation()
              requestTransformerSnapshot(entityId)
            }}
            style={headerButtonStyle}
            title="Record input, output, params, state and watch values of every custom transformer of this entity for one frame"
          >
            Snapshot
          </button>
          <button
            type="button"
            data-testid="workspace-transformer-watch-clear"
            onClick={(e) => {
              e.stopPropagation()
              clearTransformerWatchEntries()
            }}
            style={headerButtonStyle}
            title="Clear all watch entries"
          >
            Clear
          </button>
        </span>
      }
    >
      {snapshotJson && snapshot && (
        <div data-testid="workspace-transformer-snapshot-result" style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: theme.text.secondary }}>
            <span style={{ flex: 1 }}>
              Snapshot: {snapshot.stages.length} stage(s), {(snapshotJson.length / 1024).toFixed(0)} KB
            </span>
            <button type="button" style={headerButtonStyle} onClick={copySnapshot} data-testid="workspace-transformer-snapshot-copy">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" style={headerButtonStyle} onClick={downloadSnapshot}>
              Save
            </button>
            <button type="button" style={headerButtonStyle} onClick={clearTransformerSnapshot}>
              ×
            </button>
          </div>
          {snapshot.note && <div style={{ fontSize: 10, color: theme.text.muted }}>{snapshot.note}</div>}
          <textarea
            readOnly
            value={snapshotJson}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              height: 120,
              resize: 'vertical',
              fontSize: 10,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              background: 'transparent',
              color: theme.text.primary,
              border: `1px solid ${theme.border.default}`,
              borderRadius: 4,
            }}
          />
        </div>
      )}
      {entries.length === 0 ?
        <p style={{ margin: 0, color: theme.text.muted, fontSize: 11, lineHeight: 1.45 }}>
          Call <code style={{ color: theme.text.secondary }}>api.watch(&apos;label&apos;, value)</code> or{' '}
          <code style={{ color: theme.text.secondary }}>api.watch(value)</code> in your transformer
          code. Values update only when <code style={{ color: theme.text.secondary }}>watch</code> runs.
        </p>
      : (
        <ul
          data-testid="workspace-transformer-watch-list"
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {entries.map((entry) => {
            const stale = entry.runId < currentRunId
            return (
              <li
                key={entry.label}
                data-testid={`workspace-transformer-watch-row-${entry.label}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '4px 0',
                  borderBottom: `1px solid ${theme.border.default}`,
                  opacity: stale ? 0.72 : 1,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: theme.text.secondary,
                    letterSpacing: '0.02em',
                  }}
                >
                  {entry.label}
                </span>
                <span
                  data-testid={`workspace-transformer-watch-value-${entry.label}`}
                  style={{
                    fontSize: 11,
                    color: theme.text.primary,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {entry.value}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </WorkspaceFloatingDrawer>
  )
}
