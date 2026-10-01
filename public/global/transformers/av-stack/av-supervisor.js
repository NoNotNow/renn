// AV stack · PLAN / behaviour supervisor.
// Watches planner health and flags `av.needManeuver` when the local planner is blocked
// or the vehicle is stuck; holds at the final goal. Sets av.mode ('drive' | 'hold').
// Simulated time only. params: stuckTime, blockedTime, holdAtGoal, goalTolerance
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.plan || !av.ego) return {}
  var e = av.ego
  var plan = av.plan
  if (state.stuckT === undefined) {
    state.stuckT = 0
    state.blockedT = 0
  }
  var stuckTime = params.stuckTime != null ? params.stuckTime : 1.5
  var blockedTime = params.blockedTime != null ? params.blockedTime : 0.4
  var wantsMove = (plan.vDesired || 0) > 0.8
  if (wantsMove && Math.abs(e.speed) < 0.25) state.stuckT += dt
  else state.stuckT = 0
  if (plan.blocked && Math.abs(e.speed) < 1.2) state.blockedT += dt
  else state.blockedT = 0
  av.needManeuver = state.blockedT > blockedTime || state.stuckT > stuckTime
  av.mode = 'drive'
  var tol = params.goalTolerance != null ? params.goalTolerance : 2.5
  if (params.holdAtGoal !== false && av.goal && av.goal.dist < tol) {
    av.mode = 'hold'
    plan.vDesired = 0
    plan.kappa = 0
  }
  return {}
}
