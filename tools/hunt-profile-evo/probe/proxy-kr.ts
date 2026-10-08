// B0: keep-right corridor rows (av-keep-right.test.ts: the keep-right sims in which av.maze / av.profile activate) for the proxy.
import { CORRIDOR_14, runOncoming, type OncomingSpec } from '@/test/fixtures/avKeepRight'
import type { CaseResult, Margin } from './proxy'

const krCorridor = (offset: number): OncomingSpec => ({ name: 'corridor', offset, boxes: CORRIDOR_14, cruise: 14, puppetSpeed: 8, carSpeed: 10 })
export const KR_CASES = ['kr-right', 'kr-left', 'kr-old-hits']

export async function runKeepRightCase(name: string, extra: Record<string, unknown>): Promise<CaseResult> {
  const t0 = performance.now()
  const side = name === 'kr-left' ? 'left' : 'right'
  const m = name === 'kr-old-hits' ? await runOncoming(krCorridor(-1.5), { passSide: 'off', ...extra }) : await runOncoming(krCorridor(side === 'right' ? -1.5 : 1.5), { passSide: side, ...extra })
  const failed: string[] = []
  const margins: Margin[] = []
  if (name === 'kr-old-hits') {
    // inverted row: the 'off' planner must still HIT the oncoming car (the passing rule is what lets it through)
    if (!m.contact) failed.push(`old planner no longer hits (minGap ${m.minGap.toFixed(2)})`)
    margins.push({ key: 'mustTouchGap', value: m.minGap, limit: 0, slack: -m.minGap })
  } else {
    if (!Number.isFinite(m.lat)) failed.push('no pass')
    else if (side === 'right' ? m.lat <= 0 : m.lat >= 0) failed.push(`wrong side lat ${m.lat.toFixed(2)}`)
    if (m.contact) failed.push('contact')
    if (m.minGap < 0.5) failed.push(`min gap ${m.minGap.toFixed(2)} < 0.5`)
    margins.push({ key: 'minGap', value: -m.minGap, limit: -0.5, slack: m.minGap - 0.5 })
  }
  return { name, kind: 'evasion', pass: failed.length === 0, failed, margins, wallMs: performance.now() - t0, goalT: Infinity }
}
