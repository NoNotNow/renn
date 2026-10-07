/* @params
[
  {"key": "budget", "type": "enum", "options": [{"value": "full"}, {"value": "normal"}, {"value": "eco"}], "default": "full", "label": "CPU budget", "group": "Performance", "description": "CPU budget: 'full' (default), 'normal' or 'eco' (economy paths, less sensing work)."},
  {"key": "debugDraw", "type": "boolean", "default": true, "label": "Draw debug vectors", "group": "Debug", "description": "Draw debug vectors (visible in the Builder visualize mode)."},
  {"key": "drivableArea", "type": "numberList", "label": "Drivable area [xmin, xmax, zmin, zmax]", "group": "State", "description": "World box [xmin, xmax, zmin, zmax]; virtual walls at its edge."},
  {"key": "fleeArea", "type": "numberList", "label": "Flee area [xmin, xmax, zmin, zmax]", "group": "Evasion", "description": "World box [xmin, xmax, zmin, zmax] flee / escape goals are kept inside (needed for the flee layer)."},
  {"key": "goalReachDist", "type": "number", "default": 12, "group": "Goal", "unit": "m", "min": 0, "description": "Radius that counts as 'goal reached' for the goal display and logic."},
  {"key": "goalWatchdog", "type": "number", "default": 0, "group": "Evasion", "min": 0, "description": "Seconds without getting 8 m closer after which a goal counts as unreachable (needs fleeArea); 0 = off."},
  {"key": "manualOverride", "type": "boolean", "default": false, "label": "Keyboard manual override", "group": "Manual", "description": "Any key press (the pipe's input stage; only the current play avatar receives keys) suspends the autopilot steering / throttle for overrideHold seconds; AEB stays active."},
  {"key": "overrideHold", "type": "number", "default": 1, "label": "Manual override hold", "group": "Manual", "unit": "s", "min": 0, "description": "Seconds after the last key event (restarted while a key is held) during which the autopilot yields to the keyboard."},
  {"key": "hud", "type": "boolean", "default": false, "label": "Show HUD", "group": "Debug", "description": "Show the status HUD for this car."},
  {"key": "preset", "type": "enum", "options": [{"value": "none"}, {"value": "car"}, {"value": "chaser-evasion"}, {"value": "maze"}, {"value": "arena"}], "default": "none", "label": "Preset", "group": "Performance", "description": "One switch that expands to the feature params the stages gate on ('none' = raw per-stage defaults)."},
  {"key": "saver", "type": "boolean", "default": false, "label": "Saver (thinner rays, slower field)", "group": "Performance", "description": "With budget 'eco': thinner ray sets and slower field rebuilds."},
  {"key": "threatIds", "type": "json", "label": "Threat entity ids", "group": "Evasion", "description": "Entity ids of bodies to track and evade (e.g. pursuers)."},
  {"key": "vehicleLength", "type": "number", "default": 4, "label": "Vehicle length", "group": "Vehicle", "unit": "m", "min": 0, "description": "Body length used for clearance; the box collider can only enlarge it."},
  {"key": "vehicleWidth", "type": "number", "default": 2, "label": "Vehicle width", "group": "Vehicle", "unit": "m", "min": 0, "description": "Body width used for clearance; the box collider can only enlarge it."},
  {"key": "chasedDecel", "type": "number", "default": 9, "group": "Evasion", "unit": "m/s²", "min": 0, "description": "Free-path braking deceleration while a fast body closes in; 0 = off.", "advanced": true},
  {"key": "damageClear", "type": "number", "default": 14, "group": "State", "min": 0, "advanced": true},
  {"key": "damageDist", "type": "number", "default": 8, "group": "State", "unit": "m", "min": 0, "advanced": true},
  {"key": "escapeAccel", "type": "number", "default": 15, "group": "Evasion", "unit": "m/s²", "min": 0, "advanced": true},
  {"key": "escapeAlign", "type": "number", "default": 4, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "escapeEvalEvery", "type": "number", "default": 0.15, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "escapeGoalDist", "type": "number", "default": 90, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "escapeHold", "type": "number", "default": 1.5, "group": "Evasion", "unit": "s", "min": 0, "advanced": true},
  {"key": "escapeHorizon", "type": "number", "default": 5, "group": "Evasion", "unit": "s", "min": 0, "advanced": true},
  {"key": "escapeLatAccel", "type": "number", "default": 12, "group": "Evasion", "unit": "m/s²", "min": 0, "advanced": true},
  {"key": "escapeRange", "type": "number", "default": 160, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "escapeSafe", "type": "number", "default": 20, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "escapeSpeed", "type": "number", "default": 36, "group": "Evasion", "unit": "m/s", "min": 0, "advanced": true},
  {"key": "escapeSwitch", "type": "number", "default": 3, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "escapeTrigger", "type": "number", "default": 16, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "escapeTurnSpeed", "type": "number", "default": 12, "group": "Evasion", "unit": "m/s", "min": 0, "advanced": true},
  {"key": "fleeHold", "type": "number", "default": 4, "group": "Evasion", "unit": "s", "min": 0, "description": "s a chosen flee goal is kept, 4", "advanced": true},
  {"key": "fleeLos", "type": "boolean", "default": false, "group": "Evasion", "description": "bool, default off", "advanced": true},
  {"key": "fleeMaxDist", "type": "number", "default": 110, "group": "Evasion", "unit": "m", "min": 0, "description": "candidate goal distance, 50 / 110", "advanced": true},
  {"key": "fleeMinDist", "type": "number", "default": 50, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "fleeRadius", "type": "number", "default": 16, "group": "Evasion", "unit": "m", "min": 0, "description": "m, 16: a goal way passing a near threat closer than this is unsafe", "advanced": true},
  {"key": "fleeSim", "type": "boolean", "default": false, "group": "Evasion", "description": "bool, default off", "advanced": true},
  {"key": "fleeStoppedSpeed", "type": "number", "default": 0, "group": "Evasion", "unit": "m/s", "min": 0, "advanced": true},
  {"key": "fleeTurnPenalty", "type": "number", "default": 1.5, "group": "Evasion", "min": 0, "description": "1.5: score penalty of a candidate needing a turn of 180 deg, growing from 70 deg", "advanced": true},
  {"key": "gapCommit", "type": "boolean", "default": true, "group": "Evasion", "description": "bool, default ON; false disables", "advanced": true},
  {"key": "gapReach", "type": "number", "default": 10, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "gapTrackRange", "type": "number", "default": 160, "group": "Evasion", "unit": "m", "min": 0, "description": "m, 160: far list av.threatsFar for the sim only", "advanced": true},
  {"key": "gapWallClamp", "type": "boolean", "default": true, "group": "Evasion", "advanced": true},
  {"key": "gapWallClear", "type": "number", "default": 3.5, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "gapWallFilter", "type": "boolean", "default": true, "group": "Evasion", "advanced": true},
  {"key": "gapWallMin", "type": "number", "default": 60, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "gapWallNeed", "type": "number", "default": 60, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "gapWallPen", "type": "number", "default": 0, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "gapWallTrade", "type": "number", "default": 8, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "goalGiveUp", "type": "number", "default": 0, "group": "Evasion", "unit": "s", "min": 0, "description": "Seconds after the watchdog flagged the goal unreachable at which the goal source is told to pick another goal (input.goalFeedback); 0 = off.", "advanced": true},
  {"key": "goalGiveUpDistance", "type": "number", "default": 150, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "escapeTriggerHorizon", "type": "number", "default": 0, "group": "Evasion", "unit": "s", "min": 0, "description": "A flee is started only when the heading to the real goal meets a pursuer within this horizon (0 = the full escapeHorizon).", "advanced": true},
  {"key": "fleeRelease", "type": "boolean", "default": true, "group": "Evasion", "description": "Drop a committed escape goal once the simulated run to the real goal stays fleeReleaseD from every pursuer for fleeReleaseT s (not while the goal is flagged unreachable).", "advanced": true},
  {"key": "fleeReleaseD", "type": "number", "default": 30, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "fleeReleaseRun", "type": "number", "default": 80, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "fleeBadAlign", "type": "number", "default": 1, "group": "Evasion", "min": 0, "max": 1, "description": "Weight of the alignment with the real goal in escape-heading scoring while the goal is flagged unreachable (1 = unchanged).", "advanced": true},
  {"key": "fleeReleaseT", "type": "number", "default": 1, "group": "Evasion", "unit": "s", "min": 0, "advanced": true},
  {"key": "gapWalls", "type": "boolean", "default": false, "group": "Evasion", "description": "bool, default OFF; opt-in, needs gapCommit", "advanced": true},
  {"key": "gapWarmup", "type": "number", "default": 0, "group": "Evasion", "unit": "s", "min": 0, "description": "s, 0.1: no commit before the pursuers' velocities are filtered", "advanced": true},
  {"key": "goalOpen", "type": "boolean", "default": true, "group": "Evasion", "description": "bool, default ON; false disables; flee / escape goals only, never mission goals", "advanced": true},
  {"key": "goalOpenGap", "type": "number", "default": 6, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "goalOpenLine", "type": "boolean", "default": false, "group": "Evasion", "advanced": true},
  {"key": "goalOpenRadius", "type": "number", "default": 15, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "goalOpenRun", "type": "number", "default": 60, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "goalOpenW", "type": "number", "default": 1.5, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "mazeModule", "type": "boolean", "default": false, "group": "Maze", "description": "Maze module: in a confined space (labyrinth) the flee goal is a waypoint on the least-resistance route to the nearest reachable exit instead of an open-ground ring / heading goal.", "advanced": true},
  {"key": "mazeRange", "type": "number", "default": 18, "group": "Maze", "unit": "m", "min": 0, "description": "Look-out distance of the confinement test (16 rays over the static map).", "advanced": true},
  {"key": "mazeEnter", "type": "number", "default": 0.6, "group": "Maze", "min": 0, "max": 1, "description": "Share of blocked directions at which the car counts as confined.", "advanced": true},
  {"key": "mazeLeave", "type": "number", "default": 0.4, "group": "Maze", "min": 0, "max": 1, "description": "Share of blocked directions below which the car counts as free again (hysteresis).", "advanced": true},
  {"key": "mazeOpenRadius", "type": "number", "default": 20, "group": "Maze", "unit": "m", "min": 0, "description": "A cell is open ground (an exit target) when at most mazeOpenCells wall cells lie within this radius.", "advanced": true},
  {"key": "mazeOpenCells", "type": "number", "default": 8, "group": "Maze", "min": 0, "advanced": true},
  {"key": "mazeCarPen", "type": "number", "default": 6, "group": "Maze", "min": 0, "description": "Extra route cost factor inside the zone of a moving chaser and its predicted path: cost x (1 + factor).", "advanced": true},
  {"key": "mazeBlockPen", "type": "number", "default": 30, "group": "Maze", "min": 0, "description": "Route cost factor around stopped cars (parked, stalled chasers): they block the way like a wall unless the way round is far longer.", "advanced": true},
  {"key": "mazeCarRadius", "type": "number", "default": 8, "group": "Maze", "unit": "m", "min": 0, "description": "Radius of the cost zone around a stopped car.", "advanced": true},
  {"key": "mazeChaserRadius", "type": "number", "default": 14, "group": "Maze", "unit": "m", "min": 0, "description": "Radius of the cost zone around a moving chaser (linear fall-off) and its predicted positions.", "advanced": true},
  {"key": "mazeChaserLead", "type": "number", "default": 2, "group": "Maze", "unit": "s", "min": 0, "description": "Prediction time of the chaser cost zone along its velocity.", "advanced": true},
  {"key": "mazeWallCost", "type": "number", "default": 400, "group": "Maze", "min": 1, "description": "Cost factor of cells next to a known wall (inflated by the vehicle): a route that has to cross one (beyond the first 3 steps) is no escape route.", "advanced": true},
  {"key": "mazeSeenRange", "type": "number", "default": 70, "group": "Maze", "unit": "m", "min": 0, "description": "Exits must be open ground the car has seen: cells in line of sight on the static map within this range of the places it has been; 0 = unseen ground counts as open too.", "advanced": true},
  {"key": "mazeReach", "type": "number", "default": 10, "group": "Maze", "unit": "m", "min": 0, "description": "The escape waypoint is replaced by the next one when the car is this close to it.", "advanced": true},
  {"key": "mazeSeenShare", "type": "number", "default": 0.3, "group": "Maze", "min": 0, "max": 1, "description": "An exit must be open ground whose surroundings (mazeOpenRadius) the car has seen at least this share of.", "advanced": true},
  {"key": "mazeLead", "type": "number", "default": 25, "group": "Maze", "unit": "m", "min": 0, "description": "The escape waypoint is at most this far ahead of the car on the route (earlier at the first route corner).", "advanced": true},
  {"key": "mazeSwitch", "type": "number", "default": 0.25, "group": "Maze", "min": 0, "max": 1, "description": "A new escape route replaces the kept one only when it is this share cheaper (hysteresis).", "advanced": true},
  {"key": "mazeEvery", "type": "number", "default": 0.4, "group": "Maze", "unit": "s", "min": 0, "description": "Minimum time between rebuilds of the exit field.", "advanced": true},
  {"key": "mazeHold", "type": "number", "default": 3, "group": "Maze", "unit": "s", "min": 0, "description": "The maze escape stays active this long after its last trigger (unreachable goal, danger, chaser within mazeThreatRange).", "advanced": true},
  {"key": "mazeThreatRange", "type": "number", "default": 60, "group": "Maze", "unit": "m", "min": 0, "description": "A moving tracked car within this distance triggers the maze escape.", "advanced": true},
  {"key": "maxCurvature", "type": "number", "default": 0.115, "label": "Max curvature (min turn radius)", "group": "Vehicle", "min": 0, "description": "Tightest curvature the car can drive (1 / minimum turn radius).", "advanced": true},
  {"key": "threatLead", "type": "number", "default": 0.3, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "threatRange", "type": "number", "default": 120, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "threatTurnMin", "type": "number", "default": 0, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "threatTurnRate", "type": "number", "default": 1.5, "group": "Evasion", "min": 0, "advanced": true}
]
*/
// AV stack · SENSE / state estimation ("localization" layer).
// Publishes the ego state on the shared blackboard `input.av.ego` for all later stages.
// Also publishes av.vehicle {width, length, height} = max(params, own box collider) used by all planners.
// debug draw (params.debugDraw, default true): cyan = velocity vector.
// Tracked bodies (params.threatIds: entity ids, e.g. pursuers; default none): live positions -> filtered velocities, published as av.threats [{id,x,z,vx,vz,turn}] (turn = recent max observed turn rate rad/s, null until seen moving)
// within params.threatRange (default 120 m). The motion planner predicts them (cost wThreat) and the flee layer below steers the goal away from them:
// params.fleeArea [xmin,xmax,zmin,zmax] (world; required for the flee layer), fleeRadius (m, 16: a goal way passing a near threat closer than this is unsafe),
// fleeMinDist / fleeMaxDist (candidate goal distance, 50 / 110), fleeHold (s a chosen flee goal is kept, 4), fleeTurnPenalty (1.5: score penalty of a candidate needing a turn of 180 deg, growing from 70 deg).
// fleeSim (bool, default off): the flee layer commits to an ESCAPE HEADING chosen by simulation instead of the geometric ring score: 24 headings x 2 speed policies are driven by an idealised car
// (escapeAccel 15 m/s^2, escapeSpeed 36 m/s top, kappa <= maxCurvature, lateral accel <= maxLatAccel) for escapeHorizon (5 s) against the pursuit-predicted pursuers (pure pursuit with their observed turn
// rate, as the motion planner); score = smallest centre distance reached (capped at escapeSafe) + goal alignment / turn penalties. The heading is kept (hysteresis) and the goal is 90 m ahead on it. It also
// triggers when the heading to the real goal is predicted to come within escapeTrigger (m, 16) of a pursuer, which can be far outside the 90 m geometric danger range. escapeRange (m, 160): pursuers considered.
// gapWalls (bool, default OFF; opt-in, needs gapCommit): the escape headings also need a free run over the persistent static map (av.prevSmap = last frame's av.smap, 2 m cells, car half-width + gapWallClear 3.5 m): headings shorter than gapWallMin (60 m) are not candidates unless that costs more than gapWallTrade (8) score points against the best short one (race first); none long enough = the longest run; the goal is put at the last free point of the run (min 8 m, gapWallClamp:false = off), a held goal whose heading hits a known wall is re-picked, a goal clamped that way is re-picked once the car is within gapReach (10 m). Cuts the lab seed-6 maze-pocket shuttle (path 955 -> 1500-1750 m) but flips other lab seeds (chaotic), hence off.
// gapCommit (bool, default ON; false disables): fleeSim's escape-heading search, but only against >= 2 pursuers, and the chosen goal (escapeGoalDist 150 m) is an ABSOLUTE point kept until reached / clearly worse (escapeSwitch 6, eval every 0.3 s) so the motion planner gets a fixed target. Also with gapCommit: gapWarmup (s, 0.1: no commit before the pursuers' velocities are filtered), gapTrackRange (m, 160: far list av.threatsFar for the sim only), escapeAccel default 9, av.fleeSim (motion planner `fleeAimDirect`, default on, aims at the committed goal instead of the route carrot).
// goalOpen (bool, default ON; false disables; flee / escape goals only, never mission goals): candidate goals are scored by openness on the persistent static map (av.prevSmap, 2 m cells): the geometric ring subtracts goalOpenW (1.5) x (wall cells within goalOpenRadius 15 m of the candidate / 100; goalOpenLine:true also the share of the straight way past the first wall, off: it flips corner-trap), the gapCommit escape headings subtract goalOpenGap (6) x (1 - free run / goalOpenRun 60 m); a held escape goal is re-scored every evaluation so new walls around it make it lose.
// fleeLos (bool, default off): the geometric flee / own-goal candidates are also scored by line of sight (one ray per heading from the hull edge): a goal whose straight way is blocked by a wall
// before it is reached (maze, building) is penalised, free length is a bonus, so the car explores along open corridors instead of shuffling in front of a wall towards a goal behind it.
// Goal watchdog (params.goalWatchdog = seconds, default 0 = off; needs fleeArea): a goal the car does not get closer to (>= 8 m) within that time is
// unreachable (outside the walls, boxed in a corner); the car then picks its own open-road goals instead until the source hands over another goal.
// Owns the simulated clock (state.t) so no downstream stage needs a wall clock.
// PRESETS (params.preset, OPT-IN; unset / 'none' = the raw per-stage defaults, no expansion, as before presets existed): one switch that expands to the feature params the stages gate on. Explicit params (pipe binding, scope, stage)
// always override the preset's value for the same key. This stage runs first and publishes the preset table as `av.preset`; every later stage merges its OWN params over it
// (so per-layer scopeParams / stageParams keep working; a stage used without this one sees its raw params). Keep the tables in sync with agent-context/feature-av-stack.md ("Using the AV autopilot in your game").
//  car             generic vehicle: CPU budget 'eco' (economy mode: goal fixation, calm-cruise scanFocus; budget: 'full' in the binding = old behaviour), curvature smoothing + plan hysteresis, footprint-aware hand-back, travel-direction zoned scan, goal watchdog (unreachable goals are replaced by open-road goals),
//                  prediction params (inert without threatIds), selfCalibrate (the longitudinal actuator identifies itself at the first launch, see av-control-longitudinal.js).
//  chaser-evasion  car + style 'escape' (manoeuvres / reversing as fast as the plan can be stopped, not 3 m/s) + pursuit evasion tuning (obstacle slow radius 1 m, minSpeed 9.4, comfortDecel 4, wThreat, hit floor, flee layer); give it `threatIds`.
//  maze            car + persistent static map + 2D goal-distance field (goals behind walls, dead ends, pockets).
//  arena           chaser-evasion + maze.
var AV_PRESET_CAR = {
  budget: 'eco',
  selfCalibrate: true,
  curveSmooth: 0.6,
  curveDeadband: 0.004,
  switchMargin: 3,
  handbackMargin: 0.9,
  maneuverRunSpeed: 7,
  fleeStoppedSpeed: 1.5,
  fwdFovDeg: 70,
  goalWatchdog: 10,
  wRequired: 300,
  threatRadius: 2.8,
  threatBodyRadius: 4.5,
  threatTurnRate: 1.5,
  threatTurnMin: 0.5,
  threatHorizon: 4,
  threatAccel: 7,
  chasedDecel: 9,
}
// 'saver' budget (params.saver: true on top of budget 'eco', works with or without params.preset): thinner ray sets and slower field rebuilds. The big win is the engine's stage tick decimation (`tickEvery` in a stage scope, see feature-av-stack.md "Saver").
var AV_PRESET_SAVER = { fieldEvery: 1 }
var AV_PRESET_EVASION = { style: 'escape', wThreat: 30, threatHitFloor: 250, comfortDecel: 4, minSpeed: 9.4, obstacleSlowRadius: 1 }
var AV_PRESET_MAZE = { staticMap: true, fieldHeuristic: true }
// preset table for params.preset (null = none). Built once per preset name; fleeArea defaults to the drivable area, else a 740 m box around the START position.
function avPreset(params, state, pos) {
  var name = params.preset
  var none = !name || name === 'none'
  if (none && !params.saver) return null
  var cacheKey = (none ? 'none' : name) + (params.saver ? '+saver' : '')
  if (state.presetName === cacheKey && state.preset) return state.preset
  name = cacheKey
  var base = {}
  var layers = none ? [] : [AV_PRESET_CAR]
  if (name.indexOf('chaser-evasion') === 0 || name.indexOf('arena') === 0) layers.push(AV_PRESET_EVASION)
  if (name.indexOf('maze') === 0 || name.indexOf('arena') === 0) layers.push(AV_PRESET_MAZE)
  if (params.saver) layers.push(AV_PRESET_SAVER)
  for (var li = 0; li < layers.length; li++) for (var k in layers[li]) base[k] = layers[li][k]
  // flee / own-goal area (open ground: no limit, candidates are 50-110 m away)
  if (!none && !params.fleeArea) base.fleeArea = params.drivableArea || [pos[0] - 370, pos[0] + 370, pos[2] - 370, pos[2] + 370]
  state.presetName = name
  state.preset = base
  return base
}
function transform(input, dt, params, state, api) {
  var preset = avPreset(params, state, input.position)
  if (preset) params = state.pmP === params ? state.pm : ((state.pmP = params), (state.pm = Object.assign({}, preset, params)))
  // fresh blackboard every frame (the input object is reused by the runtime)
  var prevAv = input.av
  var av = (input.av = {})
  // work counters (CPU budget measure, integers only, no effect on behaviour): av.work is this frame's tally, filled by perception (rays), route planner (astarExp, fieldCells) and motion planner (freeLen, cands);
  // the tally of last frame (complete: every stage has run) is added to a cumulative total published as watch 'av.work' = 'rays freeLen cands astarExp fieldCells' (fixtures read it at the end of a run)
  av.work = { rays: 0, freeLen: 0, cands: 0, astarExp: 0, fieldCells: 0 }
  var wt = state.workTot || (state.workTot = [0, 0, 0, 0, 0])
  if (prevAv && prevAv.work) {
    var pw = prevAv.work
    wt[0] += pw.rays
    wt[1] += pw.freeLen
    wt[2] += pw.cands
    wt[3] += pw.astarExp
    wt[4] += pw.fieldCells
  }
  api.watch('av.work', wt.join(' '))
  // visibility (Watch panel): the active budget ('saver' = eco + saver flag) and this car's smoothed chain cost in ms per frame (input.chainMs, measured by the runtime; every 20th frame)
  state.msN = (state.msN || 0) + 1
  if (state.msN % 20 === 1) {
    api.watch('av.budget', params.saver ? 'saver' : params.budget || 'full')
    if (typeof input.chainMs === 'number') api.watch('av.ms', input.chainMs.toFixed(2))
  }
  if (preset) av.preset = preset
  // the route planner (fieldHeuristic) leaves the obstacle-aware distance to its goal on last frame's blackboard (goal watchdog: a long detour is progress)
  if (prevAv && prevAv.fieldGoal) av.prevField = prevAv.fieldGoal
  // economy mode: last frame's goal fixation (av-motion-planner) steers this frame's narrow perception cone
  if (prevAv && prevAv.fix) av.prevFix = prevAv.fix
  // scanFocus (av-perception): last frame's route / carrot / blocked plan decide whether this frame's perception may stay narrow
  if (prevAv) {
    av.prevRoute = prevAv.route
    av.prevCarrot = prevAv.carrot
    av.prevRoutePath = prevAv.routePath
    av.prevBlocked = !!(prevAv.plan && (prevAv.plan.blocked || prevAv.plan.override || !(prevAv.plan.free >= 0.9 * prevAv.plan.horizon)))
  }
  // last frame's persistent static map (gapWalls: free run of the escape headings)
  if (prevAv && prevAv.smap) av.prevSmap = prevAv.smap
  // last frame's remembered dynamic marks (maze module: stopped cars add cost to the escape route)
  if (prevAv && prevAv.dyn) av.prevDyn = prevAv.dyn
  // a goal source running in front of this stage hands its mission over via input.goalSource (see av-wander.js)
  if (input.goalSource) {
    av.mission = input.goalSource
    input.goalSource = undefined
  }
  // Goal contract: a source that declares `input.target.isFinal === false` (preset wanderer, ...) makes the stack cruise
  // through its goals instead of braking at each one. (Sources without that flag are single, final goals.)
  if (!av.mission && input.target && input.target.pose && input.target.isFinal === false) {
    var tp = input.target.pose.position
    av.mission = { index: 0, waypoints: [[tp[0], tp[2]]], isFinal: false }
  }
  if (state.t === undefined) {
    state.t = 0
    state.speedF = 0
    state.prevSpeed = 0
    state.accelF = 0
  }
  state.t += dt
  // Manual keyboard override (manualOverride: true): the pipe's `input` stage (priority 1, ahead of this stage) maps the keys to the car actions
  // (throttle / brake / steer_left / steer_right / jump). Any non-zero action = a key is down: the timer restarts every frame while held and
  // av.manual stays true for overrideHold s (default 1) after the last key. The control stages (lateral, longitudinal) yield while av.manual
  // (no steering / throttle output, the keys drive car2); the AEB does NOT yield (safety). manualOverride off: the key actions are dropped here
  // (the avatar gate of the input stage lets keys through for the controlled car), so default behaviour is unchanged.
  var keyDown = false
  for (var ak in input.actions) {
    if (input.actions[ak]) {
      keyDown = true
      break
    }
  }
  if (params.manualOverride === true) {
    if (keyDown) state.keyT = state.t
    var holdS = params.overrideHold != null ? params.overrideHold : 1
    av.manual = keyDown || (state.keyT !== undefined && state.t - state.keyT < holdS)
    api.watch('av.manual', av.manual ? (keyDown ? 'keys' : (holdS - (state.t - state.keyT)).toFixed(1) + ' s') : 'off')
  } else {
    av.manual = false
    if (keyDown) {
      input.actions.throttle = 0
      input.actions.brake = 0
      input.actions.steer_left = 0
      input.actions.steer_right = 0
      input.actions.jump = 0
    }
  }
  // Vehicle footprint: never plan with a hull smaller than the entity's own box collider (a 4 x 8 m body driven with the
  // 2 x 4 defaults touches every neighbour). params.vehicleWidth / vehicleLength can only enlarge it. Cached (getEntity copies).
  if (state.vehT === undefined || state.t - state.vehT > 2) {
    state.vehT = state.t
    var ent = api.getEntity(input.entityId)
    var sh = ent && ent.shape
    var sc = (ent && ent.scale) || [1, 1, 1]
    state.vehW = sh && sh.type === 'box' ? Math.abs(sh.width * (sc[0] || 1)) : 0
    state.vehL = sh && sh.type === 'box' ? Math.abs(sh.depth * (sc[2] || 1)) : 0
    state.vehH = sh && sh.type === 'box' ? Math.abs(sh.height * (sc[1] || 1)) : 0
  }
  av.vehicle = {
    width: Math.max(params.vehicleWidth || 2, state.vehW || 0),
    length: Math.max(params.vehicleLength || 4, state.vehL || 0),
    height: state.vehH || 0,
  }
  var up = api.getUpVector(input.rotation)
  var fwd = api.vec.normalize(api.vec.projectOntoPlane(api.getForwardVector(input.rotation), up))
  var left = api.vec.normalize(api.vec.cross(up, fwd))
  var speed = api.vec.getForwardSpeed(input.velocity, fwd)
  var yawRate = api.vec.dot(input.angularVelocity, up)
  var a = dt > 1e-6 ? (speed - state.prevSpeed) / dt : 0
  state.prevSpeed = speed
  state.accelF += (a - state.accelF) * Math.min(1, dt * 8)
  state.speedF += (speed - state.speedF) * Math.min(1, dt * 20)
  av.ego = {
    t: state.t,
    dt: dt,
    pos: input.position,
    fwd: fwd,
    left: left,
    up: up,
    speed: speed,
    speedF: state.speedF,
    accel: state.accelF,
    yawRate: yawRate,
    kappa: Math.abs(speed) > 1.5 ? yawRate / speed : 0,
  }
  var tids = params.threatIds
  if (tids && tids.length) {
    if (!state.trk) state.trk = {}
    var thrs = []
    var tRange = params.threatRange || 120
    var farRange = params.gapCommit !== false ? (params.gapTrackRange != null ? params.gapTrackRange : 160) : 0
    var far = []
    var tdt = dt > 1e-6 ? dt : 1 / 60
    for (var ti = 0; ti < tids.length; ti++) {
      var tpos = api.getWorldPosition(tids[ti])
      if (!tpos) continue
      var rec = state.trk[tids[ti]]
      if (!rec) rec = state.trk[tids[ti]] = { x: tpos[0], z: tpos[2], vx: 0, vz: 0, psi: null, w: 0, wmax: null, age: 0 }
      else {
        rec.age += tdt
        rec.vx += 0.5 * ((tpos[0] - rec.x) / tdt - rec.vx)
        rec.vz += 0.5 * ((tpos[2] - rec.z) / tdt - rec.vz)
        rec.x = tpos[0]
        rec.z = tpos[2]
        // observed turn rate of the body (heading of its filtered velocity): the largest recent value is a lower bound of what it can do (a pursuer
        // that is saturated turns at its limit); the planner predicts it with that instead of a fixed worst case (see threatTurnMin)
        if (rec.vx * rec.vx + rec.vz * rec.vz > 16) {
          var psi = Math.atan2(rec.vz, rec.vx)
          if (rec.psi !== null) {
            var dpsi = psi - rec.psi
            while (dpsi > Math.PI) dpsi -= 2 * Math.PI
            while (dpsi < -Math.PI) dpsi += 2 * Math.PI
            rec.w += Math.min(1, tdt * 8) * (Math.abs(dpsi) / tdt - rec.w)
            rec.wmax = rec.wmax === null ? rec.w : Math.max(rec.w, rec.wmax - 0.3 * tdt)
          }
          rec.psi = psi
        } else rec.psi = null
      }
      var tdx = rec.x - input.position[0]
      var tdz = rec.z - input.position[2]
      var tEnt = { id: tids[ti], x: rec.x, z: rec.z, vx: rec.vx, vz: rec.vz, turn: rec.wmax, age: rec.age }
      if (tdx * tdx + tdz * tdz < tRange * tRange) thrs.push(tEnt)
      if (tdx * tdx + tdz * tdz < Math.max(tRange, farRange) * Math.max(tRange, farRange)) far.push(tEnt)
    }
    av.threats = thrs
    av.threatsFar = far
  }
  scoreKeeping(av, input, params, state, api)
  if (params.fleeArea && input.target && input.target.pose && ((tids && tids.length) || params.goalWatchdog > 0)) fleeGoal(av, av.threats || [], input, params, state, api)
  api.watch('av.speed', Math.round(speed * 10) / 10)
  if (state.flee) api.watch('av.flee', Math.round(state.flee.x) + ',' + Math.round(state.flee.z))
  if (params.debugDraw !== false) {
    // cyan: velocity vector
    api.visualizeLine(input.position, api.vec.add(input.position, api.vec.scale(input.velocity, 0.6)), '#00e5ff')
  }
  return {}
}

