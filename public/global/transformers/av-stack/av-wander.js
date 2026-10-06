/* @params
[
  {"key": "acceptRadius", "type": "number", "default": 9, "group": "Goal", "unit": "m", "min": 0, "description": "A waypoint / goal counts as reached inside this radius."},
  {"key": "area", "type": "numberList", "label": "Goal area [xmin, xmax, zmin, zmax]", "group": "Goal", "description": "World box [xmin, xmax, zmin, zmax] for random goals (default: drivableArea, else +-40 m around the start)."},
  {"key": "maxDistance", "type": "number", "default": 60, "group": "Goal", "unit": "m", "min": 0},
  {"key": "minDistance", "type": "number", "default": 25, "group": "Goal", "unit": "m", "min": 0},
  {"key": "speed", "type": "number", "default": 10, "group": "Goal", "unit": "m/s", "min": 0, "description": "Target speed hint published with the goal."},
  {"key": "drivableArea", "type": "numberList", "label": "Drivable area [xmin, xmax, zmin, zmax]", "group": "Goal", "description": "World box [xmin, xmax, zmin, zmax]; virtual walls at its edge.", "advanced": true},
  {"key": "giveUpAfter", "type": "number", "default": 45, "group": "Goal", "unit": "s", "min": 0, "description": "seconds (sim time) after which an unreachable goal is replaced (default 45)", "advanced": true},
  {"key": "goalOpen", "type": "boolean", "default": true, "group": "Evasion", "description": "(default on; false = off) candidates are scored by openness on the persistent static map (av.smap): wall cells within goalOpenRadius (15 m) of the candidate and wall samples on the straight line from the car cost points;", "advanced": true},
  {"key": "goalOpenEvery", "type": "number", "default": 2, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "goalOpenRadius", "type": "number", "default": 15, "group": "Evasion", "unit": "m", "min": 0, "advanced": true},
  {"key": "goalOpenRecheck", "type": "number", "default": 10, "group": "Evasion", "min": 0, "advanced": true},
  {"key": "margin", "type": "number", "default": 8, "group": "Goal", "min": 0, "description": "keep goals this far from the area edge (default 8)", "advanced": true},
  {"key": "seed", "type": "number", "default": 1, "group": "Goal", "min": 0, "advanced": true}
]
*/
// AV stack · GOAL SOURCE: random goals ("wanderer") — drop-in replacement for the waypoint mission (av-mission).
// Any goal source speaks the same contract, so the autopilot does not care which one is in front of it:
//   input.target       = { pose: { position: [x, 0, z] }, speed }   current goal (what planners read)
//   input.goalSource   = { index, waypoints: [[x, z], ...], isFinal } optional hint; av-ego adopts it as av.mission
// A wandering car never has a "final" goal, so isFinal is false: the speed planner does not brake for each goal.
// Runs at priority 2.5 (after av-ego at 2) like av-mission; it also works in front of av-ego via `goalSource`.
// params:
//   area          [xmin, xmax, zmin, zmax] world metres (default: stack param `drivableArea`, else +-40 around the start)
//   margin        keep goals this far from the area edge (default 8)
//   acceptRadius  goal counts as reached inside this radius (default 9)
//   minDistance / maxDistance  distance of the next goal from the car (defaults 25 / 60)
//   giveUpAfter   seconds (sim time) after which an unreachable goal is replaced (default 45)
//   goalOpen      (default on; false = off) candidates are scored by openness on the persistent static map (av.smap): wall cells within goalOpenRadius (15 m) of the candidate and wall samples on the straight line from the car cost points; the best of 24 candidates in the distance band wins, and a held goal whose surroundings gained >= goalOpenRecheck (10) wall cells since the pick is re-picked (min goalOpenEvery 2 s apart)
//   speed         target speed hint (default 10); seed: reproducible sequence (default 1)
// goalOpen helpers: persistent static map (av.smap list) hashed into 2 m cells; openCells counts occupied cells within R m of (x, z), lineHits samples a straight line (car half-width clearance 1 cell)
function openGrid(list, state) {
  var g = state.og
  if (!g || g.n > list.length) g = state.og = { n: 0, set: {} }
  for (; g.n < list.length; g.n++) g.set[Math.floor(list[g.n][0] / 2) * 100003 + Math.floor(list[g.n][1] / 2)] = 1
  return g
}
function openCells(g, x, z, R) {
  var r = Math.ceil(R / 2)
  var px = Math.floor(x / 2)
  var pz = Math.floor(z / 2)
  var n = 0
  for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) if (ox * ox + oz * oz <= r * r && g.set[(px + ox) * 100003 + pz + oz]) n++
  return n
}
// returns { hits, first }: occupied samples along the line (x0,z0)->(x1,z1) and the distance of the first one (Infinity = free)
function lineOpen(g, x0, z0, x1, z1) {
  var dx = x1 - x0
  var dz = z1 - z0
  var L = Math.sqrt(dx * dx + dz * dz) + 1e-6
  var hits = 0
  var first = Infinity
  for (var d = 4; d <= L; d += 2) {
    var px = Math.floor((x0 + (dx * d) / L) / 2)
    var pz = Math.floor((z0 + (dz * d) / L) / 2)
    var h = false
    for (var ox = -1; ox <= 1 && !h; ox++) for (var oz = -1; oz <= 1; oz++) if (g.set[(px + ox) * 100003 + pz + oz]) { h = true; break }
    if (h) {
      hits++
      if (first === Infinity) first = d
    }
  }
  return { hits: hits, first: first, len: L }
}
function transform(input, dt, params, state, api) {
  var pos = input.position
  if (state.t === undefined) {
    state.t = 0
    state.n = 0
    state.rng = ((params.seed != null ? params.seed : 1) * 2654435761) >>> 0 || 1
    state.goal = null
  }
  state.t += dt
  function rand() {
    // mulberry32
    state.rng = (state.rng + 0x6d2b79f5) >>> 0
    var t = state.rng
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  var area = params.area || params.drivableArea
  if (!area) area = [pos[0] - 40, pos[0] + 40, pos[2] - 40, pos[2] + 40]
  if (state.area0 === undefined) state.area0 = area
  var margin = params.margin != null ? params.margin : 8
  var radius = params.acceptRadius != null ? params.acceptRadius : 9
  var dMin = params.minDistance != null ? params.minDistance : 25
  var dMax = params.maxDistance != null ? params.maxDistance : 60
  var giveUp = params.giveUpAfter != null ? params.giveUpAfter : 45

  var og = null
  if (params.goalOpen !== false && input.av && input.av.smap && input.av.smap.list && input.av.smap.list.length) og = openGrid(input.av.smap.list, state)
  var oR = params.goalOpenRadius != null ? params.goalOpenRadius : 15
  var g = state.goal
  var reached = g && Math.hypot(pos[0] - g[0], pos[2] - g[1]) < radius
  var stale = g && state.t - state.pickedAt > giveUp
  var walled = false
  if (g && og && !reached && !stale && state.t - (state.openT || 0) >= (params.goalOpenEvery != null ? params.goalOpenEvery : 2)) {
    state.openT = state.t
    walled = openCells(og, g[0], g[1], oR) >= (state.pickCells || 0) + (params.goalOpenRecheck != null ? params.goalOpenRecheck : 10)
  }
  if (!g || reached || stale || walled) {
    var x0 = area[0] + margin
    var x1 = area[1] - margin
    var z0 = area[2] + margin
    var z1 = area[3] - margin
    var best = null
    var bestCost = Infinity
    for (var k = 0; k < 24; k++) {
      var cx = x0 + rand() * Math.max(0, x1 - x0)
      var cz = z0 + rand() * Math.max(0, z1 - z0)
      var d = Math.hypot(cx - pos[0], cz - pos[2])
      var miss = d < dMin ? dMin - d : d - dMax
      if (og) {
        var cells = openCells(og, cx, cz, oR)
        var ln = lineOpen(og, pos[0], pos[2], cx, cz)
        var cost = cells + 4 * ln.hits + (ln.first < Infinity ? 20 * (1 - ln.first / ln.len) : 0) + 3 * miss
        if (cost < bestCost) {
          bestCost = cost
          best = [cx, cz]
          best.cells = cells
        }
        continue
      }
      if (miss <= 0) {
        best = [cx, cz]
        break
      }
      // fallback: the candidate closest to the wanted distance band
      if (!best || miss < best.miss) {
        best = [cx, cz]
        best.miss = miss
      }
    }
    state.pickCells = best.cells || 0
    state.goal = g = [best[0], best[1]]
    state.pickedAt = state.t
    state.n += 1
  }
  input.target = {
    pose: { position: [g[0], 0, g[1]], rotation: [0, 0, 0] },
    speed: params.speed != null ? params.speed : 10,
  }
  var mission = { index: state.n, waypoints: [[g[0], g[1]]], isFinal: false }
  input.goalSource = mission
  if (input.av) input.av.mission = mission
  return {}
}
