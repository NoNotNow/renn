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
//         goalDecel (gentler braking used for the final approach, default 3), goalCrawlSpeed (floor while arriving, default 2), goalTolerance, vehicleWidth, vehicleLength, waypoints
function transform(input, dt, params, state, api) {
  var av = input.av
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
  // obstacle in the path: auto-brake (free distance of the chosen path)
  var vFree = Math.sqrt(2 * aBrake * Math.max(0, plan.free - stopMargin))
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
      var t = Math.min(1, Math.max(0, (dn - 0.3) / Math.max(0.01, slowR - 0.3)))
      var vProx = vNear + (cruise - vNear) * t
      if (vProx < v) {
        v = vProx
        limit = 'near'
      }
    }
  }
  // bends ahead on the global route (corner speed, reachable by braking)
  // ... except while a fast body closes in on the car: braking for a bend of the (stale) route in front of a 30 m/s pursuer lets it catch up
  // (corner-trap: 32 -> 11 m/s on the route limit, caught 2 s later). The planned path's own curve limit below still applies.
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
  if (av.route && av.route.vLimit < v && !chased) {
    v = Math.max(av.route.vLimit, crawl)
    limit = 'route'
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
  if (!plan.blocked && v < crawl && limit !== 'goal') v = crawl
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
