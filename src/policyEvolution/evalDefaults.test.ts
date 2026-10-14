import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DECISION_HOLDOUT_PER_KIND, SMOKE_HOLDOUT_PER_KIND } from './evalDefaults'

/**
 * Decision-grade eval defaults: 3-4 holdout setups per kind produced two noisy misjudgements (a field
 * "regression" that was noise; a final report contradicting the 8-setup numbers) — RESULTS block in
 * agent-context/feature-policy-evolution.md. Gates and final reports evaluate >= 8 per kind; --smoke (3)
 * is a quick manual look only and marks its report as smoke.
 */
describe('decision-grade eval defaults', () => {
  it('the holdout default is 8 per kind (never lower for reports/gates)', () => {
    expect(DECISION_HOLDOUT_PER_KIND).toBe(8)
    expect(SMOKE_HOLDOUT_PER_KIND).toBeLessThan(DECISION_HOLDOUT_PER_KIND)
  })

  it('eval-candidate.ts wires the constant as its default (usage documents it, no stale inline default)', () => {
    const src = readFileSync(join(process.cwd(), 'tools/policy-evolution/eval-candidate.ts'), 'utf8')
    expect(src).toContain("num('holdout-per-kind', smoke ? SMOKE_HOLDOUT_PER_KIND : DECISION_HOLDOUT_PER_KIND)")
    expect(src).toContain('[--holdout-per-kind 8]')
    expect(src).not.toContain('[--holdout-per-kind 4]')
  })
})
