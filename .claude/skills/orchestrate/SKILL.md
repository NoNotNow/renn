---
name: orchestrate
description: >-
  Three-level agent orchestration. L1 (this session) takes tasks from the user and keeps
  exactly one L2 alive; L2 (frontier model) plans, splits and verifies, spawning N cheaper
  L3 workers in parallel where possible. Every level keeps its context small (100k-150k)
  and hands off to a fresh agent via a handoff document when it fills up. Use when the user
  invokes /orchestrate or asks for L1/L2/L3 orchestration of a larger task.
disable-model-invocation: true
---

# Orchestrate (L1 → L2 → L3)

```
User ⇄ L1 (this session: dispatcher, talks to the user)
          └─ L2 (exactly one at a time, model: opus — planner / orchestrator / reviewer)
                ├─ L3 #1 (model: sonnet or haiku — worker)
                ├─ L3 #2   … parallel where tasks are independent
                └─ L3 #n
```

**Arguments:** the task text (optional). Without it, ask the user what to work on.

## Shared rules (all levels)

- **Context budget.** Target ≤ 100k tokens, hard stop at ~150k. Nobody can read their exact
  usage, so estimate: big file reads, test logs and diffs are what fill it. Rough guide:
  ~40 tool calls or ~15 full file reads ≈ 100k. When over budget (or when the harness warns
  about context/compaction): stop starting new work, write a handoff, return.
- **Read narrowly.** `grep`/`sed -n` ranges over whole-file reads; `| tail -n 40` on test
  output; never paste large logs into a reply. Delegate exploration instead of doing it.
- **Results go to files, replies stay short.** A child's final reply is ≤ ~25 lines:
  status, what changed (commits/paths), what is open, path to any report/handoff. Detail
  lives in the run directory.
- **Run directory** (absolute path, shared by all levels and worktrees):
  `<repo>/.orchestrate/<run-id>/` with `run-id = YYYYMMDD-HHMM-<slug>`. It is gitignored.
  - `brief.md` — the user's task(s), acceptance criteria, constraints (L1 writes, appends).
  - `plan.md` — L2's task breakdown and status table (L2 owns).
  - `l3/<task-id>.md` — each worker's report (copied here from the worker's worktree, see
    "Worker reports").
  - `handoff/<level>-<n>.md` — handoff documents (see template below).
  - `log.md` — one line per spawn / return / handoff, any level may append.
  - `workers.tsv` — the **worker register** (see "Worker register" below).
- **Status words** in every final reply's first line: `DONE`, `PARTIAL`, `BLOCKED: <why>`,
  `HANDOFF: <path>`. A parent acts on that word.
- **Repo rules still apply** (CLAUDE.md, AGENTS.md, `agent-context/start-here.md`,
  `.cursor/rules/*.mdc`). Children don't inherit this conversation — pass the relevant ones.
- **Never loosen criteria** to make something pass. Unmet → `PARTIAL`/`BLOCKED` with the
  measured reason.

## Short-lived orchestrator (the normal case)

Background workers have no durable owner: their completion message goes to the agent that
spawned them, and if that agent has already returned, the message is lost (L1 had to
forward ~15 of them by hand in one run). "Don't return while workers run" did not hold in
practice, so the design assumes the opposite. **L2 works in decision rounds:**

1. Read `plan.md`, `workers.tsv` and finished reports; decide the next round.
2. Spawn the round's workers (one message, `run_in_background: true`), register each in
   `workers.tsv` immediately, update `plan.md`.
3. Return `PARTIAL: round <n> running, waiting on <ids>` (or `DONE`/`BLOCKED`).

**L1 starts the next L2 only when every worker of the round has reported** (status `done`
or `failed` in `workers.tsv`; reports exist under `l3/`). L1 never spawns a successor
while the old L2 still has running workers, and an L2 that was replaced is told explicitly
"stand down: do nothing further" if it is still addressable. An L2 never re-triggers
itself (no self-wake-ups); one that finds the run already owned by a newer L2 stops
silently.

## Worker register

`<RUN_DIR>/workers.tsv`, tab-separated, one row per worker, header first:

```
id	name	worktree	branch	report-path	status
```

`status`: `running` | `done` | `failed` | `merged`. **Whoever spawns a worker appends its row
in the same step** (before doing anything else); L1 or L2 flips the status when the
completion message arrives, and L2 sets `merged` after integrating. A fresh L2 learns what
is running from this file, not from handoff prose. (`handoff/*.md` "Running children"
just points at it.)

## Worker reports

Workers in a worktree usually cannot write into `<RUN_DIR>` (outside their sandbox).
So the L3 prompt always says: write the report to
`<worktree>/.orch-report/<task-id>.md` (untracked; never commit it), and the agent that
collects the worker copies it to `<RUN_DIR>/l3/<task-id>.md` and records the path in
`workers.tsv`. Read-only workers without a worktree may write to `l3/` directly.

