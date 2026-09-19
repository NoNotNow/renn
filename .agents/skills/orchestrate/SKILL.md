---
name: orchestrate
description: Run large multi-file work through a three-level subagent hierarchy — top coordinator, Opus orchestrator, Composer workers — with handoff chaining when context fills. Use when the user asks to orchestrate subagents, run parallel agents on a large task, continue from a handoff, or finish architecture-review candidates at scale.
argument-hint: "Goal, handoff path, or work queue"
disable-model-invocation: true
---

# Orchestrate

Run large work through a **three-level hierarchy** so each layer keeps a small context window:

| Level | Who | Model | Job |
|---|---|---|---|
| **L1 Coordinator** | The agent that invoked this skill | Inherit (parent) | Confirm baseline, read handoff, spawn L2, verify claims, chain fresh L2 on handoff |
| **L2 Orchestrator** | One subagent per work chunk | `composer-2.5-fast` | Plan, diagnose, spawn L3 workers, integrate, write handoff when full |
| **L3 Workers** | One or more subagents per task | `composer-2.5-fast` | Implement on an explicit owned-files list |

L1 never implements directly unless the change is trivial (one file, <20 lines). L2 never edits files L3 owns while L3 is running.

## When to use

- Multi-file refactors, defect sweeps, or architecture-candidate implementation
- Continuing from a `/handoff` document
- `/improve-codebase-architecture` candidates the user wants landed without one agent holding the whole diff
- Any task where parallel agents would collide without explicit file ownership

Skip orchestration for single-file fixes, questions, or work that fits one context window.

## AFK runs and mid-run user messages (default)

Orchestrated work is often **long-running**. Treat it as one session until **STATUS: done** (or **handoff-written**), unless the user explicitly says **stop** or **cancel**.

### L1 (coordinator) — do not abort the run on follow-ups

When the user sends another message **while L2/L3 Task subagents are still running**:

1. **Do not cancel** in-flight subagents to “pivot” unless they asked to stop.
2. **Append** new instructions to the **priority queue** (or a `## Appended tasks` list in the next L2 spawn / handoff).
3. **Do not** replace the original goal with only the follow-up — merge: *original goal + appended items*.
4. If subagents already finished, chain a **fresh L2** for appended work; do not redo completed queue items.

If the user might send notes mid-run (AFK), spawn workers with **`run_in_background: true`** so the coordinator can absorb follow-ups without blocking the turn. Prefer **background L2 + parallel background L3** for multi-worker AFK passes unless the user asked for foreground-only.

Tell the user once per session (only if relevant): follow-ups **append**; to **replace** scope they should say **stop** first, then send the new goal.

### User habit (optional, not required)

Follow-ups are safest **after** `STATUS: done`. Mid-run notes still work via append rules above.

### Pass to every L2 spawn (include verbatim unless user overrides)

```markdown
## Continuity — mid-run messages
- **Do not stop** this orchestration because the parent received a follow-up user message.
- **Append** new user notes to the task queue; implement after current in-flight L3 work unless the user said **stop** / **cancel**.
- Do **not** discard completed work or re-run finished queue items to “reinterpret” a short follow-up.
```

## L1 workflow (coordinator — you)

### 1. Establish baseline

Run in parallel before spawning anyone:

```bash
npx vitest run          # record: files / passed / skipped
npx tsc --noEmit -p tsconfig.app.json
```

Record the numbers. Every L2 and L3 agent must keep them green or better.

### 2. Load context — reference, don't re-derive

If the user passed a handoff path, read it first. Then read only what the handoff points at (`agent-context/`, HTML reports, specs). Do not re-scan the whole codebase at L1 — that is L2's job.

Collect and pass forward:

- **Goal** — what "done" means this session
- **Baseline** — exact test/typecheck numbers
- **Guardrails** — files not to touch, behaviour not to change
- **Priority queue** — ordered task list (highest value first)
- **Docs** — paths to project docs that already capture decisions
- **Continuity** — include the **Continuity — mid-run messages** block (see above) in every L2 prompt

### 3. Spawn L2

Use the Task tool with `model: composer-2.5-fast` (or the model the user specified). Fill in [ORCHESTRATOR-PROMPT.md](ORCHESTRATOR-PROMPT.md). One L2 per coherent chunk (e.g. "fix handoff defects", "implement candidate 1"). Do not pack unrelated chunks into one L2.

**`run_in_background`:** default **`true`** for AFK / multi-worker / “do as much as one run” requests; **`false`** when the user wants a single foreground result before continuing.

### 4. Verify L2 output — never trust reports blindly

After L2 returns:

1. Re-run baseline commands yourself
2. Read `git diff` for files L2 claimed to change
3. If L2 added regression tests, spot-check one: temporarily revert the production fix and confirm the test goes red, then restore
4. Reject claims like "pre-existing type errors" without reading `tsc` output

### 5. Chain or stop

| L2 return | L1 action |
|---|---|
| `STATUS: done` and queue empty | Summarise for user; offer `/code-review` if uncommitted |
| `STATUS: partial` or handoff path present | Read handoff, spawn **fresh L2** with handoff as primary context |
| `STATUS: done` and queue has next item | Spawn fresh L2 for next item (fresh context per chunk) |
| Tests regressed | Do not chain; diagnose or spawn L2 with "fix regression only" |

