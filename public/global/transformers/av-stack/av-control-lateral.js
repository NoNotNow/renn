/* @params
[
  {"key": "fbGain", "type": "number", "default": 0.35, "group": "Steering", "min": 0, "description": "P gain of the feedback on measured curvature."},
  {"key": "purePursuit", "type": "boolean", "default": true, "group": "Steering", "description": "Free-road refinement: continuous pure-pursuit curvature fine-tunes the planner curvature."},
  {"key": "steerRate", "type": "number", "default": 4, "group": "Steering", "min": 0, "description": "Steering rate limit (comfort / actuator model)."},
  {"key": "debugDraw", "type": "boolean", "default": true, "label": "Draw debug vectors", "group": "Debug", "description": "Draw debug vectors (visible in the Builder visualize mode).", "advanced": true},
  {"key": "kappaDeadband", "type": "number", "default": 0.0015, "group": "Steering", "min": 0, "advanced": true},
  {"key": "kappaJump", "type": "number", "default": 0.025, "group": "Steering", "min": 0, "advanced": true},
  {"key": "kappaPerSteer", "type": "number", "default": 0.12, "group": "Steering", "min": 0, "advanced": true},
  {"key": "kappaTau", "type": "number", "default": 0.04, "group": "Steering", "min": 0, "description": "0.04 s + 0.008 s per m/s", "advanced": true},
  {"key": "ppMaxKappa", "type": "number", "default": 0.04, "group": "Steering", "min": 0, "advanced": true},
  {"key": "ppWindow", "type": "number", "default": 0.02, "group": "Steering", "min": 0, "advanced": true},
  {"key": "ppMinSpeed", "type": "number", "default": 3, "label": "Pure-pursuit min speed", "group": "Steering", "unit": "m/s", "min": 0, "description": "Pure-pursuit fine-tune entry: minimum filtered speed.", "advanced": true},
  {"key": "ppMinClearance", "type": "number", "default": 1, "label": "Pure-pursuit min clearance", "group": "Steering", "unit": "m", "min": 0, "description": "Pure-pursuit fine-tune entry: minimum path clearance.", "advanced": true},
  {"key": "kappaTauFast", "type": "number", "default": 0.04, "label": "Curvature filter tau (fast)", "group": "Steering", "unit": "s", "min": 0, "description": "Curvature filter time constant at speed.", "advanced": true},
  {"key": "kappaTauSpeed", "type": "number", "default": 0.008, "label": "Curvature filter tau per speed", "group": "Steering", "unit": "s per m/s", "min": 0, "description": "Curvature filter time constant growth per m/s.", "advanced": true}
]
*/
// AV stack · CONTROL / lateral (curvature tracking).
// steering = feed-forward(kappa_plan / kappaPerSteer) + P feedback on measured curvature,
// with a steering-rate limiter (comfort / actuator model).
// debug draw: white = commanded steering direction.
// Free-road refinement (purePursuit, default on): the planner's curvature is one of ~31 discrete values (0.0077 1/m apart), so tracking a straight
// line is a limit cycle between neighbours (+-1-2 m, ~0.5 reversals/s). When the plan is a plain, unconstrained "go toward the aim point" (small
// curvature, free path, clear margins, no override, no tracked moving body, no keep-right bias of the planner (plan.pass)) the continuous pure-pursuit curvature kPP = 2 y / d^2 toward the aim (route carrot / goal) replaces it,
// provided it stays within ppWindow (0.02 1/m) of the planned one (so it can only fine-tune the planner's choice, never undo an avoidance).
// params: kappaPerSteer, fbGain, steerRate, kappaTau (0.04 s + 0.008 s per m/s), kappaJump (0.025 1/m), purePursuit, ppWindow, ppMaxKappa (0.04), kappaDeadband (0.0015)
function transform(input, dt, params, state, api) {
  var av = input.av
  // av-ego's preset table (params.preset) under this stage's own params (binding / scope / stage params win); cached while both are the same objects
  if (av && av.preset) params = state.pmP === params && state.pmB === av.preset ? state.pm : ((state.pmP = params), (state.pmB = av.preset), (state.pm = Object.assign({}, av.preset, params)))
  if (!av || !av.plan || !av.ego) return {}
  // manual keyboard override (av-ego av.manual): yield, the keys steer; reset the filters so the autopilot resumes from the current state
  if (av.manual) {
    state.steer = 0
    state.kf = undefined
    return {}
  }
  var e = av.ego
  var kps = params.kappaPerSteer || 0.12
  var fb = params.fbGain != null ? params.fbGain : 0.35
  var rate = params.steerRate != null ? params.steerRate : 4
  var kRaw = av.plan.kappa
  var pl = av.plan
  if (params.purePursuit !== false && !(av.threats && av.threats.length) && av.mode !== 'reverse' && !pl.override && !pl.pass && !pl.blocked && pl.free >= (pl.required || 0) && pl.clearance >= (params.ppMinClearance != null ? params.ppMinClearance : 1) && e.speedF > (params.ppMinSpeed != null ? params.ppMinSpeed : 3) && Math.abs(kRaw) < (params.ppMaxKappa != null ? params.ppMaxKappa : 0.04)) {
    var tg = input.target && input.target.pose && input.target.pose.position
    var ax = av.carrot ? av.carrot[0] : tg ? tg[0] : null
    var az = av.carrot ? av.carrot[1] : tg ? tg[2] : null
    if (ax !== null) {
      var adx = ax - input.position[0]
      var adz = az - input.position[2]
      var agx = adx * e.fwd[0] + adz * e.fwd[2]
      var agy = adx * e.left[0] + adz * e.left[2]
      var ad2 = agx * agx + agy * agy
      if (agx > 5 && ad2 > 100) {
        var kpp = (2 * agy) / ad2
        if (Math.abs(kpp - kRaw) <= (params.ppWindow != null ? params.ppWindow : 0.02)) kRaw = Math.abs(kpp) < (params.kappaDeadband != null ? params.kappaDeadband : 0.0015) ? 0 : kpp
      }
    }
  }
  // Smoothing: the planner picks one of a few dozen discrete curvatures every frame, so a tiny change of goal / costmap hops
  // between neighbours (visible as fast left-right steering). Small changes (< kappaJump) are low-passed
  // (tau 0.04 s + 0.008 s per m/s); a large change (avoidance) passes through quickly (tau 0.04 s). Reverse / manoeuvre override bypass the filter (precise geometry).
  var v = Math.abs(e.speed)
  if (state.kf === undefined || av.mode === 'reverse' || av.plan.override || v < 2) state.kf = kRaw
  var jump = Math.abs(kRaw - state.kf)
  var tauK = jump > (params.kappaJump != null ? params.kappaJump : 0.025) ? (params.kappaTauFast != null ? params.kappaTauFast : 0.04) : (params.kappaTau != null ? params.kappaTau : 0.04) + (params.kappaTauSpeed != null ? params.kappaTauSpeed : 0.008) * v
  state.kf += (kRaw - state.kf) * Math.min(1, dt / (tauK + dt))
  var kCmd = state.kf
  var steer = kCmd / kps
  if (Math.abs(e.speed) > 2 && av.mode !== 'reverse') {
    steer += (fb * (kCmd - e.kappa)) / kps
  }
  if (steer > 1) steer = 1
  if (steer < -1) steer = -1
  var prev = state.steer || 0
  var maxStep = rate * dt
  if (steer > prev + maxStep) steer = prev + maxStep
  if (steer < prev - maxStep) steer = prev - maxStep
  state.steer = steer
  // car2 treats exactly 0 as "no steering command" (wheel re-centres on its own)
  input.actions.steering_angle = Math.abs(steer) < 1e-4 ? 0 : steer
  av.cmdSteer = steer
  api.watch('av.latk', Math.round(state.kf * 1e4) / 1e4 + ' m' + Math.round(e.kappa * 1e4) / 1e4 + ' s' + Math.round(steer * 1e3) / 1e3)
  if (params.debugDraw !== false) {
    // white: commanded steering direction from the nose (4 m chord)
    var th = steer * kps * 4
    var nose = api.vec.offsetAlong(input.position, e.fwd, 2)
    var dir = [e.fwd[0] * Math.cos(th) + e.left[0] * Math.sin(th), 0, e.fwd[2] * Math.cos(th) + e.left[2] * Math.sin(th)]
    api.visualizeLine(nose, api.vec.offsetAlong(nose, dir, 4), '#ffffff')
  }
  return {}
}
