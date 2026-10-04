import { it } from 'vitest'
import { runScenario } from '@/test/fixtures/avEvasionRunner'
import { buildSweepCases } from '@/test/fixtures/avEvasionSweepCases'

// debug one sweep case: AV_CASE=<id> [AV_SCENARIO_TRACE=2 AV_TRACE_T0/T1] npx vitest run src/test/scenarios/av-sweep-one.diagnostic.test.ts
const id = process.env.AV_CASE
it.runIf(!!id)(`sweep case ${id}`, async () => {
  const c = buildSweepCases().find((x) => x.id === id)
  if (!c) throw new Error(`no case ${id}`)
  console.log(JSON.stringify(c.spec.puppets.map((p) => ({ id: p.id, at: p.at.map((v) => +v.toFixed(1)), yaw: p.yawDeg, m: p.motion }))), c.unwinnable)
  const m = await runScenario(c.spec, c.seconds)
  const atv = (t: number) => m.trace[Math.round(t * 60) - 1]?.[3].toFixed(1)
  // physical lateral acceleration envelope: heading change of the track over 0.2 s windows
  let maxLat = 0
  let at = ''
  const tr = m.trace
  for (let i = 12; i < tr.length - 12; i += 3) {
    const h1 = Math.atan2(tr[i][1] - tr[i - 12][1], tr[i][2] - tr[i - 12][2])
    const h2 = Math.atan2(tr[i + 12][1] - tr[i][1], tr[i + 12][2] - tr[i][2])
    let dh = h2 - h1
    while (dh > Math.PI) dh -= 2 * Math.PI
    while (dh < -Math.PI) dh += 2 * Math.PI
    const lat = Math.abs(dh / 0.2) * Math.abs(tr[i][3])
    if (lat > maxLat) {
      maxLat = lat
      at = `t=${tr[i][0].toFixed(1)} v=${tr[i][3].toFixed(1)}`
    }
  }
  console.log(`RESULT lat max ${maxLat.toFixed(1)} m/s^2 at ${at}`)
  console.log(`RESULT v(0.25/0.5/1/1.5/2 s) ${[0.25, 0.5, 1, 1.5, 2].map(atv).join('/')} gap ${m.minChaserGap.toFixed(1)} contact ${m.firstContact} launchDv ${m.launchMaxDv.toFixed(1)} end ${m.endSpeed.toFixed(1)}`)
}, 120_000)
