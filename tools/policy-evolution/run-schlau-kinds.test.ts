import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ES_CONFIG } from '@/policyEvolution/es'
import { DEFAULT_ISLANDS, initialIslands } from '@/policyEvolution/islands'
import { genomeLengthSchlau } from '@/policyEvolution/schlauPolicy'

// --kinds (creation only, persisted like speedCap) restricts a schlau run to a kind band: the dedicated
// goal_wall wall runs (Auftrag C) pass `--kinds goal_wall`, the shared base run keeps the DEFAULT base band
// (goal_open,goal_box) so goal_wall never mixes into its batch (the WF lesson: a 0-finish blockade kind
// poisons the weakest-link min fitness). A single-kind band forces the stage curriculum off (the stage is a
// goal_open -> rest ramp). These spawn tests pin the runner wiring end-to-end (same pattern as
// unfreeze.test.ts): creation persists kinds + stage, a plain --resume continues the stored band, the flag
// itself is rejected on resume, unknown / bare flags fail loudly before any worker boots.
describe('run-schlau --kinds', () => {
  const run = (args: string[]) =>
    spawnSync('npx', ['tsx', 'tools/policy-evolution/run-schlau.ts', ...args], {
      encoding: 'utf8',
      timeout: 120_000,
    })

  it('a single-kind band (--kinds goal_wall) creates with the stage curriculum OFF and persists the band', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schlau-kinds-'))
    const out = path.join(dir, 'wall.json')
    try {
      const r = run(['--kinds', 'goal_wall', '--gens', '1', '--islands', '1', '--pairs', '1', '--batch', '1', '--workers', '2', '--out', out])
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toMatch(/stage curriculum off: --kinds goal_wall /)
      const file = JSON.parse(fs.readFileSync(out, 'utf8')) as { kinds?: string[]; stage?: unknown }
      expect(file.kinds).toEqual(['goal_wall'])
      expect(file.stage).toBe(null)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 130_000)

  it('a default creation keeps the base band goal_open,goal_box and the stage curriculum', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schlau-kinds-'))
    const out = path.join(dir, 'base.json')
    try {
      const r = run(['--gens', '1', '--islands', '1', '--pairs', '1', '--batch', '1', '--workers', '2', '--out', out])
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).not.toMatch(/stage curriculum off/)
      const file = JSON.parse(fs.readFileSync(out, 'utf8')) as { kinds?: string[]; stage?: { share: number; ema: number; sinceStep: number } | null }
      expect(file.kinds).toEqual(['goal_open', 'goal_box'])
      // staging is ON (the single-kind / no-goal_open bands above get null; the EMA moves within the first gen)
      expect(file.stage).not.toBeNull()
      expect(file.stage!.share).toBe(0)
      expect(typeof file.stage!.ema).toBe('number')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 130_000)

  it('a plain --resume continues the STORED band; --kinds on resume is rejected (creation flag)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schlau-kinds-'))
    const out = path.join(dir, 'wall.json')
    const hidden = 4
    const config = { ...DEFAULT_ES_CONFIG, dim: genomeLengthSchlau(hidden), pairs: 2, seed: 7 }
    const islandsCfg = { ...DEFAULT_ISLANDS, islands: 2 }
    fs.writeFileSync(
      out,
      JSON.stringify({
        schema: 'renn.policy-evolution.schlau/1',
        policy: 'schlau',
        hidden,
        kinds: ['goal_wall'],
        stage: null,
        config,
        islands: islandsCfg,
        state: initialIslands(config, islandsCfg),
        history: [],
      }),
    )
    try {
      const bad = run(['--resume', '--kinds', 'goal_wall', '--gens', '0', '--workers', '2', '--out', out])
      expect(bad.status).not.toBe(0)
      expect(bad.stderr).toMatch(/--kinds is a creation flag/)

      const ok = run(['--resume', '--gens', '0', '--workers', '2', '--out', out])
      expect(ok.status, ok.stderr).toBe(0)
      const stats = JSON.parse(fs.readFileSync(path.join(dir, 'latest-stats.json'), 'utf8')) as { kinds?: string[]; stage?: unknown }
      expect(stats.kinds).toEqual(['goal_wall'])
      expect(stats.stage).toBeUndefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 130_000)

  it('rejects unknown kinds and a bare --kinds flag before any worker boots', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schlau-kinds-'))
    const out = path.join(dir, 'x.json')
    try {
      const bad = run(['--kinds', 'goal_wall,maze', '--gens', '0', '--workers', '2', '--out', out])
      expect(bad.status).not.toBe(0)
      expect(bad.stderr).toMatch(/unknown schlau kind/)
      expect(fs.existsSync(out)).toBe(false)

      const bare = run(['--kinds', '--gens', '0', '--workers', '2', '--out', out])
      expect(bare.status).not.toBe(0)
      expect(bare.stderr).toMatch(/--kinds needs a comma list/)
      expect(fs.existsSync(out)).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 130_000)
})
