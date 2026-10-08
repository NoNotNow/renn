import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import WorkspaceFloatingDrawer from '@/components/workspace/WorkspaceFloatingDrawer'
import { theme } from '@/config/theme'
import { getAvEvolutionStore } from '@/avEvolution/agent/storeRegistry'
import { DEFAULT_FITNESS_WEIGHTS } from '@/avEvolution/core/fitness'
import type { CandidateRecord, RunRecord } from '@/avEvolution/core/store'
import { defaultWorkerCount, getAvEvolutionController } from '@/avEvolution/browser/workerBackend'

export const AV_EVOLUTION_PANEL_POSITION_STORAGE_KEY = 'rennAvEvolutionPanelPos'

export interface AvEvolutionPanelProps {
  onClose: () => void
  /** Entity the Apply button targets (explicit; nothing is applied implicitly). */
  selectedEntityId: string | null
}

const TOP_N = 8
const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }
const input: CSSProperties = { width: 52, background: 'transparent', color: theme.text.primary, border: `1px solid ${theme.border.default}`, borderRadius: 3, padding: '1px 3px' }
const btn: CSSProperties = { cursor: 'pointer', color: theme.text.primary, background: 'transparent', border: `1px solid ${theme.border.default}`, borderRadius: 3, padding: '1px 6px', fontSize: 11 }
const cell: CSSProperties = { padding: '1px 4px', textAlign: 'right', whiteSpace: 'nowrap' }

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-')

