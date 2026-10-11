# Handoff: training improvements — sigma adaptation, eps-lex ranks, failure-mined maze setups (2026-10-11)

> **STATUS UPDATE (same day, evening session — T1/T2/T4 implemented + screened, read this first):**
> - Training was stopped cleanly at v3mg5 gen 2000 (state committed). The live run is **still stopped** — restart is pending Manuel's decision (see below).
> - **T1 lexEps: implemented, stays OFF.** `--lex-eps` flag + `lexTieFraction` + per-gen `lex ties` log line. Calibration at the operating point (batch 6, warm from gen-1900 best): tie fraction **0.00 at eps 0.02 AND 0.05** → no tie starvation at batch 6; eps arms are bit-identical to baseline. Keep for small-batch use.
> - **T2 CSA (variant a: CSA adapts base sigma, boost on top): implemented, stays OFF.** `--csa` flag, `IslandState.sigma/csaPath` persisted. Screening 150 gens x seeds {21,41,61}, maze+grid, warm from gen 1900: holdout finish-rate mean base 61 % vs CSA 59 % (within seed noise; grid slightly better, maze worse). CSA sigma saturates at the 4x upper clamp on the plateau → it degenerates to a permanent sigmaBoost. **Not promoted.** Variant (b) not screened.
> - **T3 sep-CMA-ES: deferred.** T2 was flat, but every arm (including 4x sigma) plateaus immediately and the failures are execution gaps, not search noise — the bottleneck is task-side (T4), not the optimizer.
> - **T4 diagnosis: done.** All 24 failures of the gen-1900 best (maze+grid, train+holdout) are offcourse/1 crash with the aim NEVER blocked: the car does not brake into 77-245 deg turns (overshoot 6.0-6.3 m vs offM=6 at 19-28 m/s). Classes: G1 grid mid-hairpin, G2 grid chain-end-at-mouth whip-past, M1 maze corner-exit at chain end, M2 lateral ~90 deg start, M3 narrow divider-tip double-back. **WARNING: the v3mg5 gen-1900 best REGRESSED vs the shipped gen-1000** on the diag set (grid 55/40 % vs 95/100 %, maze holdout 62 % vs 85 %).
> - **T4 setups: implemented + committed.** 4 adversarial TRAIN setups (grid:4001~2 G1, grid:4002~2 G2, maze:4011~2 M1, maze:4008~2 M2), seeds >= 4001 + variant 2, holdout and standard band bit-identical (pinned in `adversarialChains.test.ts`), all gates green (179 policyEvolution tests). M3 skipped; M1 compound-corner pairs impossible at 16 m pitch.
> - **OPEN for Manuel: (1) restart v3mg5 from gen 2000 with the new train mix (`--resume` + reset `best.train` first — the train episode set grew), or start a fresh run; (2) whether to warm from v3mg5 at all given the regression vs shipped gen 1000 — consider warming from the shipped gen-1000 genome or keep v3mg5 and let the adversarial setups pull it back; (3) T3 (sep-CMA-ES) on request; (4) T5 still last resort.** Screening artifacts (gitignored): `test-results/policy-evolution/screen/` (compare: base vs csa vs warm).
> - **DECIDED (Manuel): "komplett frisch" — v3mg6 FRESH run started** (same day, no warm start, no v3mg5 carry-over, seed 21, `--kinds maze,grid --batch 6`, target 3000 gens; `train-ctl.mjs` points at `training-data/policy-evolution/v3mg6.json`; TRAIN total grew 43 → 54 episodes = the 11 adversarial chains are in the mix). Auto-trial watcher is up again. lexEps OFF, CSA OFF (screened decisions). Commit the v3mg6 state regularly, never git stash it.
> - **SPEED CAP SWITCHED ON at gen 1220 (root cause of the stuck corner routes):** the v3 fitness rewards speed quadratically (finish = meanSpeed/10), so at maze_train_1 way 2 blasting past the corner at ~27 m/s with 96 % high-water x 0.5 fail factor (~1.25) scored ABOVE a slow finish (~1.0) — the net CORRECTLY never learned braking; more training could not fix it. With `speedCap: 10` (`capNorm`, opt-in, persisted): every finish = 1.0, every fail < frac² x cap/20 <= 0.5 — finishing always wins at any speed. Baselines reset to the new scale (per-island bestScoreVec/bestScore/stagn, global*, focus, file.best deleted; learned thetas + Adam state kept). Resume keeps the cap (file-level). Watch: the corner routes (maze_train_1 way 2, the 23-pts row Worst) should now gain as braking finally pays.

