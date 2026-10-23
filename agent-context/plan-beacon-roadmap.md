# Plan: Beacon — roadmap-guided beacon steering for a maze-solving autonomous car

Status: **design documented, not yet implemented** (user decision 2026-10-23). This file is the reference for
the later implementation; nothing in `src/` depends on it yet.

## Name

**Beacon.** The path planner builds a sparse roadmap of the maze, runs A* over it, and emits an ordered chain of
**beacons** (waypoints). The car never plans — it just drives toward the furthest beacon that is in line of sight,
and the beacons lead it to the long-term target through the maze. Remember it as: *"Beacons light the way; the
car only ever steers at the next light it can see."*

## Motivation

The current maze-bridge (`src/policyEvolution/schlauMaze.ts`) hands the schlau head ONE goal vector, and the
drive stage walks a pre-authored waypoint chain that came from the maze *generator* (`mazeTrainingRoutes` — the
chains exist because the grid maze knows its own carve). That works for the regular grid mazes but fails for
**irregular mazes**: arbitrary wall boxes (rotated rects), non-grid layouts, no authored chain.

Beacon replaces the authored chain with a **computed** chain that works for any static wall geometry:

1. inflate every wall by the car's circumradius + safety margin,
2. build a sparse roadmap of the free space (nodes + line-of-sight edges),
3. A* from car start to the long-term target on that roadmap,
4. emit the solution path as the beacon chain,
5. at runtime, feed the schlau head the FURTHEST chain point that is IN SIGHT (reuse the existing maze-bridge
   in-sight feed contract: straight nose→point segment clears every inflated wall; high-water index that never
   regresses on occlusion flicker; nearest unreached beacon when nothing is in sight; chain end = finish).

## Why not the alternatives (decisions already made)

| Alternative | Verdict |
|---|---|
| Dijkstra cell-by-cell on the grid | Only fits grid mazes; irregular shapes need rasterization (resolution-limited, ~50–200 ms at 0.25 m, worse paths). Rejected. |
| Rasterize irregular mazes to an occupancy grid | Works but approximate and resolution-bound. Rejected as primary; see "fallback" below. |
| PRM (probabilistic roadmap) | Kept as the fallback roadmap builder for very large/cluttered worlds (sample N free points, connect k-nearest with line of sight). |
| Full Hybrid-A* replanning per tick (what `av-route-planner` does) | Unnecessary here: walls are static per world, so the roadmap is built ONCE at world load. |

## Algorithm (the Beacon planner)

Pure 2-D geometry, browser-safe, no node imports (importable from the bundle, same rule as `schlauMaze.ts`).

### Step 1 — Inflate walls

Input: the wall boxes of the world (`position`, `size` (width/depth), `yawDeg` → 4-corner poly via
`rectPoly` from `src/avEvolution/eval/geometry`). Inflate each rect by `clearance = car circumradius + margin`
(half diagonal of the car bounding box plus ~0.3–0.5 m; `CAR_SIZE` / `CAR_HALF_WIDTH` live in
`src/policyEvolution/episode.ts` / `chains.ts`). Inflating in the wall's local frame = widening `size` by
`2*clearance` per axis before the yaw rotation, then rebuilding the poly.

### Step 2 — Build the roadmap

Default: **reduced visibility graph** (exact shortest drivable path for the inflated disc):
- nodes: start, long-term target, and the 4 corners of every inflated wall (~4N nodes);
- edges: node pairs whose connecting segment clears every inflated wall — reuse the segment-vs-rect early
  rejection + corner-poly trick from `wallLos.ts` (`losWallsInit` bounding-circle pattern; the JS string there
  is shared by both pipelines — extract a TS twin, do not fork the string twice);
- cost: Euclidean length.

Fallback: **PRM** (200–500 sampled free points, k=8–12 nearest, line-of-sight edges) if the visibility graph
gets too dense (irregular worlds with hundreds of walls). Both builders must emit the same `Roadmap` shape so
the planner and the feed do not care which one built it.

### Step 3 — A* over the roadmap

Straight-line heuristic A* on the sparse graph (binary heap). Rebuilds are cheap enough to run per episode
start; per-tick replanning is NOT needed while walls are static. Dynamic puppets/clutter stay out of the
roadmap — the existing AEB/supervisor stages handle movers, exactly as they do today.

