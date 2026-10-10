import { useCallback, useEffect, useState } from 'react'
import Modal from './Modal'
import { theme } from '@/config/theme'
import { secondaryButtonStyle, secondaryButtonStyleDisabled } from './sharedStyles'
import {
  MAZE_TRAINING_WORLDS,
  type MazeTrainingMeta,
  type MazeTrainingWorldSpec,
} from '@/policyEvolution/mazeTraining'

const BASE_URL = import.meta.env.BASE_URL || '/'

export interface MazeTrainingDialogProps {
  isOpen: boolean
  onClose: () => void
  /** Loads the example world into the builder (Builder implements this; the dialog stays open). */
  onPlayExampleWorld: (worldId: string) => void
}

type MazeTrainingView = 'list' | 'cards'

interface MazeCardState {
  meta: MazeTrainingMeta | null
  /** meta.json fetch failed (world not exported yet). */
  failed: boolean
}

const initialCardState: MazeCardState = { meta: null, failed: false }

const LIST_VIEW_WIDTH = 560
const CARDS_VIEW_WIDTH = 720

function mazeMetaUrl(spec: MazeTrainingWorldSpec): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/meta.json`
}

function mazeThumbUrl(spec: MazeTrainingWorldSpec): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/thumb.svg`
}

/** "3 ways · 1 reversed"; null when an older meta.json predates the routes field. */
function routesLabel(meta: MazeTrainingMeta): string | null {
  const routes = meta.routes
  if (!routes || typeof routes.forward !== 'number') return null
  const reversed = typeof routes.reversed === 'number' ? routes.reversed : 0
  return `${routes.forward} ways · ${reversed} reversed`
}

function bestScoreLabel(meta: MazeTrainingMeta): string {
  return meta.bestScore == null ? 'Best: —' : `Best: ${meta.bestScore} pts`
}

const viewToggleStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  padding: '2px 10px',
  fontSize: 12,
}