For the next agent (with subagents). Everything below is **planned and discussed, NOTHING implemented yet** — this round was analysis + discussion only.
Stream: the v3 maze/grid training (see [handoff-maze-training.md](./handoff-maze-training.md), still accurate) on top of the v3 policy history
([handoff-policy-evolution.md](./handoff-policy-evolution.md)). Branch `claude/autonomous-car-evolution-9p6zt2` (far ahead of main). A live training run
(`v3mg`) may still be running — **check `npm run train` FIRST** before touching anything; state saves every generation, stop cleanly via
`npm run train:stop` right after a gen line.

## Where this comes from

Manuel asked how our maze-training approach compares to current ML research. Result of the evaluation (web-researched, sources below):
the core is solid — OpenAI-ES 1:1 (Salimans et al. 2017), small net is fine (linear policies solve Atari benchmarks with ES), curriculum gating
and train/holdout discipline match the ACL / Procgen best practice, and our evaluation hygiene (holdout finish-count ship gate, separate dialog
seeds, anti-gaming penalties) is stronger than typical. Three gaps were identified and then **discussed with Manuel; his decisions are final**:

1. **KEEP the leximin weakest-link fitness. NO CVaR.** Manuel rejected the CVaR-α suggestion: "that would keep improving the good ones and leave
   the bad ones standing". Valid, and backed by our own history (fast-and-crash scored like finishing → V3_FAIL_FACTOR; evenness fitness was
   introduced for exactly this). Episodes are deterministic (installDeterminism, seeded noise per key) and the worst episodes are CONSISTENT
   (always the same routes) — signal, not lottery. Leximin stays.
2. **The LOS gate stays as-is** (see below — it is well designed). A soft/geodesic credit is the LAST-resort option only, behind a flag.
3. **Step-size adaptation: APPROVED** — the main documented gap. Fixed sigma=0.1 is exactly what Chrabaszcz et al. 2018 criticize for ES-in-RL;
   our sigmaBoost is a coarse stagnation restart (×1.5/epoch capped ×4), not a control rule.
4. Novelty/QD archive: **DOWNGRADED** after discussion. Chain-guided training sidesteps classic maze deception (the chain IS the solution path —
   the net must execute, not discover; reversed routes remove the goal bias). Our diversity is task-space (BFS/DFS routes, staggered dividers).
   The maze stall is a capability gap → **failure-mined setups** instead of a novelty archive.

## Code facts you need (all verified 2026-10-11)

- `src/policyEvolution/es.ts`: `DEFAULT_ES_CONFIG = { pairs: 24, sigma: 0.1, lr: 0.03, initStd: 0.3, seed: 1, weightDecay: 0.005 }`. Adam
  (b1 .9 / b2 .999) on the mean; grad `= Σ u_i·ε_i / (2·pairs·sigma) - weightDecay·theta`. `lexCentredRanks(vectors)` compares **strict**
  (no eps); `lexGreater(a, b, eps = 0)` exists with eps; `beatsBest` uses strict eps=0 **intentionally** (ship semantics).
- `src/policyEvolution/islands.ts`: sigma is NOT persisted. Per generation: `engineCfgs[k].sigma = esCfg.sigma * boost(k)`,
  `boost(k) = max(sigmaBoost(island.stagn), sigmaBoost(globalStagn))`, `sigmaBoost(stagn) = 1.5^(stagn-3)` capped at 4, STAGNATION_EPOCHS=3.
  The stagn counters ARE persisted (`IslandState.stagn`, `globalStagn`), so the effective sigma is reproducible from state.
- Run file schema `renn.policy-evolution.islands/1`; `EsConfig` is **persisted in the run file** — new optional fields must default for older files
  (missing field → default = old behaviour, bit-identical). `--resume` refuses changed configs on some paths (hunt-profile-evo had config
  signatures); keep resume-compat tests green.
- `WALL_LOS_JS` (`src/policyEvolution/wallLos.ts`) is a shared JS string used by BOTH pipelines: the episode tracker (`LegProgress`,
  `legs.ts` — headless training) and the in-world score stage (`MAZE_SCORE_STAGE_CODE`, `mazeTraining.ts` — browser-safe, **no node imports**).
  Any change there must update both and re-export the 5 maze worlds with `--score`.