// Score / damage bookkeeping (debug / game, no effect on driving). Runs BEFORE the flee layer replaces input.target, so `goal` is the source's own goal.
//  goalsReached: the goal source replaced its goal while the car was within `goalReachDist` (12 m; a source's own accept radius, e.g. the wanderer preset's positionEpsilon, plus a metre) of the old one. A jump of the goal by more than
//    8 m between frames counts as "replaced" (a `follow` goal drifts, it never jumps); flee goals never count. av.goalRaw = the source's goal [x, z]; av.goalReachDist = the radius (overlay ring).
//  hits (damage): per tracked threat (`threatIds`) one hit per approach episode: its centre comes within `damageDist` (8 m), re-armed once it is farther than `damageClear` (14 m).
//  params.hud === true: the totals go to the game HUD (api.setScore / api.setDamage; Play, Builder View -> Game HUD). Watch rows av.goals / av.hits (on change).
function scoreKeeping(av, input, params, state, api) {
  var pos = input.position
  var reachD = params.goalReachDist != null ? params.goalReachDist : 12
  av.goalReachDist = reachD
  var sc = state.sc
  if (!sc) sc = state.sc = { goals: 0, hits: 0, g: null, near: {}, shown: '' }
  var tp = input.target && input.target.pose && input.target.pose.position
  if (tp) {
    var gx = tp[0]
    var gz = tp[2]
    if (sc.g && (gx - sc.g[0]) * (gx - sc.g[0]) + (gz - sc.g[1]) * (gz - sc.g[1]) > 64 && Math.hypot(pos[0] - sc.g[0], pos[2] - sc.g[1]) <= reachD) sc.goals++
    sc.g = [gx, gz]
    av.goalRaw = sc.g
  }
  var tids = params.threatIds
  if (tids && state.trk) {
    var dd = params.damageDist != null ? params.damageDist : 8
    var dc = params.damageClear != null ? params.damageClear : 14
    for (var i = 0; i < tids.length; i++) {
      var rec = state.trk[tids[i]]
      if (!rec) continue
      var d = Math.hypot(rec.x - pos[0], rec.z - pos[2])
      if (sc.near[tids[i]]) {
        if (d > dc) sc.near[tids[i]] = false
      } else if (d < dd) {
        sc.near[tids[i]] = true
        sc.hits++
      }
    }
  }
  av.goalsReached = sc.goals
  av.hits = sc.hits
  var key = sc.goals + ',' + sc.hits
  if (key !== sc.shown) {
    sc.shown = key
    api.watch('av.goals', sc.goals)
    api.watch('av.hits', sc.hits)
    if (params.hud === true) {
      api.setScore(sc.goals)
      api.setDamage(sc.hits)
    }
  }
}