## Handoff document (template)

When a level hits its budget, it writes `handoff/<level>-<n>.md` and returns
`HANDOFF: <path>`. The **parent** then spawns a fresh agent of the same level with the
same role prompt plus: "Continue from handoff `<path>`. Read it first."

```markdown
# Handoff <L2|L3:task-id> #<n> — <date time>
## Goal (unchanged from brief)
## Done so far (commits / files, with one-line why each)
## Current state (branch, worktree path, what is mid-flight, what is broken right now)
## Verified facts / measurements (things the next agent must NOT re-investigate)
## Refuted hypotheses (and the evidence)
## Next steps (ordered, concrete, first one immediately actionable)
## Open questions for the user (if any)
## Running children (L2 only: L3 ids, background agent names, what each is doing)
```

Keep it ≤ ~150 lines. It replaces the conversation — write it so a cold agent can continue
without asking.

## L1 — this session (dispatcher)

Purpose: stay responsive to the user with a tiny context. L1 does **no** implementation
and no exploration beyond a quick look needed to phrase the brief.

1. **Setup.** Create the run dir; make sure `.orchestrate/` is in `.gitignore`. Write
   `brief.md` from the user's request: goal, acceptance criteria (as checkable as possible —
   tests, gates, metrics), constraints, branch to work on. Ask the user only if a criterion
   is genuinely unclear.
2. **Spawn L2** with the Agent tool: `subagent_type: general-purpose`, `model: opus`,
   `run_in_background: true`, `name: "orch-l2"` (later generations `orch-l2-2`, …), prompt =
   the **L2 role prompt** below with the run dir filled in. Log it in `log.md`.
3. **Exactly one L2, and never a second while the first has workers.** While it runs:
   - New user tasks or changed priorities → append to `brief.md` under `## Added <time>`,
     then `SendMessage` to the running L2 ("brief.md updated: …"). Don't start a second L2.
   - User asks for status → read `plan.md` (status table only) and answer. Don't guess the
     state of a running agent; if plan.md is stale, say it's still running.
4. **On L2 return**, act on the status word:
   - `PARTIAL: round <n> running` → do NOT spawn a new L2 yet. Wait until every worker in
     `workers.tsv` is `done`/`failed` (update the rows from each completion message, copy
     reports into `l3/`), then spawn the next L2 ("continue; round <n> finished").
   - `DONE` / `PARTIAL` (nothing running) → summarize for the user in a few lines (what's done, verified how,
     what's open, commits). Ask whether to continue with open items.
   - `HANDOFF: <path>` → spawn a fresh L2 (same prompt + "continue from handoff"). Tell the
     user in one line.
   - `BLOCKED` → relay the question to the user, then continue via a fresh L2 (with handoff)
     or SendMessage if the L2 is still addressable.
5. **L1's own budget.** If L1 itself gets long, write `handoff/L1-<n>.md` (open user
   requests, current L2 name, run dir) and tell the user to start a new session with
   `/orchestrate continue <run dir>`. With `continue <path>` as argument, read the newest
   L1 handoff and `plan.md` instead of step 1.

## L2 role prompt (paste into the L2 spawn, fill `<RUN_DIR>`, `<REPO>`, `<BRANCH>`)

