import { useMemo, useState } from 'react'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { RennWorld } from '@/types/world'
import { theme } from '@/config/theme'
import { describePipeSummary, summarizePipe, type PipeSummary } from '@/utils/pipeSummary'
import type { LibraryPipeSource } from '@/utils/assignLibraryPipe'
import PipeStructurePreview from './PipeStructurePreview'

export interface PipeLibraryPanelProps {
  world: RennWorld
  globalLibrary?: GlobalBehaviorLibrary
  /** Called with the chosen pipe; the host closes its dialog afterwards. */
  onAssign: (source: LibraryPipeSource, pipeId: string, mode: 'linked' | 'copy') => void
}

interface Entry {
  source: LibraryPipeSource
  summary: PipeSummary
}

const actionBtn = {
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${theme.pipeNav.accentBorder}`,
  background: 'transparent',
  color: theme.pipeNav.accent,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
} as const

/** Pick a project pipe or a global-library pipe (search + structure preview); Link shares it, Copy gives an own copy. */
export default function PipeLibraryPanel({ world, globalLibrary, onAssign }: PipeLibraryPanelProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ source: LibraryPipeSource; id: string } | null>(null)

  const { project, global } = useMemo(() => {
    const projReg = { pipes: world.transformerPipes ?? {}, transformers: world.transformers ?? {} }
    const globReg = {
      pipes: globalLibrary?.transformerPipes ?? {},
      transformers: globalLibrary?.transformers ?? {},
    }
    const build = (source: LibraryPipeSource, reg: typeof projReg): Entry[] =>
      Object.keys(reg.pipes)
        .map((id) => summarizePipe(reg, id))
        .filter((s): s is PipeSummary => Boolean(s))
        .map((summary) => ({ source, summary }))
        .sort((a, b) => a.summary.name.localeCompare(b.summary.name))
    return { project: build('project', projReg), global: build('global', globReg) }
  }, [world.transformerPipes, world.transformers, globalLibrary])

  const q = query.trim().toLowerCase()
  const matches = (e: Entry) => !q || e.summary.name.toLowerCase().includes(q) || e.summary.pipeId.toLowerCase().includes(q)
  const shownProject = project.filter(matches)
  const shownGlobal = global.filter(matches)
  const selectedEntry = [...project, ...global].find(
    (e) => selected && e.source === selected.source && e.summary.pipeId === selected.id,
  )

  const section = (label: string, entries: Entry[], emptyText: string, testId: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={testId}>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.pipeNav.accent, textTransform: 'uppercase' }}>
        {label} ({entries.length})
      </div>
      {entries.length === 0 ?
        <div style={{ fontSize: 11, color: theme.text.muted, padding: '4px 0' }}>{emptyText}</div>
      : entries.map((e) => {
          const active = selectedEntry === e
          return (
            <button
              key={`${e.source}:${e.summary.pipeId}`}
              type="button"
              onClick={() => setSelected({ source: e.source, id: e.summary.pipeId })}
              onDoubleClick={() => {
                onAssign(e.source, e.summary.pipeId, 'linked')
              }}
              data-testid={`pipe-library-${e.source}-${e.summary.pipeId}`}
              style={{
                padding: '6px 10px',
                textAlign: 'left',
                background: active ? theme.pipeNav.treeSelected : 'transparent',
                border: `1px solid ${active ? theme.pipeNav.accentBorder : theme.pipeNav.accentMuted}`,
                borderRadius: 4,
                color: theme.text.primary,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>{e.summary.name}</div>
              <div style={{ fontSize: 10, color: theme.text.muted }}>{describePipeSummary(e.summary)}</div>
            </button>
          )
        })
      }
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0 }}>
      <input
        type="search"
        placeholder="Search pipes…"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        data-testid="pipe-library-search"
        style={{
          width: '100%',
          padding: '6px 10px',
          borderRadius: 6,
          background: theme.bg.panelAlt,
          border: `1px solid ${theme.border.default}`,
          color: theme.text.primary,
          fontSize: 12,
        }}
      />
      <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0 }}>
        <div style={{ flex: '1 1 50%', minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {section('In this project', shownProject, q ? 'No match.' : 'No pipes in the project yet.', 'pipe-library-project')}
          {section('Global library', shownGlobal, q ? 'No match.' : 'The global library has no pipes.', 'pipe-library-global')}
        </div>
        <div
          style={{
            flex: '1 1 50%',
            minWidth: 0,
            overflow: 'auto',
            borderLeft: `1px solid ${theme.pipeNav.accentMuted}`,
            paddingLeft: 12,
          }}
        >
          {selectedEntry ?
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary }}>{selectedEntry.summary.name}</div>
              <div style={{ fontSize: 10, color: theme.text.muted, marginBottom: 8 }}>
                {selectedEntry.source === 'global' ? 'Global library · copied into the project on assign' : 'Project pipe'}
                {' · '}
                {describePipeSummary(selectedEntry.summary)}
              </div>
              <PipeStructurePreview nodes={selectedEntry.summary.children} testId="pipe-library-preview" />
              {selectedEntry.summary.paramDefs.length > 0 ?
                <div style={{ marginTop: 10, fontSize: 10, color: theme.text.muted }}>
                  Parameters: {selectedEntry.summary.paramDefs.map((d) => d.key ?? d.label).join(', ')}
                </div>
              : null}
            </>
          : <div style={{ fontSize: 12, color: theme.text.muted }}>Select a pipe to preview its structure.</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          disabled={!selectedEntry}
          title="Share the pipe: edits to it affect every object that links it"
          onClick={() => selectedEntry && onAssign(selectedEntry.source, selectedEntry.summary.pipeId, 'linked')}
          data-testid="pipe-library-link"
          style={{ ...actionBtn, opacity: selectedEntry ? 1 : 0.4 }}
        >
          Link (shared)
        </button>
        <button
          type="button"
          disabled={!selectedEntry}
          title="Give this object its own independent copy"
          onClick={() => selectedEntry && onAssign(selectedEntry.source, selectedEntry.summary.pipeId, 'copy')}
          data-testid="pipe-library-copy"
          style={{ ...actionBtn, opacity: selectedEntry ? 1 : 0.4 }}
        >
          Copy (own)
        </button>
      </div>
    </div>
  )
}
