import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { theme } from '@/config/theme'
import { MAZE_TRAINING_SET, type TrainingMeta, type TrainingSet } from './trainingSets'
import {
  fetchMazeCandidates,
  type MazeCandidate,
  type MazeCandidatesFile,
} from '@/policyEvolution/mazeCandidates'
import {
  getTransformerWatchEntriesForEntity,
  subscribeTransformerWatch,
  type TransformerWatchEntry,
} from '@/runtime/transformerWatchBridge'

const BASE_URL = import.meta.env.BASE_URL || '/'

/** World+route currently loaded and driving in the Builder (drives the live active-vector overlay and live score); shared by all three training sets. */
export interface TrainingLiveRun {
  worldId: string
  routeIndex: number
}

/**
 * Tab bar of the training section of the right sidebar (File → "Training…"): one tab per training set,
 * switching the set through the Builder (`onSelect`). The candidate slot persists per set.
 */
export interface TrainingDialogTabs {
  sets: TrainingSet[]
  activeKey: TrainingSet['key']
  onSelect: (key: TrainingSet['key']) => void
}

export interface MazeTrainingDialogProps {
  /** Which training set the panel serves (worlds, car ids, watch labels, tile texts); default: the training mazes. */
  trainingSet?: TrainingSet
  /** Tab bar of the training section (renders the set tabs). */
  tabs?: TrainingDialogTabs
  /**
   * Loads the example world into the builder focused on the selected route (Builder implements this; the section
   * stays open). `candidate` is the model selected via the dropdown — the Builder swaps the drive-stage
   * weights of the loaded world to it (null = the deployed candidate baked into the export).
   */
  onPlayExampleWorld: (worldId: string, routeIndex: number, candidate: MazeCandidate | null) => void
  /** World+route of the ACTIVE set currently loaded and driving in the Builder (drives the live active-vector overlay and live score). */
  liveRun?: TrainingLiveRun | null
}

interface MazeCardState {
  meta: TrainingMeta | null
  /** meta.json fetch failed (world not exported yet). */
  failed: boolean
}

const initialCardState: MazeCardState = { meta: null, failed: false }

/** Denser translucent strip for the section's header rows over the sidebar background. */
const HEADER_BG_TRANSLUCENT = theme.bg.modalGlassHeader

/** localStorage key suffix of the persisted candidate selection (`<set key>TrainingPanelCandidate`, one slot per set). */
const PANEL_CANDIDATE_KEY = 'TrainingPanelCandidate'

/**
 * Fallback section size for the responsive thumbnails when the section cannot be measured (jsdom tests;
 * a real browser measures through the ResizeObserver immediately). Width matches the right sidebar's
 * persisted default (300px), height a typical full-height section.
 */
const SECTION_FALLBACK_WIDTH = 300
const SECTION_FALLBACK_HEIGHT = 600

/**
 * Vertical panel chrome (header + tab strip + paddings + captions of one expanded tile row) subtracted
 * before the thumbnail height share; ~166px at the default layout.
 */
const TILE_THUMB_CHROME_PX = 166
/** Share of the remaining vertical room the thumbnails claim (≈ the old fixed 8.4em at the default size). */
const TILE_THUMB_HEIGHT_SHARE = 0.42
/** Rough horizontal chrome of one tile row: content/card/tile padding + borders. */
const TILE_THUMB_ROW_CHROME_PX = 56
const TILE_THUMB_GAP_PX = 6
/** Min/max clamps: tiny panels get compact tiles, roomy panels capped ones — no scrollbar hell at either end. */
export const TILE_THUMB_MIN_PX = 40
export const TILE_THUMB_MAX_PX = 176

/**
 * Responsive route-thumbnail height of the expanded tile row, derived from the panel size: a fixed
 * share of the vertical room left after the panel chrome, capped by the width each tile gets in the
 * row (the portrait tiles are width-bound). Small when vertical space is scarce, larger with room.
 */