- LOS gate semantics (do not "fix"): occlusion does NOT punish (credit high-water stands), re-acquiring LOS grants the accumulated delta at once,
  `finish` credits in full, and the net's aim input is untouched — only the credit vector is gated. Credit = occlusion-gated high-water via
  `LegProgress.credited`; raw-vs-credited is available as diagnostic.
- Dialog worlds use seeds **2001–2005** — deliberately in NEITHER train NOR holdout; they are a selection-neutral measurement set.
- v3mg run: `--kinds maze,grid --batch 6 --warm v3maze.json`, train setups 8+8, holdout 5+5, ~5 s/gen. Known stall routes (shipped v3 gen 1000,
  `--score` per-route): train_2 r3 58 pts (rev), train_3 r0 47 (fwd), train_3 r1 187 (fwd), train_4 r2 46 (fwd), train_5 r2 21 (rev).
  Progress gate: `MAZE_TRAIN_SIM=1 npx vitest run src/test/scenarios/maze-training-worlds.test.ts` (green when a candidate clears all 19 routes).

## Tasks in order (each: implement → screen → decide)

### T1 — eps in the lex rank comparison (small, low risk)

- `lexCentredRanks(vectors, eps = 0)`: near-ties (all positions within eps) share their rank, the first position differing by more than eps
  decides — the eps analogue of `lexGreater`. Default eps=0 = bit-identical.
- Plumb through: optional `EsConfig` field (e.g. `lexEps`, default 0) + `run-islands.ts` flag `--lex-eps`.
- **Calibration instrumentation:** log the per-generation tie fraction (share of candidate pairs that share a rank). eps candidates 0.02–0.05
  (norm currency). If the tie fraction is high (> ~50 %) the gradient starves — pick the largest eps with a healthy tie fraction.
- Tests: unit tests in `es.test.ts` (strict default unchanged; near-tie shares rank; eps decides only above threshold); resume-compat in
  `islands.test.ts` (old file without the field → behaves identically).
- Rationale: rank between near-equal candidates is decided by the first differing position — chaotic trajectory sensitivity makes that
  discontinuous in weight space. eps damps that WITHOUT touching the weakest-link semantics (which Manuel wants kept).

### T2 — cumulative step-size adaptation (CSA) on the island sigma (medium)