export default function AvEvolutionPanel({ onClose, selectedEntityId }: AvEvolutionPanelProps) {
  const controller = getAvEvolutionController()
  const cs = useSyncExternalStore(
    useCallback((cb) => controller.subscribe(cb), [controller]),
    () => controller.getState(),
  )
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [runId, setRunId] = useState<string>('')
  const [top, setTop] = useState<CandidateRecord[]>([])
  const [pop, setPop] = useState(8)
  const [episodes, setEpisodes] = useState(2)
  const [reversalWeight, setReversalWeight] = useState(DEFAULT_FITNESS_WEIGHTS.wReversal)
  const [reverseSWeight, setReverseSWeight] = useState(DEFAULT_FITNESS_WEIGHTS.wReverseS)
  const [workers, setWorkers] = useState(defaultWorkerCount())
  const [note, setNote] = useState('')

  const refresh = useCallback(async () => {
    let all: RunRecord[]
    try {
      all = (await getAvEvolutionStore().listRuns()).sort((a, b) => b.updatedAt - a.updatedAt)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
      return
    }
    setRuns(all)
    setRunId((cur) => (cur && all.some((r) => r.runId === cur) ? cur : (all[0]?.runId ?? '')))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, cs.persistedTick, cs.runId])

  useEffect(() => {
    if (!runId) {
      setTop([])
      return
    }
    let live = true
    void getAvEvolutionStore()
      .topCandidates(runId, TOP_N, 1)
      .then((t) => live && setTop(t))
      .catch((e) => live && setNote(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [runId, cs.persistedTick])

  const busy = cs.status !== 'idle'
  const selected = runs.find((r) => r.runId === runId)

  const start = async (opts: Parameters<typeof controller.start>[0]) => {
    setNote('')
    try {
      const id = await controller.start(opts)
      setRunId(id)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }

  const apply = async (c: CandidateRecord) => {
    if (!selectedEntityId) return setNote('Select an entity (with an AV pipe) first.')
    const api = window.__rennAvEvolution
    if (!api) return setNote('Agent API not installed.')
    try {
      await api.apply({ runId: c.runId, candidateId: c.id, entityId: selectedEntityId })
      setNote(`Applied ${c.id} to ${selectedEntityId}`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }

  const exportJson = async () => {
    if (!runId) return
    let data
    try {
      data = await getAvEvolutionStore().exportJSON(runId)
    } catch (e) {
      return setNote(e instanceof Error ? e.message : String(e))
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${runId}.av-evolution.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyParams = async (c: CandidateRecord) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(c.params, null, 2))
      setNote(`Copied params of ${c.id}`)
    } catch {
      setNote('Clipboard unavailable')
    }
  }

  return (
    <WorkspaceFloatingDrawer
      title="AV evolution"
      onClose={onClose}
      portalTarget={document.body}
      anchor="top-right"
      positionStorageKey={AV_EVOLUTION_PANEL_POSITION_STORAGE_KEY}
      initialTop={12}
      width={460}
      initialHeight={420}
      resizable
      minWidth={320}
      minHeight={200}
      maxResizeHeight={800}
      testId="av-evolution-panel"
    >
      <div style={{ whiteSpace: 'normal' }}>
        <div style={row}>
          <label>
            pop <input aria-label="Population" style={input} type="number" min={2} value={pop} disabled={busy} onChange={(e) => setPop(Number(e.target.value))} />
          </label>
          <label>
            episodes <input aria-label="Episodes per candidate" style={input} type="number" min={1} value={episodes} disabled={busy} onChange={(e) => setEpisodes(Number(e.target.value))} />
          </label>
          <label>
            rev s <input aria-label="Seconds charged per reversal" style={input} type="number" min={0} step={0.1} value={reversalWeight} disabled={busy} onChange={(e) => setReversalWeight(Number(e.target.value))} />
          </label>
          <label>
            rev-time s/s <input aria-label="Seconds charged per second spent reversing" style={input} type="number" min={0} step={0.05} value={reverseSWeight} disabled={busy} onChange={(e) => setReverseSWeight(Number(e.target.value))} />
          </label>
          <label>
            workers <input aria-label="Workers" style={input} type="number" min={1} value={workers} disabled={busy} onChange={(e) => setWorkers(Number(e.target.value))} />
          </label>
        </div>
        <div style={row}>
          <button style={btn} data-testid="av-evo-new" disabled={busy} onClick={() => void start({ newRun: { popSize: pop, episodesPerEval: episodes, reversalWeight, reverseSecondsWeight: reverseSWeight }, workers })}>
            New run
          </button>
          <button style={btn} data-testid="av-evo-resume" disabled={busy || !selected?.state} onClick={() => void start({ runId, workers })}>
            Resume
          </button>
          <button style={btn} data-testid="av-evo-stop" disabled={cs.status !== 'running'} onClick={() => void controller.stop()}>
            Stop
          </button>
          <select aria-label="Run" value={runId} disabled={busy} onChange={(e) => setRunId(e.target.value)} style={{ ...input, width: 'auto', maxWidth: 170 }}>
            {runs.length === 0 && <option value="">(no runs)</option>}
            {runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                {r.name ?? r.runId}
              </option>
            ))}
          </select>
          <button style={btn} disabled={!runId} onClick={() => void exportJson()}>
            Export JSON
          </button>
        </div>
        <div data-testid="av-evo-status" style={{ marginBottom: 4 }}>
          {cs.status}
          {cs.runId && cs.status !== 'idle' ? ` ${cs.runId}` : ''} | gen {cs.gen >= 0 ? cs.gen : '-'} | episodes {cs.evals} | {f(cs.evalsPerSec)} ep/s
          {cs.last ? ` | best ${f(cs.last.best)} mean ${f(cs.last.mean)}` : ''}
          {cs.status === 'running' && cs.last === null ? ' | evaluating first generation...' : ''}
        </div>
        {(cs.error || note) && <div style={{ color: cs.error ? '#e66' : theme.text.secondary }}>{cs.error ?? note}</div>}
        <table style={{ borderCollapse: 'collapse', width: '100%' }} data-testid="av-evo-top">
          <thead>
            <tr>
              <th style={cell}>id</th>
              <th style={cell}>fitness</th>
              <th style={cell}>exit s</th>
              <th style={cell}>contacts</th>
              <th style={cell}>rev</th>
              <th style={cell}>n</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {top.map((c) => (
              <tr key={c.id} data-testid="av-evo-row">
                <td style={cell}>{c.id}</td>
                <td style={cell}>{f(c.fitness)}</td>
                <td style={cell}>{f(c.meanExitT, 1)}</td>
                <td style={cell}>{f(c.meanContactEvents, 1)}</td>
                <td style={cell}>{c.meanReversals === undefined ? '-' : f(c.meanReversals, 1)}</td>
                <td style={cell}>{c.n}</td>
                <td style={cell}>
                  <button style={btn} title={selectedEntityId ? `Apply to ${selectedEntityId}` : 'Select an entity first'} disabled={!selectedEntityId} onClick={() => void apply(c)}>
                    Apply
                  </button>{' '}
                  <button style={btn} onClick={() => void copyParams(c)}>
                    Copy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {top.length === 0 && <div style={{ color: theme.text.secondary }}>No saved candidates yet.</div>}
      </div>
    </WorkspaceFloatingDrawer>
  )
}
