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
//   speed         target speed hint (default 10); seed: reproducible sequence (default 1)
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

  var g = state.goal
  var reached = g && Math.hypot(pos[0] - g[0], pos[2] - g[1]) < radius
  var stale = g && state.t - state.pickedAt > giveUp
  if (!g || reached || stale) {
    var x0 = area[0] + margin
    var x1 = area[1] - margin
    var z0 = area[2] + margin
    var z1 = area[3] - margin
    var best = null
    for (var k = 0; k < 24; k++) {
      var cx = x0 + rand() * Math.max(0, x1 - x0)
      var cz = z0 + rand() * Math.max(0, z1 - z0)
      var d = Math.hypot(cx - pos[0], cz - pos[2])
      if (d >= dMin && d <= dMax) {
        best = [cx, cz]
        break
      }
      // fallback: the candidate closest to the wanted distance band
      var miss = d < dMin ? dMin - d : d - dMax
      if (!best || miss < best.miss) {
        best = [cx, cz]
        best.miss = miss
      }
    }
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