// Flee layer: when the way to the goal leads past a near pursuer, drive to a goal that is away from the pursuers instead
// (candidates on a ring around the car, scored by clearance from the pursuers, heading away, alignment with the real goal and the car's heading).
function fleeGoal(av, thrs, input, params, state, api) {
  var pos = input.position
  var g0 = input.target.pose.position
  var area = params.fleeArea
  var R = params.fleeRadius != null ? params.fleeRadius : 16
  function danger(gx, gz) {
    var sx = gx - pos[0]
    var sz = gz - pos[2]
    var sl2 = sx * sx + sz * sz + 1e-6
    for (var i = 0; i < thrs.length; i++) {
      // fleeStoppedSpeed (m/s, default 0 = off): a stopped body (parked car, stalled chaser) is an obstacle for the planners (memory + prediction), not a reason to flee elsewhere
      if (params.fleeStoppedSpeed > 0 && thrs[i].vx * thrs[i].vx + thrs[i].vz * thrs[i].vz < params.fleeStoppedSpeed * params.fleeStoppedSpeed) continue
      var qx = thrs[i].x - pos[0]
      var qz = thrs[i].z - pos[2]
      if (qx * qx + qz * qz > 90 * 90) continue
      var dot = qx * sx + qz * sz
      if (dot <= 0) continue
      var tt = Math.min(1, dot / sl2)
      var ddx = qx - sx * tt
      var ddz = qz - sz * tt
      if (ddx * ddx + ddz * ddz < R * R) return true
    }
    return false
  }
  var fl = state.flee
  var now = state.t
  var bad = false
  if (params.goalWatchdog > 0) {
    var wd = state.wd
    var gDist = Math.sqrt((g0[0] - pos[0]) * (g0[0] - pos[0]) + (g0[2] - pos[2]) * (g0[2] - pos[2]))
    var pf = av.prevField
    var usesField = !!(pf && Math.abs(pf.x - g0[0]) < 1.5 && Math.abs(pf.z - g0[2]) < 1.5 && pf.d < 1e8)
    if (usesField) gDist = pf.d
    if (!wd || Math.abs(wd.x - g0[0]) > 1 || Math.abs(wd.z - g0[2]) > 1 || (wd.f && !usesField)) wd = state.wd = { x: g0[0], z: g0[2], best: gDist, t: now, bad: false, f: usesField }
    else if (usesField && !wd.f) {
      // the obstacle-aware distance replaces the euclidean one: restart the window with it
      wd.f = true
      wd.best = gDist
      wd.t = now
    } else if (gDist < wd.best - 8) {
      wd.best = gDist
      wd.t = now
    } else if (now - wd.t > params.goalWatchdog) wd.bad = true
    // the obstacle-aware distance says the goal is reachable without crossing a known wall (a field value >= 600 m crosses one): a long detour is not an unreachable goal
    if (usesField && pf.d < 600) {
      wd.bad = false
      wd.t = now
    }
    bad = wd.bad
    av.goalBad = bad
    // goalGiveUp (s after the watchdog flagged the goal, 0 = off): tell the goal source (input.goalFeedback, read by the wanderer preset / av-wander, one frame late) that this goal cannot be reached, so it picks another one
    // instead of the car fleeing for ever (measured: the flagged goal is kept for the rest of the run and 19 % of all frames are spent in it); the new goal is at most goalGiveUpDistance (150) m away.
    var gGive = params.goalGiveUp != null ? params.goalGiveUp : 0
    if (gGive > 0 && bad) {
      if (wd.badT === undefined) wd.badT = now
      if (!wd.gave && now - wd.badT >= gGive) {
        wd.gave = true
        var gfb = input.goalFeedback || (input.goalFeedback = {})
        gfb[input.entityId] = { giveUp: true, maxDistance: params.goalGiveUpDistance != null ? params.goalGiveUpDistance : 150 }
      }
    }
  }
  var gap = params.gapCommit !== false
  var sim = params.fleeSim === true || gap
  var simQ = null
  var simThrs = null
  var simGoalD = 1e9
  var simYaw = 0
  if (sim) {
    var eR = params.escapeRange != null ? params.escapeRange : 160
    simThrs = []
    var simSrc = av.threatsFar || thrs
    for (var si = 0; si < simSrc.length; si++) {
      var sdx = simSrc[si].x - pos[0]
      var sdz = simSrc[si].z - pos[2]
      if (sdx * sdx + sdz * sdz < eR * eR) simThrs.push(simSrc[si])
    }
    simQ = {
      dt: 0.1,
      H: params.escapeHorizon != null ? params.escapeHorizon : 5,
      kmax: params.maxCurvature || 0.115,
      aLat: params.escapeLatAccel != null ? params.escapeLatAccel : 12,
      aUp: params.escapeAccel != null ? params.escapeAccel : gap ? 9 : 15,
      aDown: params.chasedDecel || 9,
      vTop: params.escapeSpeed != null ? params.escapeSpeed : 36,
      vTurn: params.escapeTurnSpeed != null ? params.escapeTurnSpeed : 12,
      lead: params.threatLead != null ? params.threatLead : 0.3,
      turnMax: params.threatTurnRate || 1.5,
      turnMin: params.threatTurnMin || 0,
    }
    // gapCommit alone only acts against >= 2 pursuers (a lone chaser keeps the geometric flee layer)
    if (gap && params.fleeSim !== true && simThrs.length < 2) sim = false
    // gapWarmup (s, 0 = off): a pursuer's filtered velocity needs a few frames; before that it reads as parked and the sim calls every heading safe (a heading committed at t = 0.02 s that was never revised)
    var gw = params.gapWarmup != null ? params.gapWarmup : gap ? 0.1 : 0
    if (sim && gw > 0 && !fl) {
      for (var wi = 0; wi < simThrs.length; wi++)
        if (simThrs[wi].age < gw) {
          av.fleeing = false
          return
        }
    }
    simYaw = Math.atan2(av.ego.fwd[2], av.ego.fwd[0])
    // escapeTriggerHorizon (s, 0 = off): a flee is only STARTED when the heading to the real goal is predicted to meet a pursuer within this shorter horizon (intercept-based: a chaser that needs > 3.5 s to get to the car's line does not
    // make it flee); once fleeing, the full escapeHorizon keeps judging (hysteresis, and fleeRelease).
    var qTrig = simQ
    if (params.escapeTriggerHorizon > 0 && !fl && params.escapeTriggerHorizon < simQ.H) qTrig = Object.assign({}, simQ, { H: params.escapeTriggerHorizon })
    if (sim && simThrs.length) simGoalD = escapeSim(simThrs, pos, simYaw, Math.max(0, av.ego.speedF), Math.atan2(g0[2] - pos[2], g0[0] - pos[0]), 0, qTrig)
  }
  var simDanger = sim && simThrs.length > 0 && simGoalD < (params.escapeTrigger != null ? params.escapeTrigger : 16)
  // fleeRelease (default on, false = off): a committed gap goal is an absolute point ~150 m away that is held until the car is within 25 m of it, i.e. the car flees for many seconds although the pursuers
  // are 50-150 m away and the real goal is safe again (measured: 59 % of the flee frames have the nearest chaser > 40 m away). Release it once the simulated run to the REAL goal keeps
  // >= fleeReleaseD (30 m, trigger is 16) from every pursuer for fleeReleaseT (1 s) with a clear straight way (the persistent static map shows a free straight run to the goal (fleeReleaseRun 80 m); not while the watchdog says the goal is unreachable): the car drives to its goal again.
  // Maze module (mazeModule, default off): in a confined space the open-ground flee logic below is replaced by a waypoint on the least-resistance route to the nearest reachable exit (see mazeStep).
  if (params.mazeModule === true) {
    var mzr = mazeStep(av, input, params, state, api, thrs)
    if (mzr.on) {
      var mzNear = false
      var mzRange = params.mazeThreatRange != null ? params.mazeThreatRange : 60
      for (var mi = 0; mi < thrs.length; mi++) {
        var mvx = thrs[mi].vx
        var mvz = thrs[mi].vz
        if (mvx * mvx + mvz * mvz > 4 && Math.pow(thrs[mi].x - pos[0], 2) + Math.pow(thrs[mi].z - pos[2], 2) < mzRange * mzRange) mzNear = true
      }
      if (bad || simDanger || mzNear || danger(g0[0], g0[2])) state.mzT = now
      if (state.mzT !== undefined && now - state.mzT < (params.mazeHold != null ? params.mazeHold : 3) && mzr.goal) {
        state.flee = { maze: true, x: mzr.goal[0], z: mzr.goal[1], t: now, t0: fl && fl.maze ? fl.t0 : now }
        av.fleeing = true
        av.mazeFlee = true
        input.target.pose.position = [mzr.goal[0], g0[1], mzr.goal[1]]
        return
      }
    }
    if (fl && fl.maze) fl = state.flee = null
  }
  if (params.fleeRelease !== false && sim && fl && fl.gap && !bad) {
    // direct way: the obstacle-aware field belongs to the FLEE goal while fleeing (the route planner targets it), so the real goal's directness is read from the persistent static map: a free straight run
    // (car half-width + 3.5 m) over min(goal distance, fleeReleaseRun 80 m); an empty map reads as free
    var gdR = Math.hypot(g0[0] - pos[0], g0[2] - pos[2])
    var directGoal = true
    if (av.prevSmap && av.prevSmap.list && av.prevSmap.list.length) {
      var rr = Math.min(gdR, params.fleeReleaseRun != null ? params.fleeReleaseRun : 80)
      directGoal = freeRun(wallGrid(av.prevSmap.list, state), pos[0], pos[2], Math.atan2(g0[2] - pos[2], g0[0] - pos[0]), rr, 3.5) >= rr - 2
    }
    if (directGoal && simGoalD > (params.fleeReleaseD != null ? params.fleeReleaseD : 30) && !danger(g0[0], g0[2]) && now - fl.t0 > (params.escapeHold != null ? params.escapeHold : 1.5)) {
      if (fl.rel === undefined) fl.rel = now
      if (now - fl.rel >= (params.fleeReleaseT != null ? params.fleeReleaseT : 1)) {
        state.flee = null
        av.fleeing = false
        return
      }
    } else fl.rel = undefined
  }
  if (sim && fl && fl.gap && fl.gx != null) {
    var gdx = fl.gx - pos[0]
    var gdz = fl.gz - pos[2]
    if (gdx * gdx + gdz * gdz > 25 * 25) simDanger = true
  }
  if (sim && fl && now - fl.t0 < (params.escapeHold != null ? params.escapeHold : 1.5)) simDanger = true
  if (!sim && fl && fl.gap) fl = state.flee = null
  if (!bad && !simDanger && !danger(g0[0], g0[2])) {
    state.flee = null
    av.fleeing = false
    return
  }
  if (sim && simThrs.length) {
    if (fleeSim(av, input, params, state, g0, area, fl, now, simThrs, simQ, simYaw) !== false) return
    fl = null
  }
  if (fl) {
    var rdx = fl.x - pos[0]
    var rdz = fl.z - pos[2]
    if (now - fl.t > (params.fleeHold != null ? params.fleeHold : 4) || rdx * rdx + rdz * rdz < 15 * 15 || (!bad && danger(fl.x, fl.z))) fl = null
  }
  if (!fl) {
    var dMin = params.fleeMinDist != null ? params.fleeMinDist : 50
    var dMax = params.fleeMaxDist != null ? params.fleeMaxDist : 110
    var hx = av.ego.fwd[0]
    var hz = av.ego.fwd[2]
    var gl = Math.sqrt((g0[0] - pos[0]) * (g0[0] - pos[0]) + (g0[2] - pos[2]) * (g0[2] - pos[2])) + 1e-6
    var fleeTurnPen = params.fleeTurnPenalty != null ? params.fleeTurnPenalty : 1.5
    var losCache = {}
    var og = params.goalOpen !== false && av.prevSmap && av.prevSmap.list && av.prevSmap.list.length ? wallGrid(av.prevSmap.list, state) : null
    var oW = params.goalOpenW != null ? params.goalOpenW : 1.5
    var oR = params.goalOpenRadius != null ? params.goalOpenRadius : 15
    var best = null
    var bestS = -Infinity
    for (var pass = 0; pass < 2 && !best; pass++) {
      for (var ai = 0; ai < 24; ai++) {
        var ang = (ai * Math.PI * 2) / 24
        var ux = Math.cos(ang)
        var uz = Math.sin(ang)
        for (var dd = dMin; dd <= dMax + 1e-6; dd += (dMax - dMin) / 2 || 1) {
          var cx = pos[0] + ux * dd
          var cz = pos[2] + uz * dd
          if (cx < area[0] + 10 || cx > area[1] - 10 || cz < area[2] + 10 || cz > area[3] - 10) continue
          if (pass === 0 && danger(cx, cz)) continue
          var clear = 150
          var away = 0
          var ws = 0
          for (var k = 0; k < thrs.length; k++) {
            var ex = cx - thrs[k].x
            var ez = cz - thrs[k].z
            var ed = Math.sqrt(ex * ex + ez * ez)
            if (ed < clear) clear = ed
            var px = pos[0] - thrs[k].x
            var pz = pos[2] - thrs[k].z
            var pd = Math.sqrt(px * px + pz * pz) + 1e-6
            if (pd < 90) {
              var wg = 1 / (pd + 10)
              away += (wg * (ux * px + uz * pz)) / pd
              ws += wg
            }
          }
          // a flee goal that needs a big turn is reached at curve speed (a hairpin is ~9 m/s): a chaser at 20+ m/s catches the car in the turn
          // (head-on chaser: the 'away' goal behind the car sent it into a U-turn across the chaser's nose). Penalise the turn beyond ~70 deg.
          var los = 0
          if (params.fleeLos === true) {
            var lk = ai + ':' + Math.round(dd)
            if (!losCache[lk]) {
              var lr = api.raycast([pos[0] + ux * 5, pos[1], pos[2] + uz * 5], [ux, 0, uz], dMax + 10, { visualize: false })
              losCache[lk] = lr.hit ? lr.distance + 5 : dMax + 15
            }
            var freeLen = losCache[lk]
            los = freeLen < dd * 0.85 ? -2 + freeLen / dd : 0.4 * Math.min(1, freeLen / dMax)
          }
          var turn = Math.acos(Math.max(-1, Math.min(1, ux * hx + uz * hz)))
          var op = og && oW > 0 ? oW * (Math.min(1, openCells(og, cx, cz, oR) / 100) + (params.goalOpenLine === true ? wallShare(og, pos[0], pos[2], cx, cz) : 0)) : 0
          var sc = -op + clear / 150 + (ws > 0 ? away / ws : 0) + (bad ? 0 : 0.5) * ((ux * (g0[0] - pos[0]) + uz * (g0[2] - pos[2])) / gl) + 0.7 * (ux * hx + uz * hz) + los - fleeTurnPen * Math.max(0, (turn - 1.2) / 1.9)
          if (sc > bestS) {
            bestS = sc
            best = [cx, cz]
          }
        }
      }
    }
    if (best) fl = { x: best[0], z: best[1], t: now }
  }
  state.flee = fl
  av.fleeing = !!fl
  if (fl) input.target.pose.position = [fl.x, g0[1], fl.z]
}

