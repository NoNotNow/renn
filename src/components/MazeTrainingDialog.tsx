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
  /** Loads + plays the example world (Builder implements this). */
  onPlayExampleWorld: (worldId: string) => void
}

interface MazeCardState {
  meta: MazeTrainingMeta | null
  /** meta.json fetch failed (world not exported yet). */
  failed: boolean
}

const initialCardState: MazeCardState = { meta: null, failed: false }

function mazeMetaUrl(spec: MazeTrainingWorldSpec): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/meta.json`
}

function mazeThumbUrl(spec: MazeTrainingWorldSpec): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/thumb.svg`
}

export default function MazeTrainingDialog({ isOpen, onClose, onPlayExampleWorld }: MazeTrainingDialogProps) {
  const [cardStates, setCardStates] = useState<Record<string, MazeCardState>>(() =>
    Object.fromEntries(MAZE_TRAINING_WORLDS.map((spec) => [spec.id, initialCardState])),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  const handleCardClick = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handleThumbError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none'
  }, [])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Training Mazes" width={720}>
      <p style={{ margin: '0 0 16px 0', fontSize: 12, color: theme.text.muted }}>
        Five playable maze worlds trained with the evolved v3 driving policy. Pick a maze and press Play.
      </p>
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
                    <span style={{ fontSize: 12, color: theme.text.secondary }}>
                      {meta.bestScore == null ? 'Best: —' : `Best: ${meta.bestScore} pts`}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: theme.text.muted }}>not exported yet</span>
                )}
              </div>
              <button
                type="button"
                data-testid={`maze-training-play-${spec.id}`}
                disabled={!exported}
                onClick={() => onPlayExampleWorld(spec.id)}
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
    </Modal>
  )
}
