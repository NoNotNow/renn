import { it } from 'vitest'
import { oracle } from '@/test/fixtures/avEvasionOracle'

it.runIf(!!process.env.AV_ORACLE)('oracle on the hand-made scenarios', () => {
  const CH: [number, number] = [2.5, 5]
  const wall = (at: [number, number], size: [number, number]) => ({ at, size, yawDeg: 0 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const specs: Record<string, any> = {
    'corner-trap': { car: { at: [-36, -30], yawDeg: 0 }, goal: [120, 120], boxes: [wall([-60, -10], [2, 100]), wall([-10, -60], [100, 2])], puppets: [{ id: 'c', size: CH, at: [70, 70], yawDeg: 135, motion: { kind: 'home', speed: 30, turnRate: 1.5, lead: 0.3 } }] },
    pincer: { car: { at: [0, 100], yawDeg: 0 }, goal: [0, -300], boxes: [], puppets: [
      { id: 'l', size: CH, at: [-75, 40], yawDeg: -90, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.5 } },
      { id: 'r', size: CH, at: [75, 40], yawDeg: 90, motion: { kind: 'home', speed: 25, turnRate: 1.5, lead: 0.5 } }] },
    'from-behind': { car: { at: [0, 100], yawDeg: 0, speed: 12 }, goal: [0, -300], boxes: [], puppets: [{ id: 'c', size: CH, at: [0, 145], yawDeg: 0, motion: { kind: 'home', speed: 30, turnRate: 1.2 } }] },
  }
  for (const [n, s] of Object.entries(specs)) {
    const r = oracle(s, 14)
    console.log(`${r.winnable ? 'WIN ' : 'LOSS'} ${n} bestGap ${r.best.minGap.toFixed(1)} ${JSON.stringify(r.best)}`)
  }
}, 600_000)