// Maze module (params.mazeModule true, default off). Runs inside the flee layer of this stage from last frame's blackboard (av.prevSmap = the persistent static map, av.prevDyn = remembered dynamic marks).
//  1. Confined: 16 rays over the static map (mazeRange 18 m): share of blocked directions >= mazeEnter (0.6) = confined, < mazeLeave (0.4) = free again (hysteresis; a corridor reads ~0.75, a crossing ~0.5, a wall beside open ground ~0.5).
//  2. Exit field: a 2 m grid window (144 x 144 cells) around the car, wall cells inflated by half the vehicle width + 0.8 m (as the route planner field), unknown cells free (optimistic, the car explores and the
//     field is rebuilt as walls appear). Open ground = cells with at most mazeOpenCells wall cells within mazeOpenRadius (20 m). A multi-source Dijkstra from ALL open cells gives the cost to the nearest reachable exit
//     (field distance, not straight line); cells next to known walls cost mazeWallCost 400 x (a route that has to cross one is no escape route). Cars add cost, they do not block: stopped cars (remembered marks not
//     near a moving threat, tracked stopped threats) mazeCarRadius 8 m flat (marks: 4 m) at cost x (1 + mazeBlockPen 30), moving chasers a linear zone of mazeChaserRadius 14 m at the car and along its velocity for mazeChaserLead 2 s, cost x (1 + mazeCarPen 6).
//     The route is the steepest descent of the field from the car (the path of least resistance); the exit is its last cell.
//  3. Hysteresis: the kept route is re-costed on the new field and replaced only when the new one is mazeSwitch (25 %) cheaper. Rebuild at most every mazeEvery (0.4 s) when the map, the car zones or the car cell changed.
//  4. The flee goal = a held waypoint on the route: the first route corner >= 12 m ahead, at most mazeLead (25 m) ahead (the exit itself at the end); the next one when the car is within mazeReach (10 m). The route planner then drives it with its own goal-distance field.
// Blackboard: av.maze = {on, share, route, exit, cost, goal, why}; watch 'av.maze'.
function mazeStep(av, input, params, state, api, thrs) {
  var mz = state.mz || (state.mz = { on: false, share: 0, ver: -1, tB: -99, sig: '', route: null, cost: 0, idx: 0, why: '', shown: '' })
  var now = state.t
  var pos = input.position
  var list = av.prevSmap && av.prevSmap.list
  var res = { on: false, goal: null }
  if (!list || !list.length) {
    mz.on = false
    mz.route = null
    mazeWatch(mz, api, 'off')
    return res
  }
  var g = wallGrid(list, state)
  var range = params.mazeRange != null ? params.mazeRange : 18
  var nb = 0
  for (var i = 0; i < 16; i++) if (freeRun(g, pos[0], pos[2], (i * Math.PI) / 8, range, 2) < range - 2) nb++
  mz.share = nb / 16
  if (!mz.on && mz.share >= (params.mazeEnter != null ? params.mazeEnter : 0.6)) mz.on = true
  else if (mz.on && mz.share < (params.mazeLeave != null ? params.mazeLeave : 0.4)) {
    mz.on = false
    mz.route = null
    mz.ver = -1
  }
  if (!mz.on) {
    mazeWatch(mz, api, 'free ' + Math.round(mz.share * 100) + '%')
    return res
  }
  // car zones signature: the rebuild waits for a change of the map or of the zones
  var sig = ''
  var dyn = av.prevDyn
  for (var ti = 0; ti < thrs.length; ti++) sig += Math.round(thrs[ti].x / 4) + ',' + Math.round(thrs[ti].z / 4) + ';'
  sig += dyn ? dyn.length + ':' + Math.round(dyn.length ? dyn[0][0] / 3 : 0) : '0'
  var every = params.mazeEvery != null ? params.mazeEvery : 0.4
  if ((list.length !== mz.ver || sig !== mz.sig || !mz.route) && now - mz.tB >= every) {
    mz.tB = now
    mz.ver = list.length
    mz.sig = sig
    var seenR = params.mazeSeenRange != null ? params.mazeSeenRange : 70
    if (seenR > 0) mazeSee(mz, g, pos, seenR)
    mazeBuild(mz, list, dyn, thrs, pos, params, av)
  }
  res.on = true
  if (mz.route) {
    // goal: the point mazeLead m ahead of the car along the kept route (nearest route point searched forward, the route is monotone)
    var rt = mz.route
    var bi = mz.idx
    var bd = 1e18
    for (var k = mz.idx; k < Math.min(rt.length, mz.idx + 40); k++) {
      var dd = (rt[k][0] - pos[0]) * (rt[k][0] - pos[0]) + (rt[k][1] - pos[2]) * (rt[k][1] - pos[2])
      if (dd < bd) {
        bd = dd
        bi = k
      }
    }
    mz.idx = bi
    var lead = params.mazeLead != null ? params.mazeLead : 25
    // the waypoint is held (a stable goal for the route planner) until the car is within mazeReach of it; the next one is the first route corner (heading change > 30 deg) 12 m or more ahead, at the latest `lead` m ahead
    // (the exit itself at the end of the route)
    if (mz.wpRoute !== rt || !mz.wp || Math.hypot(mz.wp[0] - pos[0], mz.wp[1] - pos[2]) < (params.mazeReach != null ? params.mazeReach : 10)) {
      var acc = 0
      var gi = bi
      while (gi < rt.length - 1) {
        acc += Math.hypot(rt[gi + 1][0] - rt[gi][0], rt[gi + 1][1] - rt[gi][1])
        gi++
        if (acc >= lead) break
        if (acc >= 12 && gi >= 4 && gi + 4 < rt.length) {
          var ux = rt[gi][0] - rt[gi - 4][0]
          var uz = rt[gi][1] - rt[gi - 4][1]
          var wx = rt[gi + 4][0] - rt[gi][0]
          var wz = rt[gi + 4][1] - rt[gi][1]
          if (ux * wx + uz * wz < 0.866 * Math.hypot(ux, uz) * Math.hypot(wx, wz)) break
        }
      }
      mz.wp = rt[gi]
      mz.wpRoute = rt
    }
    res.goal = mz.wp
    mz.goal = mz.wp
  } else mz.goal = null
  av.maze = { on: true, share: mz.share, route: mz.route, exit: mz.route ? mz.route[mz.route.length - 1] : null, cost: mz.cost, goal: mz.goal, why: mz.why }
  mazeWatch(mz, api, 'confined ' + Math.round(mz.share * 100) + '% ' + (mz.route ? (mz.explore ? 'explore ' : '') + 'exit ' + Math.round(mz.route[mz.route.length - 1][0]) + ',' + Math.round(mz.route[mz.route.length - 1][1]) + ' cost ' + Math.round(mz.cost / 5) * 5 : mz.why))
  return res
}
function mazeWatch(mz, api, txt) {
  if (txt !== mz.shown) {
    mz.shown = txt
    api.watch('av.maze', txt)
  }
}
// cells in line of sight of the car on the static map (rays every 5 deg, marched to the first wall cell or `range`): the places the car has seen; kept for the run (2 m cells, same keys as wallGrid)
function mazeSee(mz, g, pos, range) {
  var seen = mz.seen || (mz.seen = {})
  if (!mz.seenList) mz.seenList = []
  for (var i = 0; i < 72; i++) {
    var a = (i * Math.PI) / 36
    var rd = freeRun(g, pos[0], pos[2], a, range, 2)
    var cx = Math.cos(a)
    var cz = Math.sin(a)
    for (var d = 0; d <= rd; d += 2) {
      var ix = Math.floor((pos[0] + cx * d) / 2)
      var iz = Math.floor((pos[2] + cz * d) / 2)
      if (!seen[ix * 100003 + iz]) {
        seen[ix * 100003 + iz] = 1
        mz.seenList.push(ix, iz)
      }
    }
  }
}
// (re)build the exit field and pick / keep the escape route
function mazeBuild(mz, list, dyn, thrs, pos, params, av) {
  var cs = 2
  var half = 128
  var wx0 = Math.floor(pos[0] / 32) * 32 - half
  var wz0 = Math.floor(pos[2] / 32) * 32 - half
  var W = Math.round((2 * half + 32) / cs)
  var H = W
  var N = W * H
  var rInf = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2 + 0.8
  var rc = Math.ceil(rInf / cs)
  var raw = new Uint8Array(N)
  var inf = new Uint8Array(N)
  for (var i = 0; i < list.length; i++) {
    var ix = Math.floor((list[i][0] - wx0) / cs)
    var iz = Math.floor((list[i][1] - wz0) / cs)
    if (ix < 0 || iz < 0 || ix >= W || iz >= H) continue
    raw[ix * H + iz] = 1
    for (var ox = -rc; ox <= rc; ox++) {
      for (var oz = -rc; oz <= rc; oz++) {
        var jx = ix + ox
        var jz = iz + oz
        if (jx < 0 || jz < 0 || jx >= W || jz >= H) continue
        var ex = wx0 + (jx + 0.5) * cs - list[i][0]
        var ez = wz0 + (jz + 0.5) * cs - list[i][1]
        if (ex * ex + ez * ez <= (rInf + cs * 0.5) * (rInf + cs * 0.5)) inf[jx * H + jz] = 1
      }
    }
  }
  // wall cell count in a square window via a summed-area table
  var sat = new Int32Array((W + 1) * (H + 1))
  for (var x = 0; x < W; x++) {
    var rowSum = 0
    for (var z = 0; z < H; z++) {
      rowSum += raw[x * H + z]
      sat[(x + 1) * (H + 1) + z + 1] = sat[x * (H + 1) + z + 1] + rowSum
    }
  }
  // seen cells (2 m world cells = grid cells, the window origin is a multiple of 32) in the same summed-area form
  var satS = null
  if (mz.seenList) {
    var sraw = new Uint8Array(N)
    var sl = mz.seenList
    for (var qi = 0; qi < sl.length; qi += 2) {
      var qx = sl[qi] - wx0 / 2
      var qz = sl[qi + 1] - wz0 / 2
      if (qx >= 0 && qz >= 0 && qx < W && qz < H) sraw[qx * H + qz] = 1
    }
    satS = new Int32Array((W + 1) * (H + 1))
    for (var x2 = 0; x2 < W; x2++) {
      var rs2 = 0
      for (var z2 = 0; z2 < H; z2++) {
        rs2 += sraw[x2 * H + z2]
        satS[(x2 + 1) * (H + 1) + z2 + 1] = satS[x2 * (H + 1) + z2 + 1] + rs2
      }
    }
  }
  var oR = Math.ceil((params.mazeOpenRadius != null ? params.mazeOpenRadius : 20) / cs)
  var oMax = params.mazeOpenCells != null ? params.mazeOpenCells : 8
  // car cost zones (cars cost, they do not block)
  var mult = new Float32Array(N)
  mult.fill(1)
  var pen = params.mazeCarPen != null ? params.mazeCarPen : 6
  var bpen = params.mazeBlockPen != null ? params.mazeBlockPen : 30
  function zone(cx, cz, r, flat) {
    var ix0 = Math.floor((cx - r - wx0) / cs)
    var ix1 = Math.floor((cx + r - wx0) / cs)
    var iz0 = Math.floor((cz - r - wz0) / cs)
    var iz1 = Math.floor((cz + r - wz0) / cs)
    for (var a = Math.max(0, ix0); a <= Math.min(W - 1, ix1); a++) {
      for (var b = Math.max(0, iz0); b <= Math.min(H - 1, iz1); b++) {
        var dz = Math.hypot(wx0 + (a + 0.5) * cs - cx, wz0 + (b + 0.5) * cs - cz)
        if (dz > r) continue
        var m = 1 + (flat ? bpen : pen * (1 - dz / r))
        if (m > mult[a * H + b]) mult[a * H + b] = m
      }
    }
  }
  var carR = params.mazeCarRadius != null ? params.mazeCarRadius : 8
  var chR = params.mazeChaserRadius != null ? params.mazeChaserRadius : 14
  var chT = params.mazeChaserLead != null ? params.mazeChaserLead : 2
  var movers = []
  for (var ti = 0; ti < thrs.length; ti++) {
    var t = thrs[ti]
    var sp = Math.sqrt(t.vx * t.vx + t.vz * t.vz)
    if (sp < 1.5) zone(t.x, t.z, carR, true)
    else {
      if (sp > 2) movers.push(t)
      var reach = Math.min(50, sp * chT)
      for (var k = 0; k <= 4; k++) zone(t.x + (t.vx / sp) * reach * (k / 4), t.z + (t.vz / sp) * reach * (k / 4), chR, false)
    }
  }
  if (dyn) {
    for (var di = 0; di < dyn.length; di++) {
      var near = false
      for (var mi = 0; mi < movers.length; mi++) {
        if ((movers[mi].x - dyn[di][0]) * (movers[mi].x - dyn[di][0]) + (movers[mi].z - dyn[di][1]) * (movers[mi].z - dyn[di][1]) < 100) {
          near = true
          break
        }
      }
      if (!near) zone(dyn[di][0], dyn[di][1], 4, true)
    }
  }
  // multi-source Dijkstra (binary heap) from every open-ground cell
  var wallCost = params.mazeWallCost != null ? params.mazeWallCost : 400
  var d = new Float64Array(N)
  d.fill(1e18)
  var hk = []
  var hi = []
  function push(key, idx) {
    var p = hk.length
    hk.push(key)
    hi.push(idx)
    while (p > 0) {
      var q = (p - 1) >> 1
      if (hk[q] <= key) break
      hk[p] = hk[q]
      hi[p] = hi[q]
      p = q
    }
    hk[p] = key
    hi[p] = idx
  }
  function pop() {
    var key = hk.pop()
    var idx = hi.pop()
    if (!hk.length) return [key, idx]
    var top = [hk[0], hi[0]]
    var n = hk.length
    var p = 0
    for (;;) {
      var c = 2 * p + 1
      if (c >= n) break
      if (c + 1 < n && hk[c + 1] < hk[c]) c++
      if (hk[c] >= key) break
      hk[p] = hk[c]
      hi[p] = hi[c]
      p = c
    }
    hk[p] = key
    hi[p] = idx
    return top
  }
  var m0 = oR + 1
  var nSrc = 0
  var seen = satS
  var seenMin = (params.mazeSeenShare != null ? params.mazeSeenShare : 0.3) * (2 * oR + 1) * (2 * oR + 1)
  mz.explore = false
  // open ground the car has seen first; without any, every open-looking cell counts (the car explores along the field)
  for (var pass = 0; pass < 2 && !nSrc; pass++) {
    for (var sx = m0; sx < W - m0; sx++) {
      for (var sz = m0; sz < H - m0; sz++) {
        var si = sx * H + sz
        if (inf[si]) continue
        if (pass === 0 && seen && seen[(sx + oR + 1) * (H + 1) + sz + oR + 1] - seen[(sx - oR) * (H + 1) + sz + oR + 1] - seen[(sx + oR + 1) * (H + 1) + sz - oR] + seen[(sx - oR) * (H + 1) + sz - oR] < seenMin) continue
        var cnt = sat[(sx + oR + 1) * (H + 1) + sz + oR + 1] - sat[(sx - oR) * (H + 1) + sz + oR + 1] - sat[(sx + oR + 1) * (H + 1) + sz - oR] + sat[(sx - oR) * (H + 1) + sz - oR]
        if (cnt <= oMax) {
          d[si] = 0
          push(0, si)
          nSrc++
        }
      }
    }
    if (!seen) break
    mz.explore = pass === 1
  }
  var offs = [H, -H, 1, -1, H + 1, H - 1, 1 - H, -H - 1]
  var dxs = [1, -1, 0, 0, 1, 1, -1, -1]
  var dzs = [0, 0, 1, -1, 1, -1, 1, -1]
  while (hk.length) {
    var tp = pop()
    var tk = tp[0]
    var ti2 = tp[1]
    if (tk > d[ti2]) continue
    var tx = (ti2 / H) | 0
    var tz = ti2 - tx * H
    for (var q = 0; q < 8; q++) {
      var nx = tx + dxs[q]
      var nz = tz + dzs[q]
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue
      var ni = ti2 + offs[q]
      var nd = tk + (q < 4 ? cs : cs * 1.4142) * mult[ni] * (inf[ni] ? wallCost : 1)
      if (nd < d[ni]) {
        d[ni] = nd
        push(nd, ni)
      }
    }
  }
  // steepest descent from the car = the path of least resistance to the nearest exit
  var cur = Math.max(0, Math.min(W - 1, Math.floor((pos[0] - wx0) / cs))) * H + Math.max(0, Math.min(H - 1, Math.floor((pos[2] - wz0) / cs)))
  var cost = d[cur]
  var route = null
  mz.why = nSrc ? 'no way' : 'no open ground known'
  if (cost < 1e17) {
    var pts = [[pos[0], pos[2]]]
    var wallN = 0
    // a car that starts inside the inflated zone of a wall may leave it; blocked cells after the first free one are crossings
    var clear = !inf[cur]
    for (var s = 0; s < 800 && d[cur] > 0; s++) {
      var cx = (cur / H) | 0
      var cz = cur - cx * H
      var best = d[cur]
      var bq = -1
      for (var q2 = 0; q2 < 8; q2++) {
        var ax = cx + dxs[q2]
        var az = cz + dzs[q2]
        if (ax < 0 || az < 0 || ax >= W || az >= H) continue
        if (d[cur + offs[q2]] < best) {
          best = d[cur + offs[q2]]
          bq = q2
        }
      }
      if (bq < 0) break
      cur += offs[bq]
      if (!inf[cur]) clear = true
      else if (clear) wallN++
      var px = (cur / H) | 0
      pts.push([wx0 + (px + 0.5) * cs, wz0 + (cur - px * H + 0.5) * cs])
    }
    if (d[cur] === 0 && wallN === 0) route = pts
    else mz.why = wallN > 0 ? 'walled in' : 'no way'
  }
  // hysteresis: the kept route (re-costed on the new field) is replaced only when the new one is mazeSwitch cheaper
  var sw = params.mazeSwitch != null ? params.mazeSwitch : 0.25
  if (route && mz.route) {
    var kept = mazeRouteCost(mz.route, mz.idx, wx0, wz0, W, H, cs, mult, inf, wallCost)
    if (kept < 1e17 && cost > kept * (1 - sw)) {
      mz.cost = kept
      return
    }
  }
  mz.route = route
  mz.cost = cost
  mz.idx = 0
}
// cost of the rest of a kept route (from route index `from`) on the current grid; 1e18 when it leaves the grid or crosses walls
function mazeRouteCost(rt, from, wx0, wz0, W, H, cs, mult, inf, wallCost) {
  var c = 0
  var wallN = 0
  var clear = false
  for (var i = from; i < rt.length - 1; i++) {
    var mx = (rt[i][0] + rt[i + 1][0]) / 2
    var mzz = (rt[i][1] + rt[i + 1][1]) / 2
    var ix = Math.floor((mx - wx0) / cs)
    var iz = Math.floor((mzz - wz0) / cs)
    if (ix < 0 || iz < 0 || ix >= W || iz >= H) return 1e18
    var ci = ix * H + iz
    if (!inf[ci]) clear = true
    else if (clear) wallN++
    c += Math.hypot(rt[i + 1][0] - rt[i][0], rt[i + 1][1] - rt[i][1]) * mult[ci] * (inf[ci] ? wallCost : 1)
  }
  return wallN > 0 ? 1e18 : c
}

