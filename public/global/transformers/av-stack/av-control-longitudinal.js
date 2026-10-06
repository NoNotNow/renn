/* @params
[
  {"key": "maxAccel", "type": "number", "default": 10, "group": "Speed control", "unit": "m/s²", "min": 0, "description": "Acceleration cap (80 once self-calibrated)."},
  {"key": "maxDecel", "type": "number", "default": 12, "group": "Speed control", "unit": "m/s²", "min": 0, "description": "Deceleration cap."},
  {"key": "selfCalibrate", "type": "boolean", "default": false, "group": "Speed control", "description": "Identify the actuator (G / D) at the first launch instead of using fixed priors."},
  {"key": "tau", "type": "number", "default": 0.35, "group": "Speed control", "min": 0, "description": "Speed-tracking time constant (0.12 when selfCalibrate is on)."},
  {"key": "breakawayRate", "type": "number", "default": 0.5, "group": "Speed control", "min": 0, "advanced": true},
  {"key": "frictionInit", "type": "number", "default": 60, "group": "Speed control", "min": 0, "description": "Prior for the actuator friction D (0 while self-calibrating without gainInit).", "advanced": true},
  {"key": "gainInit", "type": "number", "default": 156, "group": "Speed control", "min": 0, "description": "Prior for the actuator gain G (2500 when self-calibrating; setting it skips the probe).", "advanced": true},
  {"key": "ki", "type": "number", "default": 0.6, "group": "Speed control", "min": 0, "advanced": true},
  {"key": "maxBrake", "type": "number", "default": 1, "group": "Speed control", "min": 0, "advanced": true},
  {"key": "maxThrottle", "type": "number", "default": 1, "group": "Speed control", "min": 0, "advanced": true},
  {"key": "probeGrowth", "type": "number", "default": 1.4, "group": "Speed control", "min": 0, "advanced": true},
  {"key": "probeStart", "type": "number", "default": 0.01, "group": "Speed control", "min": 0, "advanced": true}
]
*/
// AV stack · CONTROL / longitudinal (model-based speed control with an online-identified actuator model).
// The car2 actuator turns a command u = throttle − brake into a force, so the body follows
//     a = G · u − D · sgn(v)          (G: m/s² per unit command, D: sliding/rolling friction deceleration, m/s²)
// G and D differ by orders of magnitude between bodies (reference car: G ≈ 156, D ≈ 60; a light icy car with power 2400:
// G ≈ 1200, D ≈ 1). A fixed deadband / gain only fits one of them — on the other the smallest command jumps the speed by
// metres per second per frame and the controller bang-bangs (the "jitter"). So G and D are estimated online (D from coasting
// frames, G from commanded frames with D fixed; the previous frame's command vs. the measured acceleration) and the controller asks for an
// acceleration: u = (a_des + D · s) / G, a_des = clamp((v_target − v) / tau + I, −maxDecel, maxAccel).
// Publishes av.actuator {G, D, u} (u = applied command; a later stage that overrides the actions must update it — the AEB does). The AEB uses it to brake with a deceleration instead of a raw command) and av.cmd.
// At rest the static friction can exceed D: a breakaway offset ramps while demanded motion does not start.
// SELF-CALIBRATION (selfCalibrate: true, set by every av-ego preset; off = the old fixed priors G 156 / D 60, tau 0.35, maxAccel 10): from a standstill the first launch ramps the command geometrically (probeStart 0.01, x1.4 per frame) until the body starts to move; two consecutive moving frames give the
// slope G = da / du exactly (a = G u - D, so the differences cancel D) and then D = G u - a. That takes ~0.1-0.2 s (the breakaway command is D / G, 0.02 for a 2400 m/s^2 body, 0.4 for a 156 m/s^2 one)
// and never kicks: the commands before motion are below breakaway and the first moving frames are < 1.5 m/s per frame. The identified model then drives a = (v_target - v) / tau capped by maxAccel.
// Without a standstill start (car already moving) there is no probe: the priors err on the SAFE side (gainInit 2500: a larger G than any realistic body gives smaller commands than needed, never a kick;
// frictionInit 0: no forward feed-forward against friction the body may not have) and the online estimate (G +35 % / D from coasting frames) converges within ~0.3 s. An explicit `gainInit` skips the probe.
// A launch that does not start moving (blocked, pinned to a wall) gives up after ~0.4 s at full command and is re-armed 2 s later.
// params: selfCalibrate, tau (0.35; 0.12 self-calibrating), ki, maxAccel (10; 80 once self-calibrated), maxDecel, maxThrottle, maxBrake, breakawayRate, gainInit (prior 156; 2500 self-calibrating; set = skip the probe),
//         frictionInit (prior 60; 0 while self-calibrating without gainInit), probeStart (0.01), probeGrowth (1.4)
function transform(input, dt, params, state, api) {
  var av = input.av
  // av-ego's preset table (params.preset) under this stage's own params (binding / scope / stage params win); cached while both are the same objects
  if (av && av.preset) params = state.pmP === params && state.pmB === av.preset ? state.pm : ((state.pmP = params), (state.pmB = av.preset), (state.pm = Object.assign({}, av.preset, params)))
  if (!av || !av.plan || !av.ego) return {}
  var e = av.ego
  var vDes = av.plan.vDesired || 0
  var selfCal = params.selfCalibrate === true
  var tau = params.tau != null ? params.tau : selfCal ? 0.12 : 0.35
  var ki = params.ki != null ? params.ki : 0.6
  var maxDec = params.maxDecel != null ? params.maxDecel : 12
  var maxThr = params.maxThrottle != null ? params.maxThrottle : 1
  var maxBrk = params.maxBrake != null ? params.maxBrake : 1
  var v = e.speed
  if (state.G === undefined) {
    state.G = params.gainInit != null ? params.gainInit : selfCal ? 2500 : 156
    state.D = params.frictionInit != null ? params.frictionInit : selfCal && params.gainInit == null ? 0 : 60
    state.cal = !selfCal || params.gainInit != null || Math.abs(v) > 0.5 ? 'done' : 'pending'
    state.pairs = []
    state.pk = 0
    state.restT = 0
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
  // G and D are identified SEPARATELY (the former joint RLS on [G, D] was ill-conditioned: with the speed in one direction the data only fix
  // G * u - D, so an underestimated G was 'explained' by a runaway D (0 -> 300 within 20 frames), and the controller then commanded forward
  // thrust against its own friction model: speed kicks and 60+ m/s runaways on light powerful cars):
  //  - D from COASTING frames (command ~ 0, moving): the deceleration is the friction, a = -D * sgn(v), directly;
  //  - G from COMMANDED frames with D fixed: normalised LMS on a = G * u - D * sgn(v), weighted by the command (a tiny command says little).
  if (state.cal !== 'probing' && !pushing && Math.abs(vMid) > 0.12 && state.vPrev * v > 0) {
    var sgnV = vMid > 0 ? 1 : -1
    if (Math.abs(state.uPrev) > 1e-4) {
      var x0 = state.uPrev
      var err = aMeas - (state.G * x0 - state.D * sgnV)
      // robust: a collision / kerb spike must not wreck the model
      var lim = 50 + 0.5 * Math.abs(state.G * x0)
      if (err > lim) err = lim
      if (err < -lim) err = -lim
      var dG = (0.5 * err * x0) / (x0 * x0 + 4e-4)
      // one noisy sample must not drop G to the floor (next frame u = 1.0 with the real G = 1200: +20 m/s in two frames).
      // Growth is safe (a larger G means a smaller command) and may be fast: a car whose real G is 9x the prior needs ~7 frames.
      var capG = 0.1 * state.G + 2
      var capGUp = 0.35 * state.G + 2
      if (dG > capGUp) dG = capGUp
      if (dG < -capG) dG = -capG
      state.G = Math.max(10, Math.min(20000, state.G + dG))
      state.samples++
    } else if (Math.abs(v) > 1) {
      var dMeas = -aMeas * sgnV
      if (dMeas < 0) dMeas = 0
      if (dMeas > 300) dMeas = 300
      state.D += 0.15 * (dMeas - state.D)
      state.samples++
    }
  }
  // Rescue path: the command clearly dominates friction and the response is far larger than the model predicts
  // (G underestimated — e.g. learned while pushing against a slope, or while the speed sign flipped every frame, where
  // the RLS is gated off). Pull G towards the observed gain directly so the controller stops saturating.
  // Only for a saturated command (that is the failure mode); collisions also produce big accelerations and must not pump G.
  if (state.cal !== 'probing' && !pushing && Math.abs(state.uPrev) > 0.3 && aMeas * state.uPrev > 0 && Math.abs(aMeas) > 3 * state.D + 10) {
    var gObs = Math.abs(aMeas / state.uPrev)
    if (gObs > 1.5 * state.G) state.G = Math.min(20000, state.G + 0.3 * (gObs - state.G))
  }
  var G = state.G
  var D = state.D
  var maxAcc = params.maxAccel != null ? params.maxAccel : selfCal && state.cal === 'done' ? 80 : 10


  // --- standstill launch probe (see header) ---
  var probeU = null
  if (state.cal === 'gaveup') {
    state.restT += dt
    if (state.restT > 2) state.cal = 'pending'
  }
  if (state.cal === 'pending' && Math.abs(vDes) > 0.3 && Math.abs(v) < 0.3 && !pushing) {
    state.cal = 'probing'
    state.pk = 0
    state.pairs = []
    state.pS = vDes > 0 ? 1 : -1
  }
  if (state.cal === 'probing') {
    var ps = state.pS
    if (Math.abs(vDes) < 0.3 || vDes * ps < 0 || pushing) {
      state.cal = 'pending'
      probeU = 0
    } else {
      if (state.pk > 0) {
        var asig = ps * aMeas
        if (asig > 2.5 && ps * v > 0.02) state.pairs.push([ps * state.uPrev, asig])
        else state.pairs.length = 0
      }
      var np = state.pairs.length
      if (np >= 2) {
        var p1 = state.pairs[np - 2]
        var p2 = state.pairs[np - 1]
        var gEst = (p2[1] - p1[1]) / (p2[0] - p1[0])
        if (gEst > 15) {
          state.G = Math.max(15, Math.min(20000, gEst))
          state.D = Math.max(0, Math.min(400, state.G * p1[0] - p1[1]))
          state.cal = 'done'
          state.samples = 6
          G = state.G
          D = state.D
          maxAcc = params.maxAccel != null ? params.maxAccel : 80
          state.uPrev = 0
          state.boost = 0
        } else state.pairs.shift()
      }
      if (state.cal === 'probing') {
        var pu = (params.probeStart != null ? params.probeStart : 0.01) * Math.pow(params.probeGrowth != null ? params.probeGrowth : 1.4, state.pk)
        state.pk++
        if (pu >= 1) {
          state.pFull = (state.pFull || 0) + 1
          pu = 1
          if (state.pFull > 24) {
            state.cal = 'gaveup'
            state.pFull = 0
            state.restT = 0
            probeU = 0
          }
        }
        if (state.cal === 'probing') probeU = ps * Math.min(pu, Math.min(maxThr, maxBrk))
      }
    }
  }

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
    // (A probe cap on the first command was tried against the one-frame standing-start kick: it delayed every launch by ~1.5 s, so an
    // evasion from rest started late and the planner's threatAccel speed profile over-promised -> pincer / crossing / corner-trap contacts. Removed.)
    // breakaway: demanded motion does not start (static friction > D) -> ramp an extra push
    var want = Math.abs(vDes) > 0.3
    // far below the demanded speed and not gaining (static friction / force balance the model does not explain yet)
    // 'driving' = clearly moving in the demanded direction (a creep of 0.1 m/s that comes and goes must not count: the push relaxed
    // at every creep and the car idled for ever at a boost just below breakaway, G / D of the model nonsense)
    var driveThr = Math.max(0.5, Math.min(1.5, 0.25 * Math.abs(vDes)))
    var drive = vDes > 0 ? v : -v
    var stuck = want && drive < driveThr && vDes * aDes > 0 && aMeas * (vDes > 0 ? 1 : -1) < 0.5
    if (state.cal === 'probing') state.boost = 0
    else if (stuck) state.boost = Math.min(1, state.boost + (params.breakawayRate != null ? params.breakawayRate : 0.5) * dt)
    // keep the push until the car really drives (else it jerks, stops, ramps again); then relax it slowly
    else if (!want || drive >= driveThr) state.boost = Math.max(0, state.boost - 0.5 * dt)
    if (state.boost > 0 && want) u += (vDes > 0 ? 1 : -1) * state.boost
    // overspeed (much faster than demanded (> 8 m/s), in the direction of travel, and still accelerating): never push along the direction of travel either. A friction feed-forward
    // (aDes + D) / G with an overestimated D asked for forward thrust while braking, i.e. the car accelerated to 60+ m/s against a demand of 10;
    // friction / brake alone slow it down, and the model catches up.
    var sTrav = v > 0 ? 1 : -1
    if (Math.abs(v) > 1 && (v - vDes) * sTrav > 8 && u * sTrav > 0 && aMeas * sTrav > 0) u = 0
    // stopping: never push along the direction of travel (friction alone may decelerate harder than maxDecel — fine)
    if (Math.abs(vDes) < 0.05 && u * v > 0) u = 0
  }
  if (probeU !== null) u = probeU
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
