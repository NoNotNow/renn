/**
 * Decision-grade eval defaults for candidate evaluations (eval-candidate.ts and the pipeline drivers).
 * 3-4 holdout setups per kind produced two noisy misjudgements (a field "regression" that was noise; a final
 * report contradicting the 8-setup numbers) — see the RESULTS block in agent-context/feature-policy-evolution.md.
 * Reports and gates never evaluate below DECISION_HOLDOUT_PER_KIND; the --smoke escape hatch (SMOKE_*) is a
 * quick manual look only and must mark its report as smoke.
 */
export const DECISION_HOLDOUT_PER_KIND = 8
export const DECISION_TRAIN_PER_KIND = 6
export const SMOKE_HOLDOUT_PER_KIND = 3
export const SMOKE_TRAIN_PER_KIND = 3
