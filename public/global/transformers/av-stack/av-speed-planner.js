/* @params
[
  {"key": "comfortDecel", "type": "number", "default": 5, "label": "Braking for obstacles in the path", "group": "Speed", "unit": "m/s²", "min": 0, "description": "Braking deceleration used for obstacles in the path."},
  {"key": "cruiseSpeed", "type": "number", "default": 10, "label": "Cruise speed", "group": "Speed", "unit": "m/s", "min": 0, "description": "Upper bound of the target speed; the car drives the minimum of all speed limits."},
  {"key": "goalDecel", "type": "number", "default": 3, "group": "Speed", "unit": "m/s²", "min": 0, "description": "Gentler braking used for the final approach."},
  {"key": "goalTolerance", "type": "number", "default": 3.5, "label": "Final goal hold radius", "group": "Goal", "unit": "m", "min": 0, "description": "Final goal counts as reached inside this radius; the car holds there."},
  {"key": "maxLatAccel", "type": "number", "default": 9, "label": "Cornering limit (lateral accel)", "group": "Speed", "unit": "m/s²", "min": 0, "description": "Cornering limit: lateral acceleration the speed planner allows in bends."},
  {"key": "minSpeed", "type": "number", "default": 4, "label": "Minimum speed while driving", "group": "Speed", "unit": "m/s", "min": 0, "description": "Lowest speed while driving (the free-path stopping limit still wins)."},
  {"key": "obstacleSlowFactor", "type": "number", "default": 0.5, "label": "Speed right next to an obstacle", "group": "Speed", "min": 0, "description": "Speed right next to an obstacle as a fraction of cruise speed."},
  {"key": "obstacleSlowRadius", "type": "number", "default": 5, "label": "Obstacles slow the car only within", "group": "Speed", "unit": "m", "min": 0, "description": "Only obstacles within this distance of the hull slow the car; 0 = off."},
  {"key": "chasedDecel", "type": "number", "default": 0, "group": "Evasion", "unit": "m/s²", "min": 0, "description": "Free-path braking deceleration while a fast body closes in; 0 = off.", "advanced": true},
  {"key": "crawlSpeed", "type": "number", "default": 4, "group": "Speed", "unit": "m/s", "min": 0, "description": "Legacy alias of minSpeed.", "advanced": true},
  {"key": "curveDeadband", "type": "number", "default": 0, "group": "Speed", "min": 0, "description": "1/m, 0 = off", "advanced": true},
  {"key": "curveSmooth", "type": "number", "default": 0, "group": "Speed", "min": 0, "description": "s, 0 = raw kappa", "advanced": true},
  {"key": "goalCrawlSpeed", "type": "number", "default": 2, "group": "Speed", "unit": "m/s", "min": 0, "description": "Speed floor while arriving at the final goal.", "advanced": true},
  {"key": "stopMargin", "type": "number", "default": 1.2, "group": "Speed", "unit": "m", "min": 0, "advanced": true},
  {"key": "vehicleLength", "type": "number", "default": 4, "label": "Vehicle length", "group": "Vehicle", "unit": "m", "min": 0, "description": "Body length used for clearance; the box collider can only enlarge it.", "advanced": true},
  {"key": "vehicleWidth", "type": "number", "default": 2, "label": "Vehicle width", "group": "Vehicle", "unit": "m", "min": 0, "description": "Body width used for clearance; the box collider can only enlarge it.", "advanced": true},
  {"key": "waypoints", "type": "json", "group": "Goal", "description": "Waypoint list [[x, z], ...] in world metres.", "advanced": true},
  {"key": "tickEvery", "type": "number", "default": 1, "min": 1, "step": 1, "description": "Engine feature: this stage runs only every N-th frame (accumulated dt); 1 = every frame. Never use it on controllers.", "label": "Run every N-th frame", "group": "Performance", "advanced": true},
  {"key": "nearTouchDist", "type": "number", "default": 0.3, "label": "Proximity slowdown floor distance", "group": "Speed", "unit": "m", "min": 0, "description": "Hull distance where the proximity slowdown reaches its floor.", "advanced": true}
]
*/
// AV stack · PLAN / speed planner.
// v_des = min(cruise, obstacle in the path (auto-brake), obstacle right next to the car, route bends ahead, lateral acceleration, goal approach).
//  - In the path: auto-brake logic — v <= sqrt(2 * brakeDecel * (free distance - stopMargin)). Far obstacles only matter once they are within braking distance.
//  - Next to the car: only obstacles within `obstacleSlowRadius` (default 5 m) of the hull slow the car, linearly from `obstacleSlowFactor * cruiseSpeed` (touching) up to cruise (at the radius).
//    Obstacles that are farther away, or behind the car, never slow it. Set the radius to 0 to switch this off.
// Goal approach only slows for the FINAL waypoint (av.mission, else params.waypoints; otherwise every goal is final).
// The free-path (stopping distance) limit always wins over the floors.
// Publishes av.plan.vDesired / av.plan.vLimit ('cruise' | 'free' | 'near' | 'route' | 'curve' | 'goal').
// params: cruiseSpeed, minSpeed (lowest speed while driving, default 4), comfortDecel (brake decel for obstacles in the path, default 5),
//         stopMargin, obstacleSlowRadius (5), obstacleSlowFactor (speed right next to an obstacle as a fraction of cruise, default 0.5), maxLatAccel (default 9), curveSmooth (s, 0 = raw kappa), curveDeadband (1/m, 0 = off),
//         chasedDecel (0 = off; free-path braking decel while a fast body closes in), goalDecel (gentler braking used for the final approach, default 3), goalCrawlSpeed (floor while arriving, default 2), goalTolerance, vehicleWidth, vehicleLength, waypoints
function transform(input, dt, params, state, api) {
  var av = input.av
  // av-ego's preset table (params.preset) under this stage's own params (binding / scope / stage params win); cached while both are the same objects
  if (av && av.preset) params = state.pmP === params && state.pmB === av.preset ? state.pm : ((state.pmP = params), (state.pmB = av.preset), (state.pm = Object.assign({}, av.preset, params)))
  if (!av || !av.plan) return {}
  var plan = av.plan
  if (plan.override) return {}
  var cruise = params.cruiseSpeed != null ? params.cruiseSpeed : 10
  var aBrake = params.comfortDecel || 5
  var aLat = params.maxLatAccel || 9
  var stopMargin = params.stopMargin != null ? params.stopMargin : 1.2
  var crawl = params.minSpeed != null ? params.minSpeed : params.crawlSpeed != null ? params.crawlSpeed : 4
  var limit = 'cruise'
  var v = cruise
  // Chased = a fast body closes in on the car. While chased: (1) braking for a bend of the (stale) route in front of a 30 m/s pursuer lets it catch up
  // (corner-trap: 32 -> 11 m/s on the route limit, caught 2 s later): no route limit (the planned path's own curve limit below still applies); (2) the free-path
  // stopping limit uses `chasedDecel` (the car's emergency braking) instead of the comfort decel (a 35 m free path toward a far wall capped the car at 16 m/s with a 25 m/s pursuer behind).
  var chased = false
  if (av.threats && av.threats.length) {
    for (var ti = 0; ti < av.threats.length; ti++) {
      var th = av.threats[ti]
      var tx = th.x - input.position[0]
      var tz = th.z - input.position[2]
      var tsp = Math.sqrt(th.vx * th.vx + th.vz * th.vz)
      if (tsp > 4 && tx * tx + tz * tz < 90 * 90 && th.vx * tx + th.vz * tz < 0) chased = true
    }
  }
  // obstacle in the path: auto-brake (free distance of the chosen path)
  var aFree = chased && params.chasedDecel > aBrake ? params.chasedDecel : aBrake
  var vFree = Math.sqrt(2 * aFree * Math.max(0, plan.free - stopMargin))
  if (vFree < v) {
    v = vFree
    limit = 'free'
  }
  // obstacles right next to the car (hull distance), never farther than the slow radius, never behind
  var slowR = params.obstacleSlowRadius != null ? params.obstacleSlowRadius : 5
  if (slowR > 0 && av.points && av.points.length && av.ego) {
    var e = av.ego
    var hl = ((av.vehicle && av.vehicle.length) || params.vehicleLength || 4) / 2
    var hw = ((av.vehicle && av.vehicle.width) || params.vehicleWidth || 2) / 2
    var pos = input.position
    var dn = Infinity
    for (var i = 0; i < av.points.length; i++) {
      var dx = av.points[i][0] - pos[0]
      var dz = av.points[i][1] - pos[2]
      var lx = dx * e.fwd[0] + dz * e.fwd[2]
      if (lx < -hl) continue // behind the rear: irrelevant for a forward-driving car
      var ly = dx * e.left[0] + dz * e.left[2]
      var ex = Math.max(Math.abs(lx) - hl, 0)
      var ey = Math.max(Math.abs(ly) - hw, 0)
      var d = Math.sqrt(ex * ex + ey * ey)
      if (d < dn) dn = d
    }
    if (dn < slowR) {
      var vNear = Math.max(crawl, (params.obstacleSlowFactor != null ? params.obstacleSlowFactor : 0.5) * cruise)
      var t = Math.min(1, Math.max(0, (dn - (params.nearTouchDist != null ? params.nearTouchDist : 0.3)) / Math.max(0.01, slowR - (params.nearTouchDist != null ? params.nearTouchDist : 0.3))))
      var vProx = vNear + (cruise - vNear) * t
      if (vProx < v) {
        v = vProx
        limit = 'near'
      }
    }
  }
  // bends ahead on the global route (corner speed, reachable by braking)
  if (av.route && av.route.vLimit < v && (!chased || av.route.pocket)) {
    v = Math.max(av.route.vLimit, crawl)
    limit = 'route'
  }
  // maze flee goal active: brake for the first sharp corner of the escape route (an exit gap), also when chased (av.maze.vMax from av-ego mazeStep)
  if (av.mazeFlee && av.maze && av.maze.vMax != null && av.maze.vMax < v) {
    v = Math.max(av.maze.vMax, crawl)
    limit = 'maze'
  }
  // route starts in reverse (routeLimitFull): brake to the stop speed without the crawl floor, the manoeuvre needs the car nearly at rest
  if (av.route && av.route.revFirst && av.route.vLimit < v && !chased) {
    v = av.route.vLimit
    limit = 'rstop'
  }
  // Curve limit from the NET path curvature: signed kappa smoothed over `curveSmooth` s (default 0 = raw) cancels the
  // left/right wobble of the discrete candidate curvatures on a straight; |k| below `curveDeadband` (1/m) is ignored.
  var kRaw = plan.kappa
  var tau = params.curveSmooth != null ? params.curveSmooth : 0
  if (tau > 0) {
    var al = Math.min(1, (dt || 0.016) / tau)
    state.ks = (state.ks || 0) + al * (kRaw - (state.ks || 0))
    kRaw = state.ks
  }
  var k = Math.abs(kRaw)
  if (k < (params.curveDeadband || 0)) k = 0
  if (k > 1e-4) {
    var vCurve = Math.sqrt(aLat / k)
    if (vCurve < v) {
      v = Math.max(vCurve, crawl)
      limit = 'curve'
    }
  }
  if (av.goal) {
    var tol = params.goalTolerance != null ? params.goalTolerance : 3.5
    var wps = params.waypoints
    var isFinal = true
    if (av.mission) {
      isFinal = av.mission.isFinal
    } else if (wps && wps.length) {
      var last = wps[wps.length - 1]
      isFinal = Math.abs(av.goal.x - last[0]) < 0.05 && Math.abs(av.goal.z - last[1]) < 0.05
    }
    if (isFinal) {
      var vGoal = Math.sqrt(2 * (params.goalDecel != null ? params.goalDecel : 3) * Math.max(0, av.goal.dist - tol))
      if (vGoal < v) {
        // arriving: creep in slowly enough to stop inside the hold radius (own, lower floor than the driving minimum)
        v = Math.max(vGoal, params.goalCrawlSpeed != null ? params.goalCrawlSpeed : 2)
        limit = 'goal'
      }
    }
  }
  if (!plan.blocked && v < crawl && limit !== 'goal' && limit !== 'rstop') v = crawl
  // The stopping-distance limit is a safety bound, not a preference: no floor (minSpeed, route/curve crawl, goal crawl)
  // may lift the speed above what can still stop within the free path (minSpeed 9.4 with 5 m free and 2 m/s² used to
  // drive at 9.4 instead of 3.9 m/s — straight into the AEB, then stop-and-go).
  if (v > vFree) {
    v = vFree
    limit = 'free'
  }
  plan.vDesired = v
  plan.vLimit = limit
  state.lim = limit
  state.vd = v
  api.watch('av.vLimit', limit + ' ' + v.toFixed(1))
  return {}
}
