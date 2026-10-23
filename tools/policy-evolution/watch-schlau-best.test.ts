/**
 * Unit tests of watch-schlau-best's pure poll state machine (createSchlauBestWatcher): debounce until the
 * latest-best signature is stable, apply once, retry a failed apply on every later tick, and go quiet while
 * the file is missing. No real fs events or timers — the signature and the clock are injected.
 */
import { describe, expect, it } from 'vitest'
import { createSchlauBestWatcher, type SchlauBestWatchTick } from './watch-schlau-best'

function fixture(opts: { signature: string | null; results?: Array<'applied' | 'retry'> }) {
  let signature = opts.signature
  const results = [...(opts.results ?? ['applied'])]
  const applies: number[] = []
  const watcher = createSchlauBestWatcher({
    readSignature: () => signature,
    apply: () => {
      applies.push(applies.length)
      return results.shift() ?? 'applied'
    },
    debounceMs: 1500,
  })
  return {
    watcher,
    applies: () => applies.length,
    setSignature: (next: string | null) => {
      signature = next
    },
  }
}

describe('createSchlauBestWatcher', () => {
  it('bootstraps: the existing latest-best applies after the debounce window, once', () => {
    const f = fixture({ signature: 'a' })
    expect(f.watcher.tick(0)).toBe('waiting')
    expect(f.watcher.tick(1000)).toBe('waiting') // still inside the debounce window
    expect(f.watcher.tick(1600)).toBe('applied')
    expect(f.applies()).toBe(1)
    expect(f.watcher.tick(4000)).toBe('idle') // unchanged signature: quiet forever
    expect(f.applies()).toBe(1)
  })

  it('re-debounces on every change: rapid changes apply once they settle', () => {
    const f = fixture({ signature: 'a' })
    f.watcher.tick(0)
    f.setSignature('b')
    expect(f.watcher.tick(1000)).toBe('waiting') // the debounce window RESTARTS on the change
    f.setSignature('c')
    expect(f.watcher.tick(2000)).toBe('waiting') // 'c' is itself not stable for 1500 ms yet
    expect(f.watcher.tick(3600)).toBe('applied')
    expect(f.applies()).toBe(1)
  })

  it('retries a failed apply (a racing full export caught mid-write) on every later tick until it succeeds', () => {
    const f = fixture({ signature: 'a', results: ['retry', 'retry', 'applied'] })
    expect(f.watcher.tick(2000)).toBe('waiting')
    expect(f.watcher.tick(4000)).toBe('retry')
    expect(f.watcher.tick(6000)).toBe('retry')
    expect(f.watcher.tick(8000)).toBe('applied')
    expect(f.applies()).toBe(3)
    expect(f.watcher.tick(10000)).toBe('idle')
  })

  it('goes quiet while latest-best is missing and applies again when it reappears changed', () => {
    const f = fixture({ signature: 'a' })
    f.watcher.tick(0)
    f.watcher.tick(2000)
    expect(f.applies()).toBe(1)
    f.setSignature(null)
    expect(f.watcher.tick(4000)).toBe<SchlauBestWatchTick>('idle')
    expect(f.watcher.tick(6000)).toBe('idle')
    f.setSignature('b')
    expect(f.watcher.tick(8000)).toBe('waiting')
    expect(f.watcher.tick(10000)).toBe('applied')
    expect(f.applies()).toBe(2)
  })

  it('stays idle from the start when there is no latest-best yet', () => {
    const f = fixture({ signature: null })
    expect(f.watcher.tick(0)).toBe('idle')
    expect(f.watcher.tick(100000)).toBe('idle')
    expect(f.applies()).toBe(0)
  })
})
