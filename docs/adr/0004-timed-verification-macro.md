# Timed verification macro (single MCP run)

Status: accepted

Agents need **human-visible input sequences** (throttle/steer changes, pauses) without chaining many MCP `step` / `run_for_sim_time` calls, which miss timing on attached Builder and cannot change scripted input mid-run on browser RPC today.

We add **`run_timed_macro`**: one tool call that registers optional **platform probe samples**, starts an **agent observation session**, advances sim time with a **macro-relative sim-time input schedule** (`startDelaySimSec`, `steps[]`, `durationSimSec`), and returns a **macro log** (events + observation timeline + final snapshot). Schedule anchor is **simulation time**, not wall clock; optional **`segmentWallPauseMs`** inserts real delays only on attached Builder between input-step boundaries so humans can see motion. Headless runs ignore wall pause (max speed).

**Considered:** Separate `start_timed_recording_macro` + `get_macro_log` (async job); wall-clock–anchored macros; sending per-step input scripts over browser RPC for each chunk.

**Why not those:** Async job adds session state and race with attach; wall-clock drifts from physics; browser backend already ignores per-RPC input scripts—macro must execute entirely in the attach host. One synchronous tool matches the existing program–run–fix loop.
