// AV stack · CONTROL / lateral (curvature tracking).
// steering = feed-forward(kappa_plan / kappaPerSteer) + P feedback on measured curvature,
// with a steering-rate limiter (comfort / actuator model).
// debug draw: white = commanded steering direction.
// params: kappaPerSteer, fbGain, steerRate, kappaTau (0.04 s + 0.008 s per m/s), kappaJump (0.025 1/m)
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.plan || !av.ego) return {}
  var e = av.ego
  var kps = params.kappaPerSteer || 0.12
  var fb = params.fbGain != null ? params.fbGain : 0.35
  var rate = params.steerRate != null ? params.steerRate : 4
  var kRaw = av.plan.kappa
  // Smoothing: the planner picks one of a few dozen discrete curvatures every frame, so a tiny change of goal / costmap hops
  // between neighbours (visible as fast left-right steering). Small changes (< kappaJump) are low-passed
  // (tau 0.04 s + 0.008 s per m/s); a large change (avoidance) passes through quickly (tau 0.04 s). Reverse / manoeuvre override bypass the filter (precise geometry).
  var v = Math.abs(e.speed)
  if (state.kf === undefined || av.mode === 'reverse' || av.plan.override || v < 2) state.kf = kRaw
  var jump = Math.abs(kRaw - state.kf)
  var tauK = jump > (params.kappaJump != null ? params.kappaJump : 0.025) ? 0.04 : (params.kappaTau != null ? params.kappaTau : 0.04) + 0.008 * v
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
  if (params.debugDraw !== false) {
    // white: commanded steering direction from the nose (4 m chord)
    var th = steer * kps * 4
    var nose = api.vec.offsetAlong(input.position, e.fwd, 2)
    var dir = [e.fwd[0] * Math.cos(th) + e.left[0] * Math.sin(th), 0, e.fwd[2] * Math.cos(th) + e.left[2] * Math.sin(th)]
    api.visualizeLine(nose, api.vec.offsetAlong(nose, dir, 4), '#ffffff')
  }
  return {}
}
