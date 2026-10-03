// AV stack · PLAN / speed planner.
// v_des = min(cruise, stopping-distance limit, clearance limit, route bends ahead, lateral-acceleration limit, goal approach).
// Clearance limit: lots of room beside obstacles → full speed; squeezing past → slow.
// Goal approach only slows for the FINAL waypoint (av.mission, else params.waypoints; otherwise every goal is final).
// Publishes av.plan.vDesired / av.plan.vLimit.
// params: cruiseSpeed, comfortDecel, maxLatAccel, stopMargin, crawlSpeed, goalTolerance, clearSpeedBase,
//         clearSpeedGain, waypoints
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.plan) return {}
  var plan = av.plan
  if (plan.override) return {}
  var cruise = params.cruiseSpeed != null ? params.cruiseSpeed : 10
  var aBrake = params.comfortDecel || 5
  var aLat = params.maxLatAccel || 7
  var stopMargin = params.stopMargin != null ? params.stopMargin : 1.2
  var crawl = params.crawlSpeed != null ? params.crawlSpeed : 2
  // squeezing past obstacles scales with the speed class: the stock 5 + 3.5/m is tuned for cruiseSpeed 10
  var speedClass = Math.max(1, cruise / 10)
  var base = params.clearSpeedBase != null ? params.clearSpeedBase : 5 * speedClass
  var gain = params.clearSpeedGain != null ? params.clearSpeedGain : 3.5 * speedClass
  var limit = 'cruise'
  var v = cruise
  var vFree = Math.sqrt(2 * aBrake * Math.max(0, plan.free - stopMargin))
  if (vFree < v) {
    v = vFree
    limit = 'free'
  }
  // lateral gap to the nearest obstacle surface along the chosen path (safety margin + measured extra room)
  // clearance 2.5 = the widest margin that was tested: wide open, no limit from the sides
  var vClear = (plan.clearance || 0) >= 2.5 ? Infinity : base + gain * Math.max(0, (plan.margin || 0.5) + (plan.clearance || 0) - 0.3)
  if (vClear < v) {
    v = vClear
    limit = 'clearance'
  }
  // bends ahead on the global route (corner speed, reachable by braking)
  if (av.route && av.route.vLimit < v) {
    v = Math.max(av.route.vLimit, crawl)
    limit = 'route'
  }
  var k = Math.abs(plan.kappa)
  if (k > 1e-4) {
    var vCurve = Math.sqrt(aLat / k)
    if (vCurve < v) {
      v = vCurve
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
      var vGoal = Math.sqrt(2 * aBrake * Math.max(0, av.goal.dist - tol))
      if (vGoal < v) {
        v = Math.max(vGoal, crawl)
        limit = 'goal'
      }
    }
  }
  if (!plan.blocked && v < crawl) v = crawl
  plan.vDesired = v
  plan.vLimit = limit
  api.watch('av.vLimit', limit + ' ' + v.toFixed(1))
  return {}
}
