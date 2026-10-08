// B0: vitest entry for proxy.ts (src/test/avLab/lab.ts uses __dirname, so plain tsx cannot load runScenario; vitest can).
// Skipped unless PROXY_SET is set. Env: PROXY_SET=<set.json|none> PROXY_CASES=a,b,c PROXY_BUDGET=eco|full PROXY_OUT=<file.json>
import fs from 'node:fs'
import { describe, it } from 'vitest'
import { MAZE_CASES } from '@/test/fixtures/avMazeCases'
import { KR_CASES, runKeepRightCase } from './proxy-kr'
import { runMazeCase, runEvasionCase, penalty, type CaseResult } from './proxy'

const set = process.env.PROXY_SET
const run = set ? it : it.skip
describe('maze-profile constraint proxy', () => {
  run('runs the selected cases', async () => {
    const extra: Record<string, unknown> = set !== 'none' ? JSON.parse(fs.readFileSync(set!, 'utf8')) : { mazeProfile: undefined }
    const budget = (process.env.PROXY_BUDGET ?? 'eco') as 'eco' | 'full'
    const wanted = process.env.PROXY_CASES?.split(',')
    const res: CaseResult[] = []
    for (const c of MAZE_CASES) if ((!wanted || wanted.includes(c.name)) && !(c.fullBudgetOnly && budget !== 'full')) res.push(await runMazeCase(c, extra, budget))
    for (const n of wanted ?? []) {
      if (MAZE_CASES.some((c) => c.name === n)) continue
      res.push(KR_CASES.includes(n) ? await runKeepRightCase(n, extra) : await runEvasionCase(n, extra, budget))
    }
    for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name.padEnd(24)} ${(r.wallMs / 1000).toFixed(1)}s pen ${penalty(r).toFixed(2)} ${r.failed.join('; ')}`)
    console.log(`TOTAL wall ${(res.reduce((s, r) => s + r.wallMs, 0) / 1000).toFixed(1)} s, fails ${res.filter((r) => !r.pass).length}/${res.length}`)
    if (process.env.PROXY_OUT) fs.writeFileSync(process.env.PROXY_OUT, JSON.stringify(res, null, 1))
  }, 1_800_000)
})