// Escape simulation (fleeSim): an idealised car turns to the world heading `psi` (angle in the x/z plane, ux = cos, uz = sin) while the pursuers home on it; returns the smallest
// centre distance reached. pol 0 = keep accelerating to the top speed, pol 1 = slow down to a turning speed until roughly aligned (a tight turn at low speed, then run).
function escapeSim(thrs, pos, yaw0, v0, psi, pol, q) {
  var x = pos[0]
  var z = pos[2]
  var yaw = yaw0
  var v = Math.max(0, v0)
  var n = thrs.length
  var px = []
  var pz = []
  var ph = []
  var ps = []
  var pl = []
  var pvx = []
  var pvz = []
  for (var i = 0; i < n; i++) {
    var t = thrs[i]
    px.push(t.x)
    pz.push(t.z)
    pvx.push(t.vx)
    pvz.push(t.vz)
    ps.push(Math.sqrt(t.vx * t.vx + t.vz * t.vz))
    ph.push(Math.atan2(t.vz, t.vx))
    var lim = q.turnMax
    if (t.turn != null && q.turnMin > 0) lim = Math.min(q.turnMax, Math.max(q.turnMin, 1.3 * t.turn + 0.15))
    pl.push(lim)
  }
  var dt = q.dt
  var steps = Math.round(q.H / dt)
  var minD = 1e9
  for (var s = 0; s < steps; s++) {
    var err = psi - yaw
    while (err > Math.PI) err -= 2 * Math.PI
    while (err < -Math.PI) err += 2 * Math.PI
    var kLim = Math.min(q.kmax, q.aLat / (v * v + 1))
    var k = err / (Math.max(v, 4) * 0.35)
    k = k > kLim ? kLim : k < -kLim ? -kLim : k
    var vt = pol === 1 && Math.abs(err) > 0.4 ? q.vTurn : q.vTop
    var dv = vt - v
    var up = q.aUp * dt
    var dn = q.aDown * dt
    v += dv > up ? up : dv < -dn ? -dn : dv
    yaw += k * v * dt
    var cy = Math.cos(yaw)
    var sy = Math.sin(yaw)
    x += cy * v * dt
    z += sy * v * dt
    var tx = x + cy * v * q.lead
    var tz = z + sy * v * q.lead
    for (var j = 0; j < n; j++) {
      if (ps[j] > 4) {
        var dh = Math.atan2(tz - pz[j], tx - px[j]) - ph[j]
        while (dh > Math.PI) dh -= 2 * Math.PI
        while (dh < -Math.PI) dh += 2 * Math.PI
        var l = pl[j] * dt
        ph[j] += dh > l ? l : dh < -l ? -l : dh
        px[j] += Math.cos(ph[j]) * ps[j] * dt
        pz[j] += Math.sin(ph[j]) * ps[j] * dt
      } else {
        px[j] += pvx[j] * dt
        pz[j] += pvz[j] * dt
      }
      var ddx = px[j] - x
      var ddz = pz[j] - z
      var d = ddx * ddx + ddz * ddz
      if (d < minD) minD = d
    }
  }
  return Math.sqrt(minD)
}

