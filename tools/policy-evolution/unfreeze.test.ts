import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ISLANDS, initialIslands } from '@/policyEvolution/islands'
import { DEFAULT_ES_CONFIG } from '@/policyEvolution/es'
import { freezeOldMask, genomeLength, N_IN_V2 } from '@/policyEvolution/policy'

// --unfreeze (resume) prints a phase-2 hint. The old hint said "consider a reduced --lr, e.g. 0.01" — but
// --lr is a CREATION flag (the config is only built when the run file does not exist yet), so the advice
// sent the user to an inert flag. This pins the honest wording: the stored config.lr keeps applying, and a
// smaller phase-2 step means editing config.lr in the run file.
describe('run-islands --unfreeze resume message', () => {
  it('names the stored config.lr — not the creation-only --lr flag', () => {
    // a v2 widen-freeze run file: H widened 2 -> 3, everything the old function lives in frozen (phase 1)
    const dim = genomeLength(N_IN_V2, 3)
    const config = { ...DEFAULT_ES_CONFIG, dim, pairs: 2, lr: 0.015, seed: 7, freeze: freezeOldMask(dim, 2) }
    const islandsCfg = { ...DEFAULT_ISLANDS, islands: 2 }
    const runFile = {
      schema: 'renn.policy-evolution.islands/1',
      v2: true,
      config,
      islands: islandsCfg,
      curriculum: null,
      state: initialIslands(config, islandsCfg),
      history: [],
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unfreeze-'))
    const out = path.join(dir, 'run.json')
    fs.writeFileSync(out, JSON.stringify(runFile))
    try {
      const r = spawnSync(
        'npx',
        ['tsx', 'tools/policy-evolution/run-islands.ts', '--resume', '--out', out, '--gens', '0', '--workers', '1', '--unfreeze'],
        { encoding: 'utf8', timeout: 120_000 },
      )
      expect(r.status).toBe(0)
      expect(r.stdout).toMatch(
        /unfreeze: config\.freeze cleared at gen 0 \(phase 2 — all \d+ dims evolve; the stored config\.lr keeps applying — --lr is a creation flag, for a smaller phase-2 step edit config\.lr in the run file\)/,
      )
      // the old misleading advice (an inert flag) must be gone
      expect(r.stdout).not.toMatch(/reduced --lr/)
      // the run file is rewritten per generation, so --gens 0 exits before persisting the cleared mask;
      // the printed hint + clean exit are what is pinned here
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 130_000)
})
