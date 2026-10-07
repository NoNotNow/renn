/* Scratch: self_hunt_flexible with passSide off vs as shipped (right + passIgnoreIds), catches / mean speed of the fleeing AV.
 * AV_KRH=1 AV_KRH_SEEDS=1,2 AV_KRH_FRAMES=1200 npx vitest run src/test/scenarios/av-keep-right-hunt.diagnostic.test.ts */
import { it } from 'vitest'
import { loadLabWorld, runLab, watchValues } from '@/test/avLab/lab'

const FOCUS = 'entity_1779823253285_brtkx1p'

it.skipIf(!process.env.AV_KRH)('hunt: passSide off vs shipped', async () => {
  const rows: string[] = []
  for (const seed of (process.env.AV_KRH_SEEDS ?? '1,2').split(',').map(Number)) {
    for (const mode of ['off', 'shipped'] as const) {
      const ref = { exampleId: 'self_hunt_flexible' }
      const world = loadLabWorld(ref)
      if (mode === 'off') {
        for (const e of world.entities) {
          const b = e.transformerPipeStack?.[0]
          if (b?.pipeId === 'global_av_autopilot' && b.params) b.params.passSide = 'off'
        }
      }
      let passFrames = 0
      const first: string[] = []
      const r = await runLab({
        onFrame: ({ frame }) => {
          const pv = String(watchValues(FOCUS)['av.pass'] ?? '-')
          if (pv !== '-') {
            passFrames++
            if (first.length < 6 && frame % 10 === 0) first.push(`f${frame}:${pv}`)
          }
        },
        world: ref, preparedWorld: world, focus: FOCUS, seed, frames: Number(process.env.AV_KRH_FRAMES ?? 1200), profile: false, maxScenes: 0 })
      rows.push(`seed ${seed} ${mode.padEnd(8)} catches ${r.catches} meanSpeed ${r.meanSpeed.toFixed(1)} path ${r.pathLength.toFixed(0)} events ${r.events.length} wall ${(r.wallMs / 1000).toFixed(0)}s passFrames ${passFrames} ${first.join(' ')}`)
    }
  }
  console.log(`\nKEEP RIGHT HUNT\n${rows.join('\n')}\n`)
}, 1_800_000)