// Static-map free run (gapWalls): persistent wall points hashed into 2 m cells (incremental, the map list only grows); freeRun marches a heading from (x, z) and returns the distance to the first
// cell within `half` m of a map point (0 = blocked at once; `maxD` = free). The first 4 m are skipped (walls hugging the hull are the planners' business).
function wallGrid(list, state) {
  var g = state.wg
  if (!g || g.n > list.length) g = state.wg = { n: 0, set: {} }
  for (; g.n < list.length; g.n++) g.set[Math.floor(list[g.n][0] / 2) * 100003 + Math.floor(list[g.n][1] / 2)] = 1
  return g
}
function freeRun(g, x, z, ang, maxD, half) {
  var cx = Math.cos(ang)
  var cz = Math.sin(ang)
  var r = Math.max(1, Math.ceil(half / 2) - 1)
  for (var d = 4; d <= maxD; d += 2) {
    var px = Math.floor((x + cx * d) / 2)
    var pz = Math.floor((z + cz * d) / 2)
    for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) if (g.set[(px + ox) * 100003 + pz + oz]) return d - 2
  }
  return maxD
}

function openCells(g, x, z, R) {
  var r = Math.ceil(R / 2)
  var px = Math.floor(x / 2)
  var pz = Math.floor(z / 2)
  var n = 0
  for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) if (ox * ox + oz * oz <= r * r && g.set[(px + ox) * 100003 + pz + oz]) n++
  return n
}
// share (0..1) of the straight way (x0,z0)->(x1,z1) lying beyond the first wall cell (0 = free)
function wallShare(g, x0, z0, x1, z1) {
  var dx = x1 - x0
  var dz = z1 - z0
  var L = Math.sqrt(dx * dx + dz * dz) + 1e-6
  for (var d = 4; d <= L; d += 2) {
    var px = Math.floor((x0 + (dx * d) / L) / 2)
    var pz = Math.floor((z0 + (dz * d) / L) / 2)
    for (var ox = -1; ox <= 1; ox++) for (var oz = -1; oz <= 1; oz++) if (g.set[(px + ox) * 100003 + pz + oz]) return 1 - d / L
  }
  return 0
}

