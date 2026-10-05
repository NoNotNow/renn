/* Scratch table of the passing side per scenario: AV_KR=1 [AV_PARAMS='{"passSide":"right"}'] npx vitest run src/test/scenarios/av-keep-right.diagnostic.test.ts */
import { it } from 'vitest'
import { CORRIDOR_14, fmtPass, runFacingPair, runOncoming } from '@/test/fixtures/avKeepRight'

it.skipIf(!process.env.AV_KR)('keep-right table', async () => {
  const rows: string[] = []
  const cases = [
    { name: 'open', offset: 0 },
    { name: 'open off-left 1.5', offset: -1.5 },
    { name: 'open off-right 1.5', offset: 1.5 },
    { name: 'open goal-left', offset: 0, goalX: -15 },
    { name: 'open goal-right', offset: 0, goalX: 15 },
    { name: 'corridor', offset: 0, boxes: CORRIDOR_14, cruise: 14, puppetSpeed: 8, carSpeed: 10 },
    { name: 'corridor off-left 1.5', offset: -1.5, boxes: CORRIDOR_14, cruise: 14, puppetSpeed: 8, carSpeed: 10 },
    { name: 'corridor off-right 1.5', offset: 1.5, boxes: CORRIDOR_14, cruise: 14, puppetSpeed: 8, carSpeed: 10 },
  ]
  for (const c of cases.filter((x) => !process.env.AV_KR_CASE || x.name === process.env.AV_KR_CASE)) rows.push(`${c.name.padEnd(24)} ${fmtPass(await runOncoming(c))}`)
  if (process.env.AV_KR_CASE) return void console.log(rows.join('\n'))
  const p = await runFacingPair()
  rows.push(`pair open A: ${fmtPass(p.a)}`, `pair open B: ${fmtPass(p.b)}`)
  console.log(`\nKEEP RIGHT ${process.env.AV_PARAMS ?? '(default)'}\n${rows.join('\n')}\n`)
}, 600_000)
