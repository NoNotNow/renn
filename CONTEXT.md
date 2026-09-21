# Renn — agent logic verification

Language for letting an external agent author transformer logic, run the simulation, and read structured feedback without driving the Builder UI.

## Language

**Logic verification run**:
A bounded, deterministic simulation session (fixed timestep, scripted input) used to validate game logic and produce an observation timeline.
_Avoid_: Test run, headless run (when you mean the bounded session, not the host)

**Logic verification host**:
The runtime that loads a world, applies pose-safe patches, steps physics and transformers, and serves observation data—whether embedded in the browser Builder or driven from CLI/tests.
_Avoid_: MCP server, Playwright session

**Agent observation session**:
The period during which probes and watch/trace bridges are active for an agent (or human) consumer; not tied to Workspace UI being open.
_Avoid_: Watch mode, debug session

**Platform probe**:
Observation registered outside transformer source (entity pose, body fields, actions, pipeline trace) sampled on an interval into the run buffer.
_Avoid_: Watch, telemetry hook

**Author telemetry**:
Values published from transformer code via the runtime API (e.g. labeled watch calls) during execution.
_Avoid_: Logging, println

**Observation timeline**:
Time-ordered rows (simulation time + probe and author values) stored in a capped ring buffer for one logic verification run.
_Avoid_: Log file, metrics stream

**Pose-safe patch**:
A world or entity edit that updates document and runtime via incremental sync without a full scene runtime restart, preserving live registry/physics poses.
_Avoid_: Hot reload, live edit

**Scene runtime restart**:
Full teardown and reload of the 3D/physics session (e.g. structural world changes); may restore poses only when explicitly captured.
_Avoid_: World reload (ambiguous—prefer this term or pose-safe patch)

**Explicit reset**:
An agent-requested operation that clears poses, velocities, observation buffers, or the world document to a baseline—never implied by a pose-safe patch.
_Avoid_: Reload, refresh

**Agent project bundle**:
A portable project snapshot on disk—`world.json` and optional `assets/`—matching user export layout; the agent’s source of truth for load/save outside the browser.
_Avoid_: IndexedDB project, fixture (when you mean a full editable project)

**Agent authoring loop**:
The repeated cycle of load project → patch pipeline or world → run logic verification → read observation timeline → adjust until probes and author telemetry satisfy the goal.
_Avoid_: E2E test, agent script

**In-game verification**:
A logic verification run driven through browser attach so the same stepping and observation API apply while a human sees the canvas.
_Avoid_: Playwright test, visual test

**Verification project source**:
One of three ways to supply a world to the logic verification host before a run: a pinned fixture id, an on-disk agent project bundle id, or inline world JSON.
_Avoid_: MCP tool name, load path (implementation)

**World document preparation for verification**:
Applying migrations and validation so a world JSON document matches what the logic verification host expects, independent of whether it came from a bundle, fixture, or inline load.
_Avoid_: migrateWorld (implementation), import pipeline

**Agent verification CLI**:
A Node entrypoint that invokes the same logic verification tool surface as MCP stdio, in-process, so shell-based agents and CI can load, patch, run, and observe without the Cursor MCP panel.
_Avoid_: MCP server (when you mean the transport), Playwright (when you mean headless host)

**Agent smoke browser**:
Chrome launched by Playwright for dev smokes (`agent:authoring-smoke`, `agent:dev-attach`): real Chrome binary, **ephemeral automation profile**, often a **dedicated dev port** (e.g. 5199). IndexedDB saves there do not merge with the developer’s everyday browser or with a different localhost port.
_Avoid_: MCP browser (ambiguous — Cursor attach uses the human’s tab; smoke uses Playwright)

**Timed verification macro**:
A declarative, sim-time schedule of keyboard input changes and optional platform probe samples executed in one logic verification run, producing a macro log (events + observation timeline).
_Avoid_: Script, replay file, E2E scenario

**Macro log**:
Structured output from a timed verification macro: macro-relative events (start, input changes, optional wall pauses), the observation timeline rows, and a final pose snapshot.
_Avoid_: get_observation only, debug dump

**Probe schedule**:
When and how often platform probes sample into the observation timeline (per-probe `intervalMs`, interpreted against sim time in the host step loop).
_Avoid_: polling interval (wall clock)

**Verification attach mode**:
Logic verification driven through browser attach (in-game verification): MCP forwards RPC to the live Builder scene; stepping uses exclusive rAF pause during agent advances.
_Avoid_: headless, Playwright

**Verification headless mode**:
Logic verification host runs in-process (Vitest, MCP without attach): no canvas, no wall pauses, fastest program–run–fix.
_Avoid_: attached, smoke browser
