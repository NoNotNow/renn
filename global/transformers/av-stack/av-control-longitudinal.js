// AV stack · CONTROL / longitudinal (model-based speed control with an online-identified actuator model).
// The car2 actuator turns a command u = throttle − brake into a force, so the body follows
//     a = G · u − D · sgn(v)          (G: m/s² per unit command, D: sliding/rolling friction deceleration, m/s²)
// G and D differ by orders of magnitude between bodies (reference car: G ≈ 156, D ≈ 60; a light icy car with power 2400:
// G ≈ 1200, D ≈ 1). A fixed deadband / gain only fits one of them — on the other the smallest command jumps the speed by
// metres per second per frame and the controller bang-bangs (the "jitter"). So G and D are estimated online (recursive
// least squares on the previous frame's command vs. the measured acceleration) and the controller asks for an
// acceleration: u = (a_des + D · s) / G, a_des = clamp((v_target − v) / tau + I, −maxDecel, maxAccel).
// Publishes av.actuator {G, D, u} (u = applied command; a later stage that overrides the actions must update it — the AEB does). The AEB uses it to brake with a deceleration instead of a raw command) and av.cmd.
// At rest the static friction can exceed D: a breakaway offset ramps while demanded motion does not start.
// params: tau, ki, maxAccel, maxDecel, maxThrottle, maxBrake, breakawayRate, gainInit, frictionInit, forget
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.plan || !av.ego) return {}
  var e = av.ego
  var vDes = av.plan.vDesired || 0
  var tau = params.tau != null ? params.tau : 0.35
  var ki = params.ki != null ? params.ki : 0.6
  var maxAcc = params.maxAccel != null ? params.maxAccel : 10
  var maxDec = params.maxDecel != null ? params.maxDecel : 12
  var maxThr = params.maxThrottle != null ? params.maxThrottle : 1
  var maxBrk = params.maxBrake != null ? params.maxBrake : 1
  var lam = params.forget != null ? params.forget : 0.97
  var v = e.speed
  if (state.G === undefined) {
    state.G = params.gainInit != null ? params.gainInit : 156
    state.D = params.frictionInit != null ? params.frictionInit : 60
    // RLS covariance over [G, D]
    state.P = [1e4, 0, 0, 1e3]
    state.uPrev = 0
    state.vPrev = v
    state.I = 0
    state.boost = 0
    state.samples = 0
  }
  // --- identify: last frame's command produced this frame's acceleration ---
  // a later stage (AEB) that overrode the command reports what was really applied in last frame's av.actuator.u
  if (state.lastAct && typeof state.lastAct.u === 'number') state.uPrev = state.lastAct.u
  var aMeas = dt > 1e-6 ? (v - state.vPrev) / dt : 0
  var vMid = 0.5 * (v + state.vPrev)
  var pushing = input.environment && input.environment.isTouchingSide
  // (sliding friction acts as soon as the body slides: learn from 0.12 m/s on, so a car creeping in force balance is not
  // stuck between 'too slow to learn' and 'too fast for the breakaway push')
  if (!pushing && Math.abs(state.uPrev) > 1e-4 && Math.abs(vMid) > 0.12 && state.vPrev * v > 0) {
    var x0 = state.uPrev
    var x1 = -(vMid > 0 ? 1 : -1)
    var P = state.P
    var px0 = P[0] * x0 + P[1] * x1
    var px1 = P[2] * x0 + P[3] * x1
    var den = lam + x0 * px0 + x1 * px1
    var k0 = px0 / den
    var k1 = px1 / den
    var err = aMeas - (state.G * x0 + state.D * x1)
    // robust: a collision / kerb spike must not wreck the model
    var lim = 50 + 0.5 * Math.abs(state.G * x0)
    if (err > lim) err = lim
    if (err < -lim) err = -lim
    // one noisy sample (a speed jitter of 1 m/s per frame is 60 m/s^2 against a tiny command, with a wide covariance) used to drop G
    // from 800 to the floor in a single update -> next frame u = 1.0 with the real G = 1200: +20 m/s in two frames (launch / crash).
    // The model may therefore only change by a bounded fraction per frame (growth is covered by the rescue path below).
    var dG = k0 * err
    var capG = 0.1 * state.G + 2
    if (dG > capG) dG = capG
    if (dG < -capG) dG = -capG
    var dD = k1 * err
    var capD = 0.2 * state.D + 2
    if (dD > capD) dD = capD
    if (dD < -capD) dD = -capD
    state.G = Math.max(10, Math.min(20000, state.G + dG))
    state.D = Math.max(0, Math.min(300, state.D + dD))
    var n0 = (P[0] - k0 * px0) / lam
    var n1 = (P[1] - k0 * px1) / lam
    var n2 = (P[2] - k1 * px0) / lam
    var n3 = (P[3] - k1 * px1) / lam
    // keep the covariance bounded (forgetting without excitation blows it up)
    state.P = [Math.min(n0, 1e5), n1, n2, Math.min(n3, 1e4)]
    state.samples++
  }
  // Rescue path: the command clearly dominates friction and the response is far larger than the model predicts
  // (G underestimated — e.g. learned while pushing against a slope, or while the speed sign flipped every frame, where
  // the RLS is gated off). Pull G towards the observed gain directly so the controller stops saturating.
  // Only for a saturated command (that is the failure mode); collisions also produce big accelerations and must not pump G.
  if (!pushing && Math.abs(state.uPrev) > 0.3 && aMeas * state.uPrev > 0 && Math.abs(aMeas) > 3 * state.D + 10) {
    var gObs = Math.abs(aMeas / state.uPrev)
    if (gObs > 1.5 * state.G) state.G = Math.min(20000, state.G + 0.3 * (gObs - state.G))
  }
  var G = state.G
  var D = state.D

  // --- control ---
  var u = 0
  var holding = Math.abs(vDes) < 0.05 && Math.abs(v) < 0.3
  if (holding) {
    state.I = 0
    state.boost = 0
  } else {
    var errV = vDes - v
    // integral (acceleration units) only while not saturated, so steady errors (slope, model error) vanish
    var aDes = errV / tau + state.I
    if (aDes > maxAcc) aDes = maxAcc
    if (aDes < -maxDec) aDes = -maxDec
    if (aDes > -maxDec && aDes < maxAcc) state.I = Math.max(-3, Math.min(3, state.I + ki * errV * dt))
    // never brake through zero within one frame: the deceleration that stops the car this frame is the most we ask for
    if (Math.abs(vDes) < 0.05) {
      var stopA = Math.abs(v) / Math.max(dt, 1e-3)
      if (v > 0 && aDes < -stopA) aDes = -stopA
      if (v < 0 && aDes > stopA) aDes = stopA
    }
    // friction feed-forward in the direction of travel (at rest: of the wanted motion)
    var s = Math.abs(v) > 0.3 ? (v > 0 ? 1 : -1) : aDes > 0 ? 1 : aDes < 0 ? -1 : 0
    var fric = D * s
    // at rest, friction helps braking: no reverse push needed to stay stopped
    if (Math.abs(v) <= 0.3 && Math.abs(vDes) < 0.05) fric = 0
    u = (aDes + fric) / G
    // breakaway: demanded motion does not start (static friction > D) -> ramp an extra push
    var want = Math.abs(vDes) > 0.3
    // far below the demanded speed and not gaining (static friction / force balance the model does not explain yet)
    // 'driving' = clearly moving in the demanded direction (a creep of 0.1 m/s that comes and goes must not count: the push relaxed
    // at every creep and the car idled for ever at a boost just below breakaway, G / D of the model nonsense)
    var driveThr = Math.max(0.5, Math.min(1.5, 0.25 * Math.abs(vDes)))
    var drive = vDes > 0 ? v : -v
    var stuck = want && drive < driveThr && vDes * aDes > 0 && aMeas * (vDes > 0 ? 1 : -1) < 0.5
    if (stuck) state.boost = Math.min(1, state.boost + (params.breakawayRate != null ? params.breakawayRate : 0.5) * dt)
    // keep the push until the car really drives (else it jerks, stops, ramps again); then relax it slowly
    else if (!want || drive >= driveThr) state.boost = Math.max(0, state.boost - 0.5 * dt)
    if (state.boost > 0 && want) u += (vDes > 0 ? 1 : -1) * state.boost
    // stopping: never push along the direction of travel (friction alone may decelerate harder than maxDecel — fine)
    if (Math.abs(vDes) < 0.05 && u * v > 0) u = 0
  }
  if (u > maxThr) u = maxThr
  if (u < -maxBrk) u = -maxBrk
  state.uPrev = u
  state.vPrev = v
  input.actions.throttle = u > 0 ? u : 0
  input.actions.brake = u < 0 ? -u : 0
  // mailbox: stages after this one write the command they actually applied into av.actuator.u
  av.actuator = { G: G, D: D, samples: state.samples, u: u }
  state.lastAct = av.actuator
  av.cmd = { throttle: input.actions.throttle, brake: input.actions.brake }
  api.watch('av.throttle', 'u ' + u.toFixed(3) + ' G ' + G.toFixed(0) + ' D ' + D.toFixed(1) + ' vd ' + vDes.toFixed(1))
  return {}
}
