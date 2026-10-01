// AV stack · CONTROL / lateral (curvature tracking).
// steering = feed-forward(kappa_plan / kappaPerSteer) + P feedback on measured curvature,
// with a steering-rate limiter (comfort / actuator model).
// params: kappaPerSteer, fbGain, steerRate
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.plan || !av.ego) return {}
  var e = av.ego
  var kps = params.kappaPerSteer || 0.12
  var fb = params.fbGain != null ? params.fbGain : 0.35
  var rate = params.steerRate != null ? params.steerRate : 4
  var kCmd = av.plan.kappa
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
  return {}
}
