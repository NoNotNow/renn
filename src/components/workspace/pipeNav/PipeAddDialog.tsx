import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import type { PipeNavViewMode } from '@/types/pipeNav'
import Modal from '@/components/Modal'
import { theme } from '@/config/theme'
import AddTransformerDialogPanel, {
  type AddExistingTransformerMode,
} from '@/components/workspace/AddTransformerDialogPanel'
import {
  pipeAddSectionLabel,
  pipeAddSectionsForMode,
  type PipeAddSection,
} from './pipeAddTypes'

export interface PipeAddDialogProps {
  isOpen: boolean
  onClose: () => void
  mode: PipeNavViewMode
  hasPipeStack: boolean
  world: RennWorld
  existingRegistry: Record<string, TransformerConfig>
  excludedStageIds: string[]
  onAddPreset: (type: string) => void
  onAddExisting: (registryId: string, mode: AddExistingTransformerMode) => void
  onCreatePipe: (name: string) => void
  onAddChildPipe: (name: string) => void
  onAddExistingPipe: (pipe: TransformerPipe, mode: 'linked' | 'copy') => void
}

const ghostButtonStyle = {
  padding: '6px 12px',
  background: 'transparent',
  border: `1px solid ${theme.border.default}`,
  color: theme.text.muted,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
} as const

const nameInputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  background: theme.bg.panelAlt,
  border: `1px solid ${theme.border.default}`,
  color: theme.text.primary,
  fontSize: 14,
} as const

function sectionTabStyle(active: boolean) {
  return {
    padding: '8px 14px',
    borderRadius: 6,
    border: `1px solid ${active ? theme.pipeNav.accentBorder : theme.border.default}`,
    background: active ? theme.pipeNav.treeSelected : theme.bg.surface,
    color: active ? theme.pipeNav.accent : theme.text.primary,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
  } as const
}

export default function PipeAddDialog({
  isOpen,
  onClose,
  mode,
  hasPipeStack,
  world,
  existingRegistry,
  excludedStageIds,
  onAddPreset,
  onAddExisting,
  onCreatePipe,
  onAddChildPipe,
  onAddExistingPipe,
}: PipeAddDialogProps) {
  const sections = useMemo(() => pipeAddSectionsForMode(mode, hasPipeStack), [mode, hasPipeStack])
  const [activeSection, setActiveSection] = useState<PipeAddSection>(sections[0] ?? 'stage')
  const [pipeName, setPipeName] = useState('New pipe')
  const [selectedPipe, setSelectedPipe] = useState<TransformerPipe | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setActiveSection(sections[0] ?? 'stage')
    setPipeName('New pipe')
    setSelectedPipe(null)
  }, [isOpen, sections])

  useEffect(() => {
    if (!sections.includes(activeSection)) setActiveSection(sections[0] ?? 'stage')
  }, [sections, activeSection])

  const title =
    sections.length === 1 && sections[0] === 'stage' ? 'Add transformer' : 'Add to pipeline'

  const handleCreatePipe = () => {
    const name = pipeName.trim()
    if (!name) return
    if (activeSection === 'child_pipe') onAddChildPipe(name)
    else onCreatePipe(name)
    onClose()
  }

  let body: ReactNode = null
  let footer: ReactNode = (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button type="button" onClick={onClose} style={ghostButtonStyle}>
        Cancel
      </button>
    </div>
  )

  if (activeSection === 'stage') {
    body = (
      <AddTransformerDialogPanel
        existingRegistry={existingRegistry}
        excludedIds={excludedStageIds}
        onAddPreset={(type) => {
          onAddPreset(type)
          onClose()
        }}
        onAddExisting={(registryId, linkMode) => {
          onAddExisting(registryId, linkMode)
          onClose()
        }}
        onCancel={onClose}
      />
    )
    footer = null
  } else if (activeSection === 'create_pipe' || activeSection === 'child_pipe') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 12, color: theme.text.muted }}>
          {activeSection === 'child_pipe' ? 'Child pipe name' : 'Pipe name'}
        </label>
        <input
          type="text"
          value={pipeName}
          onChange={(e) => setPipeName(e.target.value)}
          style={nameInputStyle}
          data-testid="pipe-add-name-input"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreatePipe()
          }}
        />
      </div>
    )
    footer = (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" onClick={onClose} style={ghostButtonStyle}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!pipeName.trim()}
          onClick={handleCreatePipe}
          data-testid="pipe-add-create-pipe"
          style={{
            padding: '6px 12px',
            borderRadius: 4,
            border: `1px solid ${theme.pipeNav.accentBorder}`,
            background: pipeName.trim() ? theme.pipeNav.treeSelected : theme.bg.surface,
            color: pipeName.trim() ? theme.pipeNav.accent : theme.text.muted,
            cursor: pipeName.trim() ? 'pointer' : 'not-allowed',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Create
        </button>
      </div>
    )
  } else if (activeSection === 'existing_pipe') {
    const pipes = Object.values(world.transformerPipes ?? {})
    body = (
      <div
        data-testid="pipe-add-existing-list"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxHeight: 320,
          overflow: 'auto',
        }}
      >
        {pipes.length === 0 ?
          <div style={{ padding: 16, fontSize: 12, color: theme.text.muted, textAlign: 'center' }}>
            No pipes in the project yet.
          </div>
        : pipes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPipe(p)}
              data-testid={`pipe-add-existing-${p.id}`}
              style={{
                padding: '8px 10px',
                textAlign: 'left',
                background: selectedPipe?.id === p.id ? theme.pipeNav.treeSelected : 'transparent',
                border: `1px solid ${theme.pipeNav.accentMuted}`,
                borderRadius: 4,
                color: theme.text.primary,
                cursor: 'pointer',
              }}
            >
              {p.name}
            </button>
          ))
        }
      </div>
    )
    footer = (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" onClick={onClose} style={ghostButtonStyle}>
          Cancel
        </button>
        {selectedPipe ?
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                onAddExistingPipe(selectedPipe, 'linked')
                onClose()
              }}
              data-testid="pipe-add-link"
              style={pipeActionBtn}
            >
              Link
            </button>
            <button
              type="button"
              onClick={() => {
                onAddExistingPipe(selectedPipe, 'copy')
                onClose()
              }}
              data-testid="pipe-add-copy"
              style={pipeActionBtn}
            >
              Copy
            </button>
          </div>
        : null}
      </div>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width={activeSection === 'stage' ? 720 : 480}
      height={activeSection === 'stage' ? 640 : 420}
      minWidth={activeSection === 'stage' ? 480 : 360}
      minHeight={activeSection === 'stage' ? 420 : 280}
      resizable={activeSection === 'stage'}
      subheader={
        sections.length > 1 ?
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sections.map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={activeSection === section}
                data-testid={`pipe-add-tab-${section}`}
                onClick={() => setActiveSection(section)}
                style={sectionTabStyle(activeSection === section)}
              >
                {pipeAddSectionLabel(section)}
              </button>
            ))}
          </div>
        : undefined
      }
      footer={footer ?? undefined}
    >
      {body}
    </Modal>
  )
}

const pipeActionBtn = {
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${theme.pipeNav.accentBorder}`,
  background: 'transparent',
  color: theme.pipeNav.accent,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
} as const