**Never resume a context-full L2.** Always spawn a new one from its handoff.

### 6. Repeat architecture cycle (optional)

When the user's goal includes finding *and* fixing friction:

1. L2 runs `/improve-codebase-architecture` (explore → HTML report)
2. User picks a candidate, or the handoff/queue names the top one
3. L2 (or a fresh L2) implements via L3 workers
4. When the queue is empty, spawn L2 for another architecture review scoped to what changed

## L2 rules (orchestrator subagent)

See [ORCHESTRATOR-PROMPT.md](ORCHESTRATOR-PROMPT.md) for the spawn template. Core obligations:

- **Diagnose before mutate** on behaviour changes — call `/diagnosing-bugs` or `/tdd` as appropriate
- **Design before restructure** — call `/codebase-design` when the seam is not obvious
- **Spawn L3 on disjoint file sets only** — see worker rules below
- **Verify every L3 claim** — run tests, read diff, red-check new tests
- **Run vitest + tsc after each task**, not only at the end
- **Write handoff** to `$TMPDIR/handoff-<topic>-<timestamp>.md` via `/handoff` when context fills or scope exceeds one session
- **Return the fixed report format** (below)

## L3 rules (worker subagent)

See [WORKER-PROMPT.md](WORKER-PROMPT.md) for the spawn template. Every L3 spawn must include:

```
OWNED FILES: [explicit list]
DO NOT TOUCH: [other agents' files + global guardrails]
TASK: [one focused outcome]
REPORT FORMAT: STATUS, CHANGES, LEFTOVER, RISK
```

Workers do not spawn further subagents unless L2 explicitly authorises it.

## Parallelism rules

- Two L3 agents may run in parallel **only** when their OWNED FILES lists do not overlap
- L2 lists every agent's owned files in its spawn prompts so agents know what not to edit
- Prefer fewer, larger L3 tasks over many tiny ones — coordination overhead is real
- Serialise tasks that touch the same module interface

## Handoff protocol

When L2 writes a handoff:

- Path: `$TMPDIR/handoff-<topic>-<YYYYMMDD-HHMM>.md` (resolve from `$TMPDIR`, fallback `/tmp`)
- Must include: baseline numbers, what's done, what's left, suggested skills, **LEFTOVER**, **RISK**
- Must **reference** artifacts (HTML reports, agent-context docs) — not duplicate them
- L1 passes the handoff path as the primary input to the next L2 spawn

## Fixed report format

Every L2 final message and every L3 report must end with:

```markdown
**LEFTOVER** — remaining work, ordered by value
**RISK** — behaviour changes, performance, invariants, things needing human sign-off
```

L2 also returns:

```markdown
**STATUS**: done | partial | handoff-written
**Tests**: vitest and tsc results (exact numbers)
**Changes summary**: bullet list
**Handoff path**: absolute path, or "none"
```

## Suggested skill pairings

| Phase | Skill |
|---|---|
| Behaviour defect | `/diagnosing-bugs` then `/tdd` |
| Seam / module design | `/codebase-design` |
| Find candidates | `/improve-codebase-architecture` |
| Context full | `/handoff` |
| Before commit | `/code-review` |

## Anti-patterns

- **Aborting orchestration on a follow-up message** — append tasks; only stop when the user says stop/cancel
- **One agent owns the whole refactor** — def beats the purpose of this skill
- **Parallel agents on overlapping files** — caused every collision in uncontrolled runs
- **Accepting subagent test counts without re-running** — "1814 passed" claims were wrong twice
- **Resuming a full-context L2** — spawn fresh from handoff instead
- **L1 implementing large diffs** — burns the coordinator's context for work L3 should do
- **Skipping red-check on new tests** — vacuous tests passed review until revert-and-fail was run

## Examples

**Continue from handoff:**
```
/orchestrate /var/folders/.../handoff-afc-fix-issues-20260914.md
```
L1 reads handoff → spawns L2 with issue queue → verifies → chains on handoff if partial.

**Architecture review + implement top candidate:**
```
/orchestrate finish architecture review candidates from the HTML report
```
L2 explores → report → L1 spawns fresh L2 per candidate → L1 verifies after each.

**Large defect sweep:**
```
/orchestrate fix the three issues in the handoff, highest value first
```
One L2 for diagnosis + fixes; L3 workers on disjoint file sets; fresh L2 if handoff written.

**AFK with possible mid-run notes:**
```
/orchestrate /codebase-cleanup — do as much as one run
```
L1 spawns background L2 + parallel L3; user adds “also consolidate agent docs” mid-run → L1 **appends** to queue, does **not** cancel workers; L2 picks up appended item after L3 batch or via fresh L2.

## Additional resources

- [ORCHESTRATOR-PROMPT.md](ORCHESTRATOR-PROMPT.md) — L2 Task-tool spawn template
- [WORKER-PROMPT.md](WORKER-PROMPT.md) — L3 Task-tool spawn template