export default function MazeTrainingDialog({ isOpen, onClose, onPlayExampleWorld }: MazeTrainingDialogProps) {
  const [cardStates, setCardStates] = useState<Record<string, MazeCardState>>(() =>
    Object.fromEntries(MAZE_TRAINING_WORLDS.map((spec) => [spec.id, initialCardState])),
  )
  const [view, setView] = useState<MazeTrainingView>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Accordion: the one list row whose thumbnail is expanded inline. */
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    for (const spec of MAZE_TRAINING_WORLDS) {
      fetch(mazeMetaUrl(spec), { cache: 'no-cache' })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status))
          return (await res.json()) as MazeTrainingMeta
        })
        .then((meta) => {
          if (!cancelled) {
            setCardStates((prev) => ({ ...prev, [spec.id]: { meta, failed: false } }))
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCardStates((prev) => ({ ...prev, [spec.id]: { meta: null, failed: true } }))
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id)
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const handleCardClick = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handlePlay = useCallback(
    (id: string) => {
      setSelectedId(id)
      onPlayExampleWorld(id)
    },
    [onPlayExampleWorld],
  )

  const handleThumbError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none'
  }, [])

  const headerExtra = (
    <div style={{ display: 'flex', gap: 6, marginLeft: 12 }} data-testid="maze-training-view-toggle">
      <button
        type="button"
        data-testid="maze-training-view-cards"
        onClick={() => setView('cards')}
        style={{
          ...viewToggleStyle,
          ...(view === 'cards' ? { background: theme.button.pick } : {}),
        }}
      >
        Cards
      </button>
      <button
        type="button"
        data-testid="maze-training-view-list"
        onClick={() => setView('list')}
        style={{
          ...viewToggleStyle,
          ...(view === 'list' ? { background: theme.button.pick } : {}),
        }}
      >
        List
      </button>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Training Mazes"
      width={view === 'list' ? LIST_VIEW_WIDTH : CARDS_VIEW_WIDTH}
      minWidth={420}
      resizable
      headerExtra={headerExtra}
    >
      <p style={{ margin: '0 0 12px 0', fontSize: 12, color: theme.text.muted }}>
        Five playable maze worlds trained with the evolved v3 driving policy. Press Play to load one into the
        builder — the dialog stays open so you can watch the run behind it.
      </p>
      {view === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MAZE_TRAINING_WORLDS.map((spec) => {
            const state = cardStates[spec.id] ?? initialCardState
            const meta = state.meta
            const exported = !state.failed && meta != null
            const selected = selectedId === spec.id
            const expanded = expandedId === spec.id && exported
            const routes = exported && meta ? routesLabel(meta) : null
            return (
              <div
                key={spec.id}
                data-testid={`maze-training-row-${spec.id}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-expanded={expanded}
                aria-label={spec.name}
                onClick={() => handleRowClick(spec.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleRowClick(spec.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  background: theme.bg.panel,
                  border: `1px solid ${selected ? theme.button.pickBorder : theme.border.default}`,
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                  <span
                    aria-hidden={true}
                    style={{
                      width: 16,
                      flexShrink: 0,
                      color: theme.text.muted,
                      fontSize: 12,
                      transform: expanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    &#9656;
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
                      {spec.name} <span style={{ fontWeight: 400, color: theme.text.muted }}>seed {spec.seed}</span>
                    </span>
                    <span style={{ fontSize: 11, color: theme.text.secondary }}>
                      {exported && meta ? meta.candidate.label : 'not exported yet'}
                    </span>
                  </div>
                  {exported && meta ? (
                    <span style={{ fontSize: 12, color: theme.text.secondary, flexShrink: 0 }}>
                      {bestScoreLabel(meta)}
                    </span>
                  ) : null}
                  {routes ? (
                    <span style={{ fontSize: 12, color: theme.text.secondary, flexShrink: 0, minWidth: 110 }}>
                      {routes}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-testid={`maze-training-play-${spec.id}`}
                    disabled={!exported}
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePlay(spec.id)
                    }}
                    style={{
                      ...secondaryButtonStyle,
                      ...(exported ? {} : secondaryButtonStyleDisabled),
                      ...(exported && selected ? { background: theme.button.pick } : {}),
                      flexShrink: 0,
                    }}
                  >
                    Play
                  </button>
                </div>
                {expanded ? (
                  <div style={{ padding: '0 10px 10px 36px' }}>
                    <img
                      data-testid={`maze-training-thumb-${spec.id}`}
                      src={mazeThumbUrl(spec)}
                      alt={`${spec.name} thumbnail`}
                      style={{ width: 160, borderRadius: 6, display: 'block', background: theme.bg.surface }}
                      onError={handleThumbError}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {MAZE_TRAINING_WORLDS.map((spec) => {
            const state = cardStates[spec.id] ?? initialCardState
            const meta = state.meta
            const exported = !state.failed && meta != null
            const selected = selectedId === spec.id
            return (
              <div
                key={spec.id}
                data-testid={`maze-training-card-${spec.id}`}
                role="button"
                tabIndex={0}
                aria-label={spec.name}
                aria-pressed={selected}
                onClick={() => handleCardClick(spec.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleCardClick(spec.id)}
                style={{
                  width: 200,
                  padding: 12,
                  background: theme.bg.panel,
                  border: `1px solid ${selected ? theme.button.pickBorder : theme.border.default}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 180,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: theme.bg.surface,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {exported ? (
                    <img
                      src={mazeThumbUrl(spec)}
                      alt={`${spec.name} thumbnail`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={handleThumbError}
                    />
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>{spec.name}</span>
                  <span style={{ fontSize: 12, color: theme.text.secondary }}>seed {spec.seed}</span>
                  {exported && meta ? (
                    <>
                      <span style={{ fontSize: 12, color: theme.text.secondary }}>{meta.candidate.label}</span>
                      <span style={{ fontSize: 12, color: theme.text.secondary }}>{bestScoreLabel(meta)}</span>
                      {routesLabel(meta) ? (
                        <span style={{ fontSize: 12, color: theme.text.secondary }}>{routesLabel(meta)}</span>
                      ) : null}
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: theme.text.muted }}>not exported yet</span>
                  )}
                </div>
                <button
                  type="button"
                  data-testid={`maze-training-play-${spec.id}`}
                  disabled={!exported}
                  onClick={() => handlePlay(spec.id)}
                  style={{
                    ...secondaryButtonStyle,
                    ...(exported ? {} : secondaryButtonStyleDisabled),
                    ...(exported && selected ? { background: theme.button.pick } : {}),
                  }}
                >
                  Play
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
