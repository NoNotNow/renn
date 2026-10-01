// AV stack · PLAN / speed planner.
// v_des = min(cruise, stopping-distance limit, lateral-acceleration limit, goal approach).
// Publishes av.plan.vDesired.
// params: cruiseSpeed, comfortDecel, maxLatAccel, stopMargin, crawlSpeed, goalTolerance
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.plan) return {}
  var plan = av.plan
  var cruise = params.cruiseSpeed != null ? params.cruiseSpeed : 8
  var aBrake = params.comfortDecel || 5
  var aLat = params.maxLatAccel || 6
  var stopMargin = params.stopMargin != null ? params.stopMargin : 1.2
  var crawl = params.crawlSpeed != null ? params.crawlSpeed : 2
  var v = cruise
  var vFree = Math.sqrt(2 * aBrake * Math.max(0, plan.free - stopMargin))
  if (vFree < v) v = vFree
  var k = Math.abs(plan.kappa)
  if (k > 1e-4) {
    var vCurve = Math.sqrt(aLat / k)
    if (vCurve < v) v = vCurve
  }
  if (av.goal) {
    var tol = params.goalTolerance != null ? params.goalTolerance : 2.5
    var vGoal = Math.sqrt(2 * aBrake * Math.max(0, av.goal.dist - tol))
    if (vGoal < v) v = Math.max(vGoal, crawl)
  }
  if (!plan.blocked && v < crawl) v = crawl
  plan.vDesired = v
  return {}
}