- Add a CSA (Hansen's cumulative step-size control) per island: track the evolution path of successful steps, adapt sigma up/down per
  generation instead of only boosting on stagnation.
- **State/persistence:** CSA needs per-island sigma (and path) state → add optional fields to `IslandState` (schema stays islands/1, older files
  default to sigma = esCfg.sigma, CSA off). Default OFF; `run-islands.ts` flag `--csa`.
- **Interaction with sigmaBoost — decide by screening:** (a) CSA adapts the base sigma, boost multiplies on top (keep both), vs (b) CSA replaces
  the boost while `--csa` is on. Recommendation: implement (a) first (smaller diff), screen (b) only if (a) is flat.
- Note: `PolicyEs.step` reads `cfg.sigma` fresh each generation (sigma is set on `engineCfgs[k]` before each step) — CSA fits that pattern.

### T3 — sep-CMA-ES screening variant (large; only if T2 is flat)

- Separate optimizer module exposing the same interface the islands use (`step(evaluate, keys)` → report), so `IslandsEs` needs no changes.
- sep-CMA-ES (diagonal covariance) at dim 698 (H=24 net) is feasible on CPU. **Key fact from the discussion:** CMA-ES is rank-based and needs only a
  TOTAL ORDER — `lexCompare` is one. So the vector fitness does NOT have to be scalarized away; the lex order can drive CMA-ES selection directly.
- Screen the T2 winner vs sep-CMA-ES with the same protocol; do not promote unless it wins on the metrics below.

### T4 — failure-mined maze setups (after the sigma decision; analysis first)

1. Diagnose the stalls: replay the 5 known stall routes + current v3mg holdout maze failures (`tools/policy-evolution/diagnose-v3.ts`,
   `chainReport.ts` tooling), extract the failing geometry per stall (turn radius at the corner, corridor width, reversal-at-wall distance,
   approach angle).
2. Generate new **TRAIN** setups (maze kind, `chains.ts` setup lists) that exercise exactly those geometries — adversarial/task curriculum in the
   ACL/PAIRED spirit: tasks at the frontier of competence. HOLDOUT stays untouched; ship gate unchanged; never loosen a gate.
3. The setups must satisfy the anti-gaming check from our lessons ("can it be scored without doing the task?") and the chains gates
   (2–4 accepted chains/setup, pure-pursuit finish — see `courses.ts`/`chains.ts` gates).
4. Track with the 19-route gate above + per-kind holdout finish counts.

### T5 — soft LOS credit (LAST resort, only if maze still stalls after T1+T2+T4)

- Options discussed: (a) credit × visible fraction of the credit segment, (b) geodesic ratio (BFS distance through the maze grid / straight
  line) instead of a binary gate — smoother, especially wall-adjacent where the maneuvers happen and today's credit surface is most discontinuous.
- Any change alters episode values → **fitness scale changes** → on resumed runs set `best.train = -1` while stopped (known pitfall), and it
  changes both WALL_LOS_JS consumers (see code facts). Behind a flag, default OFF, bit-identical without it.

## Screening protocol (same for every arm)

- 150 gens, **≥ 3 seeds** (`--seed` varies), same kinds/batch as v3mg (`--kinds maze,grid --batch 6`), same warm start for comparability
  (fresh runs from the same `--warm` genome), fresh `--out` per arm+seed (`test-results/` or `training-data/policy-evolution/` — decide and be
  consistent; the `tasks.jsonl`-style caches do not exist here, but config changes → fresh out dir on resume-refusal).
- Metrics (in this order of importance): **per-kind HOLDOUT finish counts** (chainReport/formatV3Report), maze holdout specifically, gen-to-plateau
  (first gen whose train best is not beaten for 100 gens), and for T1 the tie fraction.
- Compare with `tools/policy-evolution/compare.ts`; candidates through `ship.ts --v3` gates. Single-seed results are noise (our own caveat:
  HOLDOUT differences below ~3 s are near noise); finish counts are more robust than fitness values.
- Winner → long run (warm from the best available), ship checks via `npm run train:ship`, then the full ship procedure (re-export worlds with
  `--score`, `npx vitest run src/policyEvolution`, full suite, commit, push, deploy after Manuel's OK).

## Standing rules (unchanged, from the earlier handoffs)

- **Answer Manuel in German.** Never loosen criteria / oracles / baselines / ship gates. Full vitest + `npx tsc --noEmit -p tsconfig.app.json`
  + eslint on changed files before any deploy; deploy needs Manuel's OK; the user verifies on the live site.
- Subagent pattern that worked: written spec + "max N lines" report + parallel NON-overlapping file sets; the parent owns contracts, commits,
  processes. Suggested split here: one agent on `es.ts`/`islands.ts` core (T1/T2), one on tooling/flags/run-script + screening harness, analysis
  (T4 diagnosis) can run parallel once T1/T2 land.
- Commit `training-data/policy-evolution/v3mg.json` regularly, **never `git stash` it**. Training eats ~90 % CPU → vitest ~3× slower, use generous
  timeouts. `npm run sync:global-pipeline` only after av-stack stage-code edits (NOT needed for the maze worlds — they inline the stage code).
- pkill: never a pattern contained in your own command line — `pkill -f "[r]un-islands"` (bracket trick).
- After ANY fitness/score change on a resumed run: the stored `best.train` is on the old scale → reset it while stopped.

## Research basis (for the implementing agent's context)

- Salimans et al. 2017, "Evolution Strategies as a Scalable Alternative to RL" (arXiv:1703.03864) — the exact algorithm implemented (antithetic
  sampling, centred ranks, Adam, CRN).
- Chrabaszcz, Loshchilov, Hutter 2018, "Challenges in High-Dimensional RL with ES" (arXiv:1806.01224) — the fixed-sigma criticism driving T2.
- Wong et al. 2024, "Solving Deep RL Benchmarks with ES and Linear Policy Networks" (arXiv:2402.06912) — small nets + sep-CMA-ES are enough.
- Lehman & Stanley 2011 (novelty search, hard maze) + Colas et al. 2020 ME-ES (arXiv:2003.01825) — why we did NOT add a novelty archive
  (chain-guided training sidesteps classic maze deception) and what the QD literature would instead suggest.
- Helmuth/Spector lexicase selection literature — the family the lex vector ordering belongs to.
- Cobbe et al. 2019, Procgen (arXiv:1912.01588) — the generalization discipline we already follow (train/holdout, unseen levels).

## Recommended order

T1 (hours) → T2 (about a day including screening) → decision; T3 only if T2 is flat; T4 after the optimizer is settled; T5 only as the last
resort. Nothing ships without the full gate chain.
