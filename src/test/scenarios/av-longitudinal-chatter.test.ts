import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(path.resolve(__dirname, '../../../public/global/transformers/av-stack/av-control-longitudinal.js'), 'utf8')
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const transform = new Function(`${src}; return transform`)() as (i: any, dt: number, p: any, s: any, a: any) => void

it('zero demand while the speed sign flips every frame never pushes along the motion and never brakes through zero (no bang-bang chatter)', () => {
  const state: Record<string, unknown> = {}
  const api = { watch: () => undefined }
  let lastThrust = 1
  for (let f = 0; f < 40; f++) {
    const speed = f % 2 === 0 ? 5.6 : -5.6
    const input = { av: { plan: { vDesired: 0 }, ego: { speed, accel: 0 } }, actions: {} as Record<string, number> }
    transform(input, 1 / 60, {}, state, api)
    lastThrust = (input.actions.throttle ?? 0) + (input.actions.brake ?? 0)
  }
  expect(lastThrust).toBe(0)
})
