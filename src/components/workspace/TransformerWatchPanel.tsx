import { useMemo, useSyncExternalStore } from 'react'
import { theme } from '@/config/theme'
import WorkspaceFloatingDrawer from '@/components/workspace/WorkspaceFloatingDrawer'

const WATCH_PANEL_POSITION_STORAGE_KEY = 'rennWorkspaceWatchPanelPos'
import {
  clearTransformerWatchEntries,
  getTransformerWatchEntriesForTarget,
  getTransformerWatchRunId,
  subscribeTransformerWatch,
} from '@/runtime/transformerWatchBridge'

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

  return (
    <WorkspaceFloatingDrawer
      title="Watch"
      onClose={onClose}
      portalTarget={portalTarget}
      anchor="top-right"
      positionStorageKey={WATCH_PANEL_POSITION_STORAGE_KEY}
      initialTop={12}
      width={300}
      maxHeight="min(42vh, 280px)"
      testId="workspace-transformer-watch-panel"
      headerExtra={
        <button
          type="button"
          data-testid="workspace-transformer-watch-clear"
          onClick={(e) => {
            e.stopPropagation()
            clearTransformerWatchEntries()
          }}
          style={{
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
          }}
          title="Clear all watch entries"
        >
          Clear
        </button>
      }
    >
      {entries.length === 0 ?
        <p style={{ margin: 0, color: theme.text.muted, fontSize: 11, lineHeight: 1.45 }}>
          Call <code style={{ color: theme.text.secondary }}>api.watch(value, &apos;label&apos;)</code> in your transformer
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