// fleeSim: pick / keep the escape heading (see the header). The committed heading lives in state.flee = {ang, t, t0, x, z}; the goal handed down is 90 m ahead on it.
function fleeSim(av, input, params, state, g0, area, fl, now, thrs, q, yaw0) {
  var pos = input.position
  var v0 = Math.max(0, av.ego.speedF)
  var safeD = params.escapeSafe != null ? params.escapeSafe : 20
  var wAlign = params.escapeAlign != null ? params.escapeAlign : 4
  var turnPen = params.fleeTurnPenalty != null ? params.fleeTurnPenalty : 1.5
  var gap = params.gapCommit !== false
  var D = params.escapeGoalDist != null ? params.escapeGoalDist : gap ? 150 : 90
  var goalAng = Math.atan2(g0[2] - pos[2], g0[0] - pos[0])
  var walls = gap && params.gapWalls === true && av.prevSmap && av.prevSmap.list && av.prevSmap.list.length ? wallGrid(av.prevSmap.list, state) : null
  var og = params.goalOpen !== false && av.prevSmap && av.prevSmap.list && av.prevSmap.list.length ? wallGrid(av.prevSmap.list, state) : null
  var oW = params.goalOpenGap != null ? params.goalOpenGap : 6
  var oRun = params.goalOpenRun != null ? params.goalOpenRun : 60
  var wNeed = params.gapWallNeed != null ? params.gapWallNeed : 60
  var wPen = params.gapWallPen != null ? params.gapWallPen : 0
  var wFilter = params.gapWallFilter !== false
  var wMin = params.gapWallMin != null ? params.gapWallMin : 60
  var wHalf = params.gapWallClear != null ? params.gapWallClear : 3.5
  function scoreOf(ang, dGoal) {
    var d0 = escapeSim(thrs, pos, yaw0, v0, ang, 0, q)
    var d1 = escapeSim(thrs, pos, yaw0, v0, ang, 1, q)
    var d = d0 > d1 ? d0 : d1
    var turn = Math.abs(ang - yaw0)
    while (turn > Math.PI) turn = Math.abs(turn - 2 * Math.PI)
    // fleeBadAlign (0..1, default 1 = unchanged): weight of the alignment with the real goal while the watchdog says that goal is unreachable (the car then picks its own goals; steering them at the unreachable goal ends at its wall)
    var al = Math.cos(ang - goalAng) * (av.goalBad && params.fleeBadAlign != null ? params.fleeBadAlign : 1)
    var run = D
    var wp = 0
    var blocked = false
    if (walls) {
      run = freeRun(walls, pos[0], pos[2], ang, D, wHalf)
      var need = dGoal != null ? Math.min(wNeed, dGoal) : Math.min(wNeed, D)
      if (run < need) wp = wPen * (1 - run / need)
      if (run < Math.min(wMin, need)) blocked = true
    }
    var op = 0
    if (og && oW > 0) op = oW * (1 - Math.min(freeRun(og, pos[0], pos[2], ang, oRun, wHalf), oRun) / oRun)
    return { d: d, run: run, blocked: blocked, score: (d > safeD ? safeD : d) + wAlign * al - 2 * turnPen * Math.max(0, (turn - 1.2) / 1.9) - wp - op }
  }
  // the committed heading is re-simulated from the current state; another one replaces it only when clearly better
  // gapCommit: the committed goal is an ABSOLUTE point (fixed at commit time); its bearing from the moving car is what is re-simulated
  if (gap && fl && fl.ang != null && fl.gx != null) fl.ang = Math.atan2(fl.gz - pos[2], fl.gx - pos[0])
  var cur = fl && fl.ang != null ? scoreOf(fl.ang, fl.gx != null ? Math.sqrt((fl.gx - pos[0]) * (fl.gx - pos[0]) + (fl.gz - pos[2]) * (fl.gz - pos[2])) : null) : null
  // gapWalls: a committed goal that was clamped to the free run is reached when the car gets within gapReach (m, 10): re-pick from here instead of sitting on it
  var curBlocked = !!(cur && cur.blocked && wFilter)
  var reached = !!(cur && !curBlocked && walls && fl.gx != null && (fl.gx - pos[0]) * (fl.gx - pos[0]) + (fl.gz - pos[2]) * (fl.gz - pos[2]) < Math.pow(params.gapReach != null ? params.gapReach : 10, 2))
  if (reached) cur = null
  var evalDue = !fl || fl.ang == null || now - (fl.te || 0) > (params.escapeEvalEvery != null ? params.escapeEvalEvery : gap ? 0.3 : 0.15)
  if (evalDue || !cur || curBlocked) {
    var best = null
    var bestS = -Infinity
    var any = null
    var ub = null
    var ubS = -Infinity
    var uns = false
    var anyS = -Infinity
    for (var ai = 0; ai < 24; ai++) {
      var ang = (ai * Math.PI * 2) / 24 - Math.PI
      var cx = pos[0] + Math.cos(ang) * D
      var cz = pos[2] + Math.sin(ang) * D
      if (cx < area[0] + 10 || cx > area[1] - 10 || cz < area[2] + 10 || cz > area[3] - 10) continue
      var r = scoreOf(ang)
      // fallback when every heading is short (inside a pocket): the longest free run, the score only breaks ties
      var rs = r.run + 0.2 * r.score
      if (rs > anyS) {
        anyS = rs
        any = { ang: ang, d: r.d, run: r.run, score: r.score }
      }
      if (r.score > ubS) {
        ubS = r.score
        ub = { ang: ang, d: r.d, run: r.run, score: r.score }
      }
      if (wFilter && r.blocked) continue
      if (r.score > bestS) {
        bestS = r.score
        best = { ang: ang, d: r.d, run: r.run }
      }
    }
    // a long-run heading must not cost more than gapWallTrade (8) score points against the best short one (the race comes first)
    if (best && ub && walls && wFilter && bestS < ubS - (params.gapWallTrade != null ? params.gapWallTrade : 8)) {
      best = ub
      bestS = ubS
      uns = true
    }
    if (!best && any && walls && wFilter) {
      // every heading ends at a wall within gapWallMin (maze / clutter): the unfiltered best, goal as before
      best = any
      bestS = any.score
    }
    if (best) {
      var Dg = walls && wFilter && !uns && params.gapWallClamp !== false && best.run < D ? Math.max(8, best.run - 3) : D
      if (!cur || curBlocked || bestS > cur.score + (params.escapeSwitch != null ? params.escapeSwitch : gap ? 6 : 3)) fl = { ang: best.ang, t: now, t0: fl && fl.t0 != null && cur ? fl.t0 : now, te: now, gap: gap, gx: gap ? pos[0] + Math.cos(best.ang) * Dg : null, gz: gap ? pos[2] + Math.sin(best.ang) * Dg : null }
      else {
        fl.te = now
      }
    }
  }
  if (!fl || fl.ang == null) {
    state.flee = null
    av.fleeing = false
    return
  }
  if (fl.gx != null) {
    fl.x = fl.gx
    fl.z = fl.gz
  } else {
    fl.x = pos[0] + Math.cos(fl.ang) * D
    fl.z = pos[2] + Math.sin(fl.ang) * D
  }
  state.flee = fl
  av.fleeing = true
  av.fleeSim = gap
  input.target.pose.position = [fl.x, g0[1], fl.z]
}