export function routeTileThumbHeightPx(panelWidth: number, panelHeight: number, tileCount: number): number {
  const tiles = Math.max(1, tileCount)
  const byHeight = (panelHeight - TILE_THUMB_CHROME_PX) * TILE_THUMB_HEIGHT_SHARE
  const perTileWidth = (panelWidth - TILE_THUMB_ROW_CHROME_PX - (tiles - 1) * TILE_THUMB_GAP_PX) / tiles
  const byWidth = perTileWidth * 1.15
  const height = Math.min(byHeight, byWidth)
  return Math.round(Math.max(TILE_THUMB_MIN_PX, Math.min(TILE_THUMB_MAX_PX, height)))
}

/** meta.json url of one training world (same layout for both sets: public/exampleWorlds/<id>/meta.json). */
function trainingMetaUrl(spec: { id: string }): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/meta.json`
}

/** Per-tile image (clicking a tile in the expanded row starts the run on that way). */
function trainingTileUrl(spec: { id: string }, tileIndex: number): string {
  return `${BASE_URL}exampleWorlds/${encodeURIComponent(spec.id)}/route_${tileIndex}.svg`
}

function bestScoreLabel(meta: TrainingMeta): string {
  return meta.bestScore == null ? 'Best: —' : `Best: ${meta.bestScore} pts`
}

interface MazeLiveWatchState {
  score: number | null
  seg: number | null
}

const EMPTY_LIVE_WATCH: MazeLiveWatchState = { score: null, seg: null }

/** Parses the focused car's watch entries (score = "123 pts", seg = "3") into a stable live snapshot; labels are per training set. */
function parseLiveWatchEntries(entries: readonly TransformerWatchEntry[], watch: TrainingSet['watch']): MazeLiveWatchState {
  let score: number | null = null
  let seg: number | null = null
  for (const entry of entries) {
    if (entry.label === watch.score) {
      const match = /([\d.]+)/.exec(entry.value)
      if (match) score = Number(match[1])
    } else if (entry.label === watch.seg) {
      const parsed = Number(entry.value)
      if (Number.isFinite(parsed)) seg = parsed
    }
  }
  return { score, seg }
}

/** Route's own best headless score; "Score: —" when null or when the meta predates the tileSvg field. */
function routeScoreLabel(meta: TrainingMeta, routeIndex: number): string {
  const score = meta.tileSvg?.routes[routeIndex]?.score
  return score == null ? 'Score: —' : `Score: ${score} pts`
}

/**
 * Row-level weakest link: the WORST per-route score of the world — the minimum over the measured routes, i.e.
 * the way the candidate fails at (the v3 fitness ranks exactly this weakest link, so the row shows directly
 * where training is stuck). Includes the 1-based way number so the culprit route is visible without expanding
 * the row. Routes without a measured score (older exports) are ignored; no tileSvg / nothing measured -> null.
 */
function worstRouteScore(meta: TrainingMeta): { score: number; way: number } | null {
  const routes = meta.tileSvg?.routes
  if (!routes) return null
  let worst: { score: number; way: number } | null = null
  for (let i = 0; i < routes.length; i++) {
    const score = routes[i]?.score
    if (score == null) continue
    if (!worst || score < worst.score) worst = { score, way: i + 1 }
  }
  return worst
}

/** "Worst: 23 pts · way 2" / "Worst: 12 pts · chain 3"; "Worst: —" when no tile score is available. */
function worstScoreLabel(meta: TrainingMeta, noun: string): string {
  const worst = worstRouteScore(meta)
  return worst == null ? 'Worst: —' : `Worst: ${worst.score} pts · ${noun} ${worst.way}`
}

/**
 * Green→red hue mapper of every health dot: `worst ÷ best` (weakest link ÷ ceiling) with 1 = green (the stuck
 * routes score as well as the best), 0 = red (stuck at zero) and >1 clamping to green (the two sides count
 * different route sets). Gray while either side is unmeasured.
 */
function healthHueColor(best: number | null, worst: number | null): string {
  if (best == null || worst == null || best <= 0) return theme.text.muted
  const health = Math.max(0, Math.min(1, worst / best))
  return `hsl(${Math.round(health * 120)}, 75%, 45%)`
}

/**
 * Mean of the measured values, rounded to an integer (null when nothing is measured) — the header
 * best/worst figures are AVERAGES without decimal places.
 */
function meanRound(values: Array<number | null | undefined>): number | null {
  const measured = values.filter((v): v is number => v != null && Number.isFinite(v))
  return measured.length > 0 ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length) : null
}

/**
 * Header health dot color: the weakest-link aggregate as one glance — Ø Worst ÷ Ø Best (ratio 1 = every run's
 * stuck route scores as well as its best = green, 0 = stuck at zero = red; >1 clamping to green since the means
 * count different route sets). Gray while either side is unmeasured.
 */
function headerHealthColor(avgBest: number | null, avgWorst: number | null): string {
  return healthHueColor(avgBest, avgWorst)
}

/**
 * Row health dot color: the run's own weakest link — worst route score ÷ best score on the green→red hue
 * scale (1 = the stuck route scores as well as the run's best = green, 0 = stuck at zero = red). Gray while
 * either side is unmeasured.
 */
function rowHealthColor(meta: TrainingMeta): string {
  return healthHueColor(meta.bestScore, worstRouteScore(meta)?.score ?? null)
}

/** Min over the measured route scores of a candidate's per-world score snapshot; null when nothing is measured. */
function candidateWorstRoute(routes: Array<number | null>): number | null {
  const measured = routes.filter((s): s is number => s != null)
  return measured.length > 0 ? Math.min(...measured) : null
}

/**
 * Row health dot under the SELECTED candidate's headless scores — same weakest-link ratio as the deployed-side
 * `rowHealthColor`, but from the candidate's per-world snapshot. Gray when that world has no scores (older
 * deploy or a world the scoring pass did not cover).
 */
function candidateRowHealthColor(candidate: MazeCandidate, worldId: string): string {
  const s = candidate.scores?.[worldId]
  if (!s) return theme.text.muted
  return healthHueColor(s.best, candidateWorstRoute(s.routes))
}

/**
 * Live active-vector overlay for the focused route's thumbnail: the route's chain polyline dimmed, plus the
 * segment the run currently drives as a glowing halo+core stroke. Pure render of the parsed live watch state.
 */
function LiveRouteVectorOverlay({
  tileSvg,
  routeIndex,
  seg,
  testId,
}: {
  tileSvg: NonNullable<TrainingMeta['tileSvg']>
  routeIndex: number
  seg: number | null
  testId: string
}) {
  const route = tileSvg.routes[routeIndex]
  if (!route || route.pts.length < 2) return null
  const pts = route.pts
  const chainPoints = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const segIndex = seg != null && Number.isFinite(seg) && seg >= 0 && seg + 1 < pts.length ? seg : null
  const from = segIndex != null ? pts[segIndex] : null
  const to = segIndex != null ? pts[segIndex + 1] : null
  return (
    <svg
      data-testid={testId}
      viewBox={`0 0 ${tileSvg.w} ${tileSvg.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <polyline
        points={chainPoints}
        fill="none"
        stroke={theme.text.muted}
        strokeWidth={1.5}
        opacity={0.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {from && to ? (
        <>
          <line
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            stroke={theme.accent}
            strokeWidth={6}
            opacity={0.35}
            strokeLinecap="round"
          />
          <line
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            stroke={theme.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </>
      ) : null}
    </svg>
  )
}

function readStoredJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function persistJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

export default function MazeTrainingDialog({ trainingSet = MAZE_TRAINING_SET, tabs, onPlayExampleWorld, liveRun = null }: MazeTrainingDialogProps) {
  // per-set localStorage slot (`mazeTrainingPanelCandidate` for the mazes, `crux...` for the crux, ...):
  // the selected model persists per set (the model dropdown is the same list in every set, but the choice is per set).
  const candidateStorageKey = `${trainingSet.key}${PANEL_CANDIDATE_KEY}`
  const [cardStates, setCardStates] = useState<Record<string, MazeCardState>>(() =>
    Object.fromEntries(trainingSet.worlds.map((spec) => [spec.id, initialCardState])),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Run row whose full-width thumbnail is expanded (one at a time; null = all rows single-line). */
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  /** Route tile per world that started the run (the accent border marks the started way; default route 0). */
  const [selectedRoutes, setSelectedRoutes] = useState<Record<string, number>>({})
  /** Candidate model selected via the dropdown (null = the deployed candidate baked into the export); persisted. */
  const [candidateId, setCandidateId] = useState<string | null>(() => readStoredJson(candidateStorageKey) as string | null)
  const [candidatesFile, setCandidatesFile] = useState<MazeCandidatesFile | null>(null)

  // Live watch of the focused route's car (the set's watch labels, published by the in-world score stage).
  // The snapshot must be referentially stable between publishes: the derived value is cached in a ref keyed by
  // the entity + the entries array identity (the bridge hands out a stable array between publishes).
  const liveCarId = liveRun != null ? trainingSet.carId(liveRun.routeIndex) : null
  const liveWatchRef = useRef<{ carId: string | null; entries: readonly TransformerWatchEntry[]; value: MazeLiveWatchState }>({
    carId: null,
    entries: [],
    value: EMPTY_LIVE_WATCH,
  })
  const getLiveWatchSnapshot = useCallback((): MazeLiveWatchState => {
    if (liveCarId == null) return EMPTY_LIVE_WATCH
    const entries = getTransformerWatchEntriesForEntity(liveCarId)
    const cached = liveWatchRef.current
    if (cached.carId === liveCarId && cached.entries === entries) return cached.value
    const value = parseLiveWatchEntries(entries, trainingSet.watch)
    liveWatchRef.current = { carId: liveCarId, entries, value }
    return value
  }, [liveCarId, trainingSet.watch])
  const liveWatch = useSyncExternalStore(subscribeTransformerWatch, getLiveWatchSnapshot)

  // Section size for the responsive route thumbnails: the section fills the right sidebar's tab area, so
  // the thumbnails scale with the measured element (ResizeObserver in the browser; jsdom tests keep the
  // sidebar-default fallback below — a real measurement replaces it on the first callback).
  const sectionRef = useRef<HTMLDivElement>(null)
  const [sectionSize, setSectionSize] = useState<{ width: number; height: number }>({
    width: SECTION_FALLBACK_WIDTH,
    height: SECTION_FALLBACK_HEIGHT,
  })
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSectionSize((prev) =>
          prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height },
        )
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    for (const spec of trainingSet.worlds) {
      fetch(trainingMetaUrl(spec), { cache: 'no-cache' })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status))
          return (await res.json()) as TrainingMeta
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
  }, [trainingSet.worlds])

  // Candidate models (island centers / best / shipped) exported next to the worlds; chips render only when the
  // file exists. A persisted selection that the file no longer lists is dropped (stale id after a re-export).
  useEffect(() => {
    let cancelled = false
    fetchMazeCandidates(BASE_URL).then((file) => {
      if (!cancelled) {
        setCandidatesFile(file)
        if (file) {
          setCandidateId((prev) => (prev && file.candidates.some((c) => c.id === prev) ? prev : null))
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedCandidate = useMemo(
    () => candidatesFile?.candidates.find((c) => c.id === candidateId) ?? null,
    [candidatesFile, candidateId],
  )

  const handleCardClick = useCallback((id: string) => {
    setSelectedId(id)
    setExpandedRowId((prev) => (prev === id ? null : id))
  }, [])

  /** Clicking a route tile starts the run on that way (kept selected so the accent border marks the started way). */
  const handleTileClick = useCallback(
    (worldId: string, routeIndex: number) => {
      setSelectedId(worldId)
      setSelectedRoutes((prev) => ({ ...prev, [worldId]: routeIndex }))
      onPlayExampleWorld(worldId, routeIndex, selectedCandidate)
    },
    [onPlayExampleWorld, selectedCandidate],
  )

  /**
   * Dropdown change selects the candidate model (the empty first option returns to the deployed candidate).
   * While a run is live, the change re-loads that world+route with the new model right away; otherwise the
   * selection applies to the next tile click.
   */
  const handleCandidateSelect = useCallback(
    (id: string) => {
      const next = id === '' ? null : id
      setCandidateId(next)
      persistJson(candidateStorageKey, next)
      const candidate = next ? candidatesFile?.candidates.find((c) => c.id === next) ?? null : null
      if (liveRun) onPlayExampleWorld(liveRun.worldId, liveRun.routeIndex, candidate)
    },
    [candidatesFile, liveRun, onPlayExampleWorld, candidateStorageKey],
  )

  const handleThumbError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none'
  }, [])

  // Candidates-row best/worst (weakest link at a glance): the MEAN of every run's best score and of its worst
  // route score, rounded to integers (no decimals). Both figures follow the SELECTED dropdown model (its
  // headless per-world scores, scored by export-maze-candidates.ts over this same training set); without a
  // selection they describe the deployed candidate baked into the exports. Unmeasured values (null,
  // not-yet-fetched) are skipped; nothing renders while no side is measured at all.
  const metas = trainingSet.worlds.map((spec) => cardStates[spec.id]?.meta).filter((m): m is TrainingMeta => m != null)
  let avgBest = meanRound(metas.map((m) => m.bestScore))
  let avgWorst = meanRound(metas.map((m) => worstRouteScore(m)?.score ?? null))
  if (selectedCandidate) {
    const entries = selectedCandidate.scores
      ? trainingSet.worlds.map((spec) => selectedCandidate.scores?.[spec.id]).filter((s): s is { best: number; routes: Array<number | null> } => s != null)
      : []
    avgBest = meanRound(entries.map((s) => s.best))
    avgWorst = meanRound(entries.map((s) => candidateWorstRoute(s.routes)))
  }
  const totalsLine =
    avgBest != null || avgWorst != null
      ? `${avgBest != null ? `Ø Best: ${avgBest} pts` : 'Ø Best: —'} · ${avgWorst != null ? `Ø Worst: ${avgWorst} pts` : 'Ø Worst: —'}`
      : null
  // keep the averages visible while a dropdown model is active even before its scores arrive:
  // the dot goes gray and the figures show em dashes until the candidate is scored.
  const showHeaderStats = totalsLine != null || selectedCandidate != null
  const healthTitle = selectedCandidate
    ? `Weakest-link health of the SELECTED candidate (${selectedCandidate.label}${selectedCandidate.scoredGen != null ? ` · scored gen ${selectedCandidate.scoredGen}` : ''}): Ø worst ÷ Ø best of its headless scores — green = the stuck routes score as well as the best runs, red = stuck at zero, gray = not scored yet`
    : 'Weakest-link health of the deployed candidate: Ø Worst ÷ Ø Best — green = the stuck routes score as well as the best runs, red = stuck at zero, gray = not measured yet'

  // The model dropdown + Ø figures row: its own line under the title line (hidden entirely when there is
  // nothing to show — no candidates and no measured averages).
  const hasCandidates = candidatesFile != null && candidatesFile.candidates.length > 0
  const showCandidatesRow = hasCandidates || showHeaderStats

  return (
    <div
      ref={sectionRef}
      data-testid={`${trainingSet.testid}-training-panel`}
      aria-label={trainingSet.title}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        data-testid={`${trainingSet.testid}-training-panel-header`}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          background: HEADER_BG_TRANSLUCENT,
          borderBottom: `1px solid ${theme.border.default}`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, whiteSpace: 'nowrap' }}>
          {trainingSet.title}
        </span>
        <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>
          {trainingSet.worlds.length} runs
        </span>
      </div>

      {/* training section: one tab per training set (the tab content is the set below) */}
      {tabs ? (
        <div
          data-testid="training-tabs"
          role="tablist"
          aria-label="Training sets"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            padding: '2px 8px 4px 8px',
            background: HEADER_BG_TRANSLUCENT,
            borderBottom: `1px solid ${theme.border.default}`,
          }}
        >
          {tabs.sets.map((set) => {
            const active = set.key === tabs.activeKey
            return (
              <button
                key={set.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`training-tab-${set.key}`}
                title={set.title}
                onClick={() => {
                  if (!active) tabs.onSelect(set.key)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? theme.accent : 'transparent'}`,
                  color: active ? theme.text.primary : theme.text.muted,
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  lineHeight: 1,
                  padding: '4px 8px',
                  cursor: active ? 'default' : 'pointer',
                }}
              >
                {set.tab}
              </button>
            )
          })}
        </div>
      ) : null}

      {/* model dropdown + Ø figures: their OWN row under the header — one select lists every exported
          candidate (the deployed export is the first option); hidden entirely when there is nothing to show */}
      {showCandidatesRow ? (
        <div
          data-testid={`${trainingSet.testid}-training-candidates-row`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            padding: '3px 8px',
            background: HEADER_BG_TRANSLUCENT,
            borderBottom: `1px solid ${theme.border.default}`,
            overflow: 'hidden',
          }}
        >
          {hasCandidates ? (
            <select
              data-testid={`${trainingSet.testid}-training-candidates`}
              aria-label="Candidate model"
              title="Candidate models: the dropdown swaps the driving net of the loaded world (the exported file keeps the deployed best). The per-run rows describe the DEPLOYED candidate; the row averages follow the selected model."
              value={selectedCandidate?.id ?? ''}
              onChange={(e) => handleCandidateSelect(e.target.value)}
              style={{
                background: theme.bg.surface,
                border: `1px solid ${selectedCandidate ? theme.accent : theme.border.default}`,
                color: selectedCandidate ? theme.accent : theme.text.secondary,
                fontSize: 11,
                lineHeight: 1.2,
                padding: '2px 4px',
                borderRadius: 4,
                cursor: 'pointer',
                maxWidth: 160,
                minWidth: 0,
                flexShrink: 1,
              }}
            >
              <option value="" data-testid={`${trainingSet.testid}-training-candidate-option-deployed`}>
                Deployed (export)
              </option>
              {candidatesFile.candidates.map((candidate) => (
                <option
                  key={candidate.id}
                  value={candidate.id}
                  data-testid={`${trainingSet.testid}-training-candidate-option-${candidate.id}`}
                  title={`${candidate.detail}${candidate.gen != null ? ` · gen ${candidate.gen}` : ''}${candidate.scoredGen != null ? ` · scored gen ${candidate.scoredGen}` : ''}`}
                >
                  {candidate.label}
                </option>
              ))}
            </select>
          ) : null}
          {showHeaderStats ? (
            <>
              <span
                data-testid={`${trainingSet.testid}-training-header-health`}
                aria-hidden={true}
                title={healthTitle}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: headerHealthColor(avgBest, avgWorst),
                }}
              />
              {totalsLine ? (
                <span
                  data-testid={`${trainingSet.testid}-training-header-totals`}
                  title="Averages across the runs: mean of each run's best score and mean of its worst route score (the stuck routes) — follows the selected model"
                  style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}
                >
                  {totalsLine}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {trainingSet.worlds.map((spec) => {
          const state = cardStates[spec.id] ?? initialCardState
          const meta = state.meta
          const exported = !state.failed && meta != null
          const selected = selectedId === spec.id
          const rowExpanded = expandedRowId === spec.id && exported
          // thumbnails scale with the section (sidebar width + available height); clamped 40-176px
          const tileCount = rowExpanded && meta ? trainingSet.tileCount(meta) : 0
          const thumbHeight = `${routeTileThumbHeightPx(sectionSize.width, sectionSize.height, tileCount)}px`
          return (
            <div
              key={spec.id}
              data-testid={`${trainingSet.testid}-training-card-${spec.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: rowExpanded ? 6 : 0,
                background: theme.bg.section,
                border: `1px solid ${selected ? theme.button.pickBorder : theme.border.default}`,
                borderRadius: 8,
              }}
            >
              <div
                data-testid={`${trainingSet.testid}-training-row-${spec.id}`}
                role="button"
                tabIndex={0}
                aria-label={spec.name}
                aria-pressed={selected}
                aria-expanded={rowExpanded}
                onClick={() => handleCardClick(spec.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleCardClick(spec.id)}
                title={exported ? 'Click to show/hide the run thumbnail' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden={true}
                  style={{
                    color: theme.text.muted,
                    fontSize: 10,
                    transform: rowExpanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  &#9662;
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, whiteSpace: 'nowrap' }}>
                  {spec.name}
                </span>
                <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>{spec.info}</span>
                <div style={{ flex: 1 }} />
                {exported && meta ? (
                  <>
                    <span
                      data-testid={`${trainingSet.testid}-training-row-health-${spec.id}`}
                      aria-hidden={true}
                      title={
                        selectedCandidate
                          ? `Weakest-link health of the SELECTED candidate (${selectedCandidate.label}): the run's worst route score ÷ its best under that model — green = the stuck route scores as well as the run's best, red = stuck at zero, gray = not scored yet`
                          : "Weakest-link health: the run's worst route score ÷ its best score — green = the stuck route scores as well as the run's best, red = stuck at zero, gray = not measured yet"
                      }
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: selectedCandidate ? candidateRowHealthColor(selectedCandidate, spec.id) : rowHealthColor(meta),
                      }}
                    />
                    <span style={{ fontSize: 11, color: theme.text.secondary, whiteSpace: 'nowrap' }}>
                      {bestScoreLabel(meta)}
                    </span>
                    <span style={{ fontSize: 11, color: theme.text.secondary, whiteSpace: 'nowrap' }}>
                      {worstScoreLabel(meta, trainingSet.noun)}
                    </span>
                    {trainingSet.badge(meta) ? (
                      <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>
                        {trainingSet.badge(meta)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>not exported yet</span>
                )}
              </div>
              {rowExpanded && meta ? (
                <div style={{ padding: '0 8px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                    {Array.from({ length: tileCount }, (_, i) => {
                      const tile = trainingSet.tileText(meta, i)
                      const tileSelected = (selectedRoutes[spec.id] ?? 0) === i
                      const isLiveTile = liveRun != null && liveRun.worldId === spec.id && liveRun.routeIndex === i
                      return (
                        <div
                          key={i}
                          data-testid={`${trainingSet.testid}-training-route-tile-${spec.id}-${i}`}
                          role="button"
                          tabIndex={0}
                          aria-pressed={tileSelected}
                          aria-label={`${spec.name} ${tile.name.toLowerCase()} (${tile.long})`}
                          title={`${tile.name} (${tile.long}) — start the run on this ${trainingSet.noun}`}
                          onClick={() => handleTileClick(spec.id, i)}
                          onKeyDown={(e) => e.key === 'Enter' && handleTileClick(spec.id, i)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: 3,
                            background: theme.bg.surface,
                            border: `2px solid ${tileSelected ? theme.accent : theme.border.default}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                          }}
                        >
                          <div style={{ position: 'relative', width: '100%', height: thumbHeight }}>
                            <img
                              data-testid={`${trainingSet.testid}-training-thumb-${spec.id}-${i}`}
                              src={trainingTileUrl(spec, i)}
                              alt={`${spec.name} ${tile.name.toLowerCase()} (${tile.long}) thumbnail (all guidance vectors)`}
                              style={{ width: '100%', height: thumbHeight, display: 'block', objectFit: 'contain', borderRadius: 4 }}
                              onError={handleThumbError}
                            />
                            {isLiveTile && meta.tileSvg ? (
                              <LiveRouteVectorOverlay
                                tileSvg={meta.tileSvg}
                                routeIndex={i}
                                seg={liveWatch.seg}
                                testId={`${trainingSet.testid}-training-live-vector-${spec.id}-${i}`}
                              />
                            ) : null}
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              color: tileSelected ? theme.accent : theme.text.muted,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {tileSelected ? '\u25B8 ' : ''}{tile.name} {tile.short}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: theme.text.muted,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {routeScoreLabel(meta, i)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 11, color: theme.text.secondary }}>{meta.candidate.label}</span>
                    {liveRun != null && liveRun.worldId === spec.id ? (
                      <span style={{ fontSize: 11, color: theme.accent, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {liveWatch.score == null ? 'Live: -' : `Live: ${liveWatch.score} pts`}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
