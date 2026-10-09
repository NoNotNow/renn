# Handoff: policy evolution (neural driving policy), state 2026-10-09 evening

Read first: [feature-policy-evolution.md](./feature-policy-evolution.md) (design, courses, fitness, tools, every measured result) and
`.cursor/rules/deploy-after-each-step.mdc` (**always on: after every finished user-visible step commit, push and `npm run deploy`, then tell the user what to look at on the live site; the user can only verify through the deployed GitHub Pages site**).
Branch: `claude/autonomous-car-evolution-9p6zt2` (far ahead of `main`; a deploy publishes the whole branch state). Code: `src/policyEvolution/`, tools: `tools/policy-evolution/`, worlds: `public/exampleWorlds/policy_drive_{field,slalom,maze}/`.

## What exists
- A tiny MLP (22 inputs -> 10 tanh -> 2 tanh, 252 weights) drives the unchanged `car2` actuator through one custom transformer stage (`POLICY_STAGE_CODE` in `policy.ts`). Outputs: steering and a TARGET SPEED (a fixed P law turns it into a pedal, because a raw pedal is bang-bang: 1200 m/s^2 per unit).
- Courses (`courses.ts`, key `kind:seed[~startVariant][@fieldDifficulty]`): `field` (closed 38 m track, boxes, goals near the middle), `slalom`, `maze` (6x6, goal chain = shortest route). TRAIN seeds 1.., HOLDOUT 1001.. (+ start variant 1 = random start pose).
- Fitness = route progress x mean speed (= progress^2 / time), normalised; episodes end on contact, stall (< 1 m in 3 s), flip, `offcourse` (> 16 m from the route), finish, or 60 s. Candidate fitness = 0.5 mean + 0.5 worst-quarter mean.
- Optimisers: `run.ts` (single OpenAI-ES centre) and `run-islands.ts` (3 islands, random immigrants, neuron-aligned crossover, field curriculum). `ship.ts` compares a run's best snapshot with the shipped policy on identical courses (paired bootstrap) and writes `shippedPolicy.json` only if HOLDOUT is better (`--force` overrides).
- Tests: `npx vitest run src/policyEvolution` (30 tests, all green at `5c9bed1`).

## Currently shipped and deployed
`src/policyEvolution/shippedPolicy.json` = run-4 generation 390 (trained on the CLOSED field, canonical starts). Per kind on 10 held-out courses: field 0/10 finished (78 m), slalom 9/10, maze 5/10. Example courses: field:1001 crash 87 m, slalom:1001 finish, maze:1002 and :1004 finish, :1001 and :1003 crash. Last deploy of the worlds: commit `d4c8d9e` (stage code with sensor-noise support, behaviour unchanged).

## RUNNING right now (check first!)
`npm run policy:islands -- --gens 3000 --islands 3 --pairs 8 --epoch 25 --mature 75 --batch 18 --train-per-kind 30 --holdout-per-kind 20 --workers 4 --seed 7 --out test-results/policy-evolution/islands2.json` (log `islands2.log`), started ~22:14 UTC as a harness background task (2 h limit => stops ~00:15 UTC; do not restart it blindly after the limit, the tool note says not to when it already had the longest timeout; `--resume` continues from the saved file if you decide to).
At gen 28 the field curriculum was working (difficulty 0.10, route-fraction EMA 0.93), TRAIN was still 0.42 (early). When it ends or you want an early look: copy `islands2.json` to the scratchpad, then
`npx tsx tools/policy-evolution/ship.ts <copy> --workers 4 --train-per-kind 30 --holdout-per-kind 20`; if it writes: `npx tsx tools/renn-mcp/export-policy-drive-example-world.ts`, `npx vitest run src/policyEvolution`, update the results in `feature-policy-evolution.md`, commit, push, `npm run deploy`, report numbers (incl. the paired CI and the per-kind result). If `ship.ts` keeps the old policy: document and push, no deploy needed (nothing user-visible changed) but say so.

## Key findings (do not forget)
1. **The first `field` was open ground and the policy learned to drive around the whole obstacle field** (50-73 m lateral deviation) while the fitness still counted progress. Fixed: closed track + `offcourse` rule. All field results before 2026-10-09 are void. When adding courses, always ask: can the fitness be gamed by leaving the intended route / not meeting the obstacles?
2. The headless / Playwright verification of example worlds is worth doing: a wrong camera mode (`follow` instead of `thirdPerson`) rendered a black view. Playwright (chromium at `/opt/pw-browsers/chromium`, args `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader --ignore-gpu-blocklist`) renders the Builder with `?example=<id>` (see how it was done: dev server `npm run dev`, screenshot after ~15 s).
3. Random starts + 2 % sensor noise (run 5) gave **no measurable gain** (paired mean diff -0.055, 95 % CI -0.18..+0.06, 27 wins / 33 losses on 60 held-out courses). Runs plateau at TRAIN ~1.1 (about 40 % of courses finished) after ~300 generations; the closed field (dense boxes) is unsolved by the reactive net: it drives straight along the middle and hits the first box in the lane (found by tracing where episodes end).
4. A finish-rate gate for the curriculum never opened (first islands run, gen 279, silently trained on d = 0.2 only). Now: empty field at d = 0, gate = route fraction >= 0.7, step 0.05.
5. Single runs vary; compare only with the paired HOLDOUT tool, and treat one-run-against-one-run claims with care (needs several seeds, each run costs 2 h on 4 cores).

## Ideas not done yet (the user asked for items 2 and 3, now built; the rest is open)
- Ablations of the islands run: `--islands 1 --no-curriculum` vs `--islands 3` vs `--no-curriculum`, several seeds, to see which part helps.
- If the plateau stays: the net may lack capacity or memory (more hidden neurons, recurrent state, a "next turn" input, a coarser/farther ray set), or the field's random rotated boxes need a different input (e.g. a lidar-like free-space direction).
- Builder UI to pick any course/seed (today: three fixed example worlds, maze world has four mazes; see `exampleWorld.ts` `POLICY_EXAMPLE_WORLDS`).
- An "eval policy on course X" MCP/agent tool; a browser panel for runs (nothing of that exists, CLI only).

## Pitfalls for the next agent
- **Never `pkill -f` / `pgrep -f` with a pattern that also appears in your own command line** (a heredoc or the command text containing the path): it kills your own shell (exit 144). Use the bracket form in a command whose text does not otherwise contain the name, e.g. `pkill -f "[r]un-islands"` as a separate short command. Also never `pkill -f vite` (matches `vitest`, `npm run deploy`).
- Background processes started with `nohup`/detached die when the session idles or the container restarts; use the harness background task (Bash `run_in_background`, `timeout` <= 7200000) and `--resume`. Run state is saved every generation. The container may be restarted (it was, twice); files in the repo and `test-results/` survived, `node_modules` too.
- Background tasks stop at 2 h; the tool then says "do not restart if it already had the longest timeout": respect that and report, or ask the user.
- Scheduled check-ins (`send_later`) were used for polling; delete leftover triggers so nothing restarts runs against that guidance.
- Example worlds must use camera `mode: 'thirdPerson'`. After any change to `POLICY_STAGE_CODE`, regenerate the worlds (`npx tsx tools/renn-mcp/export-policy-drive-example-world.ts`), otherwise `exampleWorld.test.ts` (disk == exporter) fails.
- No product/example-project names in `src/agent/` or `tools/renn-mcp/` (rule `agent-mcp-no-project-names.mdc`).
- Report results honestly: say when a number is within noise, when a metric was inflated (see finding 1) and what the user will actually see on the live site.
