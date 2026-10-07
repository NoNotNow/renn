import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EvolutionEngine, MemoryEvolutionStore, type RunRecord } from '@/avEvolution/core'
import { AV_GENOME_SPEC } from '@/avEvolution/genes'

describe('run.ts --resume with a spec-v2 export', () => {
  it('fails with a gene-spec error instead of silently resuming under v3', async () => {
    const keys = ['t101a', 't101b']
    const baseline = Object.fromEntries(
      keys.map((k) => [k, { key: k, reached: true, exitT: 30, timeoutSec: 60, remainingDist: 0, contactEvents: 0, contactFrames: 0, dt: 1 / 60, minStaticGap: 1, flipped: false, stalledSec: 0, wallMs: 1 }]),
    )
    const engine = new EvolutionEngine({ spec: AV_GENOME_SPEC, trainKeys: keys, baseline, config: { popSize: 4, eliteCount: 2 } })
    const store = new MemoryEvolutionStore()
    const run: RunRecord = {
      runId: 'old-v2',
      createdAt: 1,
      updatedAt: 1,
      specVersion: '2',
      stackVersion: 'x',
      weights: engine.weights,
      config: engine.config,
      spec: { ...AV_GENOME_SPEC, specVersion: '2' },
      trainKeys: engine.trainKeys,
      state: engine.toJSON(),
    }
    await store.saveRun(run)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-resume-'))
    const file = path.join(dir, 'old.json')
    fs.writeFileSync(file, JSON.stringify(await store.exportJSON('old-v2')))
    const before = fs.readFileSync(file, 'utf8')
    const r = spawnSync('npx', ['tsx', 'tools/av-evolution/run.ts', '--resume', file, '--gens', '1', '--workers', '1'], { encoding: 'utf8', timeout: 120000 })
    expect(r.status).not.toBe(0)
    expect(`${r.stdout}${r.stderr}`).toMatch(/gene spec v2.*current spec is v3/)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    fs.rmSync(dir, { recursive: true, force: true })
  }, 130000)
})