### Cost budget (measured targets for the implementation)

| Step | Budget |
|---|---|
| Inflate + visibility graph, ~80 walls (~320 nodes, ~50k pairs) | tens of ms, once at world load |
| PRM 300 nodes k=10 | ~2k LOS tests, faster still |
| A* on a few hundred nodes | < 1 ms per query |
| Per-tick in-sight feed walk | O(chain × walls) with bounding-circle rejection — negligible |

## The Beacon car (integration)

Clone of the `self_hunt_flexible` AV car binding (same body/shape/stage list/pipe binding pattern as
`buildArenaWorldFrom` in `src/avEvolution/maze/arenaWorld.ts`), with three differences:

1. **Beacon planner stage** (new transformer, priority just before the schlau drive stage): at episode start,
   reads the world's wall boxes + the long-term target from its params, builds the roadmap, solves A*, and
   writes the beacon chain + inflated wall rects into its params (same "param rects are exact, deterministic
   and cheap" philosophy as `wallLos.ts` — no `api.raycast`, which has no self-exclusion and needs a live
   physics world).
2. **Schlau drive stage** (existing `schlau_drive` namespace): walks the beacon chain instead of an authored
   maze chain — reach/arc-pass cursor, high-water in-sight goal, `SCHLAU_MAZE_WAYPOINT_REACH_M` reach radius.
   The head still receives exactly ONE goal vector (`x[23..25]`); it never sees the chain.
3. **Long-term target**: a param (a point or an entity id), e.g. the maze exit or a goal slab. The beacon chain
   is the decomposition of that long-term target into visible-path targets.

Training: build a set of irregular maze worlds (rotated/non-grid walls, no authored chains — the whole point),
train the schlau head on them via the training dialog as today (`schlau` set pattern, `schlau-candidates.json`).
The trained model must generalize to driving beacon-to-beacon, not to one specific maze.

## Reuse map (do not rebuild these)

- `rectPoly` / `V2` — `src/avEvolution/eval/geometry.ts`
- LOS segment-vs-rect with bounding-circle early rejection — pattern of `WALL_LOS_JS` in
  `src/policyEvolution/wallLos.ts` (extract a shared TS twin for Beacon; keep the string for the score stages)
- in-sight high-water goal feed, reach cursor — `src/policyEvolution/schlauMaze.ts` (carrot-fix bridge)
- car constants — `CAR_SIZE`, `CAR_HALF_WIDTH`, `CAR2_PARAMS`, `CAR_BODY`, `CAR_START_Y` in
  `src/policyEvolution/episode.ts` / `chains.ts`
- schlau stage wiring / genome shape — `src/policyEvolution/schlauPolicy.ts`, `schlauEpisode.ts`,
  `schlauTraining.ts`
- world surgery from a source world — `buildArenaWorldFrom` pattern in `src/avEvolution/maze/arenaWorld.ts`

## Implementation phases

1. `beaconRoadmap.ts` in `src/policyEvolution/` — inflate + visibility graph + PRM + A*, pure functions,
   unit-tested against hand-built irregular layouts (assert: path exists where a corridor exists; path hugs
   inflated corners; no path when a corridor is narrower than `2*clearance`).
2. Beacon planner transformer + beacon-chain walk in the schlau drive stage (chain in params, one goal vector
   out) — parity test: headless episode == browser (see `agent-headless-defined-start` rule: reload the world
   before every run).
3. Irregular example worlds (sync to `public/exampleWorlds/` per the example-world-sync rule) + training set
   entry + first schlau training run on Beacon worlds.
4. Visualization: the existing debug target line already draws the in-sight goal; add the beacon chain as
   chained line segments (pattern: `MAZE_TRAIN_CHAIN_COLORS` route lines).

## Open questions (answer before phase 2)

- Replan trigger when the car drifts far off the chain (stuck/recovery): replan from current pose per episode,
  or per N seconds, or on stuck-timer only?
- Does the visibility graph or PRM suffice for the largest planned world? Decide by measuring both builders in
  phase 1.
- Should the Beacon feed skip beacons already behind the car's route progress (arc-pass semantics from the
  maze bridge) or strictly chase in-sight index? Keep the high-water semantics unless tests say otherwise.
