/* @params
[
  {"key": "blockedTime", "type": "number", "default": 0.4, "group": "Behaviour", "unit": "s", "min": 0, "description": "Seconds the local planner must be blocked before a manoeuvre is requested."},
  {"key": "goalTolerance", "type": "number", "default": 3.5, "label": "Final goal hold radius", "group": "Goal", "unit": "m", "min": 0, "description": "Final goal counts as reached inside this radius; the car holds there."},
  {"key": "holdAtGoal", "type": "boolean", "default": true, "group": "Behaviour", "description": "Hold (stop) at the final goal."},
  {"key": "stuckTime", "type": "number", "default": 1.5, "group": "Behaviour", "unit": "s", "min": 0, "description": "Seconds without progress before the vehicle counts as stuck."},
  {"key": "debugDraw", "type": "boolean", "default": true, "label": "Draw debug vectors", "group": "Debug", "description": "Draw debug vectors (visible in the Builder visualize mode).", "advanced": true}
]
*/
// AV stack · PLAN / behaviour supervisor.
// Watches planner health and flags `av.needManeuver` when the local planner is blocked
// or the vehicle is stuck; holds at the final goal. Sets av.mode ('drive' | 'hold').
// debug draw: vertical mast above the car = status (green drive, orange needs manoeuvre, white hold, cyan manual keyboard override, violet neural drive).
// Simulated time only. params: stuckTime, blockedTime, holdAtGoal, goalTolerance
function transform(input, dt, params, state, api) {
  var av = input.av
  // av-ego's preset table (params.preset) under this stage's own params (binding / scope / stage params win); cached while both are the same objects
  if (av && (av.preset || av.profile)) params = state.pmP === params && state.pmB === av.preset && state.pmO === av.profile ? state.pm : ((state.pmP = params), (state.pmB = av.preset), (state.pmO = av.profile), (state.pm = Object.assign({}, av.preset, params, av.profile)))
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
  // manual keyboard override (av-ego av.manual): the user drives, the stuck / blocked timers must not run up a manoeuvre request
  // neural drive (av-neural, av.neural.on): the net drives, the classic planner's blocked / stuck judgement does not apply (same as manual)
  var driven = av.manual || !!(av.neural && av.neural.on)
  if (driven) {
    state.stuckT = 0
    state.blockedT = 0
  }
  if (wantsMove && Math.abs(e.speed) < 0.25 && !driven) state.stuckT += dt
  else state.stuckT = 0
  if (plan.blocked && Math.abs(e.speed) < 1.2 && !driven) state.blockedT += dt
  else state.blockedT = 0
  av.needManeuver = state.blockedT > blockedTime || state.stuckT > stuckTime
  av.mode = av.override ? 'maneuver' : 'drive'
  var tol = params.goalTolerance != null ? params.goalTolerance : 3.5
  var finalGoal = !av.mission || av.mission.isFinal
  if (params.holdAtGoal !== false && finalGoal && av.goal && av.goal.dist < tol) {
    av.mode = 'hold'
    plan.override = false
    plan.vDesired = 0
    plan.kappa = 0
  }
  if (params.debugDraw !== false) {
    // status mast above the car: green drive, orange manoeuvre requested, white hold
    var c = av.mode === 'hold' ? '#ffffff' : av.manual ? '#00ccff' : av.neural && av.neural.on ? '#aa44ff' : av.needManeuver ? '#ff8800' : '#00ff66'
    api.visualizeLine([e.pos[0], e.pos[1] + 1.2, e.pos[2]], [e.pos[0], e.pos[1] + 4, e.pos[2]], c)
  }
  return {}
}
