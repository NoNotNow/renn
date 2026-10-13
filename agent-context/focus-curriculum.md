# Failure-focus curriculum ("Crux-Fokus-Modus") — design + machinery, 2026-10-13

User spec (translated): when individual crux setups fail (per a diagnose run of the current best), (a) checkpoint the
intermediate state FIRST, (b) train focused ONLY on the failing setups — the passing ones are ignored — until the failing
crux runs/passes, (c) re-include ALL setups and validate over the next 50 training generations (the previously-failing
crux still passes; other setups broken by the focus phase get repaired), (d) if the validation window fails, roll back to
the checkpointed state. Reusable pipeline machinery, not a one-off script.

## The two pieces

1. **Trainer flag** `run-islands.ts --focus-setups "crux:5,crux:12#2v3,.."` (v3 only; pure logic in
   `src/policyEvolution/focusSetups.ts`, tests in `focusSetups.test.ts`). Setup keys or the chain keys a diagnose
   `--list` prints (mapped to their setups); ALL accepted chains of each focus setup train EVERY generation (the normal
   start-variant rotation, `capFieldDifficulty`, and the `grp` fallback for variants that lose the chain gates are kept);
   the epoch-end island RANKING also runs on the focus setups. The passing setups are fully excluded — not down-weighted.
   Given at creation or resume; persisted in the run file like `speedCap` (a plain resume keeps the set — crash-safe),
   `--no-focus-setups` clears it. The epoch-end TRAIN / HOLDOUT evaluation stays the FULL band, so best-candidate
   bookkeeping and the reports never change meaning. **Exit criterion**: at every epoch end the best-ranked island is
   evaluated on the CANONICAL focus chains (variant 0 — exactly the episodes diagnose-v3 measures); the per-setup
   finished/total, `allPass`, and the gen are persisted as `focusPass` in the run file, echoed as `focusSetups` into
   latest-stats and as `FOCUS-SETUPS ... / FOCUS-SETUPS ALL PASS at gen N` into the log. When the flag is absent the
   trainer is bit-identical to before.

2. **Driver** `tools/policy-evolution/focus-curriculum.mjs` (auto-trial.mjs pattern, restartable via
   `<stem>-focus.driver.json`), started/stopped via `train-ctl.mjs` (job `FOCUS`: `node tools/policy-evolution/train-ctl.mjs
   focus` / `stop`; status shows the phase; the driver refuses to run while the real training runs, and vice versa the
   real `start` is unaffected). Phases:
   - **DIAGNOSE** the current best of the source run on the band (`diagnose-v3.ts --out` JSON; `--kinds crux
     --train-per-kind 15 --holdout-per-kind 10` defaults = the pinned band of crux.test.ts). The failing TRAIN chains
     map to the focus set. **HOLDOUT failures are diagnosed and gated but NEVER trained on** (holdout integrity); the
     2026-10-13 case needs no exception anyway — the holdout failures (crux:1003~1/1005~1/1007~1, all NC1) are covered by
     the train failures' classes/embodiments (crux:5/13/17 NC1-occluded, crux:7 NC1-open, crux:12 NC2-pocket).
   - **CHECKPOINT**: copy `v3cruxnose.json` -> `v3cruxnose-focus.json` and resume THE COPY with its own
     `--latest-best` / `--latest-stats` (`v3cruxnose-focus.latest-*.json`). The driver NEVER writes the source — the
     untouched source IS the rollback anchor.
   - **FOCUS**: one-epoch chunks (each chunk ends exactly at an epoch boundary, where the pass check fires) with
     `--focus-setups "<failing setups>"` until `focusPass.allPass` (cap `--max-focus-chunks 40` -> roll back).
   - **VALIDATE**: `--no-focus-setups` (ALL setups re-included) for `--validate-gens` generations (default 50 — the
     "50 runs" of the user spec are interpreted as 50 TRAINING generations; the flag makes it tunable), then diagnose the
     new best again. **KEPT** only if (i) every focus setup's chain passes, (ii) the OTHER train setups have no new
     failures vs the checkpoint diagnosis, (iii) holdout does not regress.
   - **Verdict**: KEPT = the validated copy is the new lineage (promote it MANUALLY: `cp v3cruxnose-focus.json
     v3cruxnose.json`, then `train-ctl.mjs start`); ROLLED BACK = the focus files are renamed `*.rejected-<ts>.json`,
     the untouched checkpoint is resumed as before.
   - `--dry-run` diagnoses and prints the plan without writing the focus state.

## Decisions worth remembering

- The real v3cruxnose run trains/evaluates on the DEFAULT band (`--train-per-kind 8` -> 40 train chains, 27 holdout);
  the pinned/decision band is 15/10 (76/54). The driver passes `--train-per-kind 15 --holdout-per-kind 10` for the focus
  run, so the epoch-end TRAIN eval and the diagnose band coincide and the focus setups (crux:12/13/17 are OUTSIDE the
  default 8-setup band) are inside the training evaluation. The stored best's 40-element trainVec re-anchors at the
  first epoch end under `beatsBest`'s padded-zero semantics (missing episodes count as worst case) — expected, not a bug.
- The pass check evaluates the BEST ISLAND of the epoch (the live population), not the stored `file.best`: during focus
  the stored best can lag (it only updates when the FULL band improves), and the validation phase exists precisely to
  repair collateral damage before anything is kept.
- Stop safety: `train-ctl.mjs stop` kills the driver and its trainer chunk; the state file saves every generation, and
  the driver restarts into the phase it stopped in. The gen-3575 numbers behind the first real cycle:
  train 66/76 (10 fails), holdout 48/54 (6 fails), focus set `crux:5,crux:7,crux:12,crux:13,crux:17`
  (failure modes: NC1 braked-but-slid crashes near the end of leg 0 at ~0 m/s, plus full-throttle leg-0 offcourse on
  crux:13; diagnosis artifacts of the dry run: `training-data/policy-evolution/v3cruxnose-focus.diagnosis-checkpoint.json`).