```
You are L2, the orchestrator in a 3-level agent setup. Run dir: <RUN_DIR>. Repo: <REPO>,
branch <BRANCH>. Read <RUN_DIR>/brief.md (and the handoff if given), then
<REPO>/agent-context/start-here.md and only the agent-context docs the task needs.

Your job: plan, split, delegate, integrate, verify. You do NOT do bulk implementation or
broad exploration yourself — spawn L3 workers for that. Keep your context under ~100k
(hard stop ~150k): read narrowly, keep worker replies short, put detail in files.

1. Plan. Write <RUN_DIR>/plan.md: tasks with id, goal, acceptance check, files/areas
   touched, dependencies, model (sonnet default; haiku for mechanical work: renames,
   search, running gates and summarizing output; do it yourself only if trivial), status.
   Measure before you theorize: if the cause is unknown, the first task is a measurement.
2. Parallelize. Tasks with no dependency and disjoint files run concurrently: spawn them in
   ONE message, each with run_in_background: true, and register each in
   <RUN_DIR>/workers.tsv (id, name, worktree, branch, report-path, status) right away. Code-changing workers use
   isolation: "worktree"; read-only workers (Explore, measurements) don't need it.
   Overlapping files → serialize.
3. Spawn each worker with the Agent tool (subagent_type general-purpose or Explore,
   model per plan, name "l3-<task-id>"), prompt = the L3 role prompt from
   <REPO>/.claude/skills/orchestrate/SKILL.md filled in with the task.
4. On each worker return, act on the status word:
   DONE → review the diff (git show --stat, then only the relevant hunks), cherry-pick or
   merge onto <BRANCH>, run the acceptance check yourself or via a haiku worker.
   HANDOFF: <path> → spawn a fresh worker with the same task + "continue from handoff".
   PARTIAL/BLOCKED → re-plan: smaller task, different approach, or escalate to L1.
   Update the status table in plan.md after every change.
5. New work: L1 may SendMessage you that brief.md changed. Re-read it and add tasks.
6. Integration gate: after merging behaviour changes run `npm run gate` (typecheck, lint,
   all unit tests, av:quick, optimizer browser test; one PASS/FAIL line per check) before
   reporting DONE. Never accept a worker's "N/N green" without the exact command it ran.
7. Rounds, not vigils: after spawning a round, append every worker to
   <RUN_DIR>/workers.tsv and RETURN "PARTIAL: round <n> running, waiting on <ids>".
   L1 restarts you once all of them have reported. Do not wait for workers, do not
   schedule your own wake-ups. If your budget runs out, write
   <RUN_DIR>/handoff/L2-<n>.md and return "HANDOFF: <path>".
8. Final reply to L1 (≤25 lines): status word first, then what's done + how verified,
   commits, open items, questions for the user.

If you do not have the Agent tool, reply immediately "BLOCKED: no Agent tool in L2" and
nothing else.
```

**Fallback if L2 cannot spawn** (`BLOCKED: no Agent tool in L2`): run in flat mode — L1
spawns the L3 workers directly from L2's `plan.md`, and L2 (re-spawned per round, or kept
addressable via SendMessage) only plans, reviews diffs and decides the next round. L1 still
only reads status words and the plan's status table.

## L3 role prompt (L2 fills `<…>`)

```
You are an L3 worker. Task <TASK_ID>: <goal>.
Acceptance check: <exact command / metric / observable result>.
Scope: <files/areas>. Do not touch anything else. Context: <2-5 lines of facts from L2,
incl. verified measurements and refuted hypotheses — don't re-investigate those>.
Repo rules: <REPO>/CLAUDE.md and AGENTS.md (read the parts relevant to your scope).
Run dir: <RUN_DIR>.

- If you are in a worktree: first `git fetch` and reset it to <BRANCH>
  (git reset --hard <BRANCH>), then work there.
- Stage files explicitly (never git add -A / git add .), commit early with clear messages,
  ending with the attribution trailer from the session.
- No background timers or long-lived processes left running.
- Never loosen tests, gates or criteria. If the check can't pass, report the measured
  reason.
- Keep your context under ~100k: narrow reads, tail test output. If you get close, write
  <RUN_DIR>/handoff/L3-<TASK_ID>-<n>.md (template in
  <REPO>/.claude/skills/orchestrate/SKILL.md) and return "HANDOFF: <path>".
- Write details (findings, numbers, decisions) to <WORKTREE>/.orch-report/<TASK_ID>.md
  (untracked, do not commit; you usually cannot write into <RUN_DIR>). The agent that
  collects you copies it to <RUN_DIR>/l3/. Read-only workers without a worktree may write
  to <RUN_DIR>/l3/<TASK_ID>.md directly.
- Report test results with the exact command run and its totals ("npx vitest run: 812/812",
  not "quick suite green"); a subset must be named as a subset.
- Final reply ≤15 lines: status word (DONE/PARTIAL/BLOCKED/HANDOFF), branch/worktree +
  commit hashes, acceptance check result, path to your report.
```

## Model choice

| Level | Model | Why |
|-------|-------|-----|
| L1 | session model | user-facing; keeps state minimal |
| L2 | `opus` | judgement: decomposition, review, integration |
| L3 code / debugging | `sonnet` | good at scoped implementation, cheaper |
| L3 mechanical (search, gates, summarizing logs, renames) | `haiku` | cheapest |

Upgrade an L3 to `opus` only after a `sonnet` worker failed the same task twice — note it in
`plan.md`.

## Lessons baked in (from earlier runs in this repo)

- Measure first; most hypotheses die after a 10-minute measurement.
- Acceptance checks must contain the user's actual complaint as a metric.
- Chaotic sims: relative checks in unit tests, absolute outcomes only in the health gates.
- Workers: reset worktree first, explicit staging, commit early. Clean up worktrees at the
  end (`git worktree list`, `git worktree remove -f -f <path>`).
- A worker saying "green" is a claim about the command it ran. Verify with `npm run gate`.
- Cherry-pick conflicts in generated files → take ours and re-run the generator.
