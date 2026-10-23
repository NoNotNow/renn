/**
 * watch-schlau-best: keeps `public/policy-evolution/schlau-candidates.json` in step with the ACTIVE schlau
 * training run's latest-best.json — the FAST export path (export-schlau-candidates.ts --fast): every new best
 * becomes selectable in the training dialog's model picker on the local dev site within seconds, WITHOUT the
 * minutes-slow headless scoring of the full export (which the standing rule still runs for scored candidates
 * and deploys). Run alongside the training:
 *
 *   caffeinate -is npx tsx tools/policy-evolution/watch-schlau-best.ts [latestBestFile]
 *                                            # default: test-results/policy-evolution/latest-best.json
 *
 * Polls (2 s) instead of fs.watch: robust against the runner replacing the file, no dependencies. Each change
 * must stay stable for the debounce window (1.5 s) before the fast export runs — a latest-best that keeps
 * changing is applied once it settles. A failed apply (a racing full export caught mid-write) is RETRIED on
 * every later poll until it succeeds. Exit with Ctrl-C; the exported candidates file stays as-is.
 */
import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..')

const POLL_MS = 2000
const DEBOUNCE_MS = 1500

/** mtime+size signature of a file; null when it does not exist (nothing to fast-export). */
export function fileSignature(path: string): string | null {
  try {
    const st = statSync(path)
    return `${st.mtimeMs}/${st.size}`
  } catch {
    return null
  }
}

export type SchlauBestWatchTick = 'idle' | 'waiting' | 'applied' | 'retry'

/**
 * Pure poll-driven state machine of the watcher (no fs, no timers — fully unit-testable):
 * `tick(now)` with a monotonic clock returns
 * - 'idle': the signature matches the last APPLIED one, or the file is missing
 * - 'waiting': the signature changed but has not been stable for `debounceMs` yet
 * - 'applied': the debounced change was applied (the watcher's poll loop logs the fast export's result)
 * - 'retry': apply failed (a racing writer caught mid-write) — every later tick retries it
 */
export function createSchlauBestWatcher(opts: {
  readSignature: () => string | null
  apply: () => 'applied' | 'retry'
  debounceMs: number
}): { tick: (now: number) => SchlauBestWatchTick } {
  let applied: string | null = null
  let pending: string | null = null
  let pendingSince = 0
  return {
    tick(now) {
      const sig = opts.readSignature()
      if (sig == null || sig === applied) {
        pending = null
        return 'idle'
      }
      if (sig !== pending) {
        pending = sig
        pendingSince = now
        return 'waiting'
      }
      if (now - pendingSince < opts.debounceMs) return 'waiting'
      if (opts.apply() === 'applied') {
        applied = sig
        pending = null
        return 'applied'
      }
      return 'retry'
    },
  }
}

// the poll loop runs only when this file is the executed script — the unit tests import the pure parts above.
const invokedDirectly = process.argv[1] != null && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  const latestBestPath = resolve(root, process.argv[2] ?? 'test-results/policy-evolution/latest-best.json')
  const outPath = resolve(root, 'public/policy-evolution/schlau-candidates.json')
  console.log(
    `watching ${latestBestPath.slice(root.length + 1)} -> ${outPath.slice(root.length + 1)} (poll ${POLL_MS} ms, debounce ${DEBOUNCE_MS} ms; fast export of every new best)`,
  )
  // dynamic: keeps the watcher module free of the full exporter's heavy imports for its unit tests
  const { runFastExport } = await import('./export-schlau-candidates')
  const watcher = createSchlauBestWatcher({
    readSignature: () => fileSignature(latestBestPath),
    apply: () => {
      const result = runFastExport({ latestBestPath, outPath })
      console.log(`${new Date().toISOString()} ${result.status}: ${result.detail}`)
      return result.status === 'skipped' ? 'retry' : 'applied'
    },
    debounceMs: DEBOUNCE_MS,
  })
  setInterval(() => {
    watcher.tick(Date.now())
  }, POLL_MS)
}
