// AV stack · CONTROL / longitudinal (speed PI with deadband feed-forward).
// The actuator has a static-friction deadband, so the controller adds `deadband` as feed-forward
// and PI-trims on top. Negative demand maps to the car's `brake` input (reverse thrust at standstill).
// Self-calibrating breakaway: if the vehicle does not move although speed is demanded, the static deadband
// is ramped up (0.5/s, to 1.0), kept while driving and relaxed again on over-speed, so heavier or grippier bodies than the reference car still get going.
// params: kp, ki, deadband, maxThrottle, maxBrake, brakeGain, breakawayRate
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.plan || !av.ego) return {}
  var e = av.ego
  var vDes = av.plan.vDesired || 0
  var kp = params.kp != null ? params.kp : 0.03
  var ki = params.ki != null ? params.ki : 0.02
  var db = params.deadband != null ? params.deadband : 0.36
  var maxThr = params.maxThrottle != null ? params.maxThrottle : 0.46
  var maxBrk = params.maxBrake != null ? params.maxBrake : 0.6
  var brakeGain = params.brakeGain != null ? params.brakeGain : 0.12
  // signed demand: positive = forward drive (throttle), negative = reverse drive (brake channel)
  var dir = vDes >= 0 ? 1 : -1
  var vAlong = e.speed * dir // speed in the demanded direction
  var vTarget = Math.abs(vDes)
  // learned deadband: ramps while the body refuses to move or creeps
  if (state.dbS === undefined) {
    state.dbS = db
    state.stallT = 0
  }
  var rate = params.breakawayRate != null ? params.breakawayRate : 0.5
  // stagnation = far below the demanded speed and no longer accelerating (stuck at rest or creeping)
  var stagnant = vTarget > 0.5 && vAlong < Math.min(2, 0.4 * vTarget) && Math.abs(e.accel) < 0.3
  // decay instead of reset: a creeping body jitters in and out of the 'no acceleration' band
  if (stagnant) state.stallT += dt
  else state.stallT = Math.max(0, state.stallT - 0.5 * dt)
  if (state.stallT > 0.4 && state.dbS < 1) state.dbS = Math.min(1, state.dbS + rate * dt)
  // over-speed: the learned value is too high, relax it back towards the reference deadband
  if (vTarget > 0.5 && vAlong > vTarget + 0.5 && state.dbS > db) state.dbS = Math.max(db, state.dbS - 0.2 * dt)
  var dbEff = state.dbS
  var err = vTarget - vAlong
  var thr = 0
  var brk = 0
  var drive = 0 // magnitude along the demanded direction
  var retard = 0 // magnitude opposing motion in the demanded direction
  if (vTarget < 0.05 && Math.abs(e.speed) < 0.3) {
    state.i = 0
  } else if (err > 0) {
    state.i = Math.min(state.dbS > db + 1e-6 ? 0.4 : 0.1, (state.i || 0) + ki * err * dt)
    // the reference car keeps the original caps; a learned (heavier) body may use more throttle
    var learned = state.dbS > db + 1e-6
    drive = Math.min(learned ? Math.max(maxThr, dbEff + 0.15) : maxThr, dbEff + kp * err + state.i)
  } else {
    state.i = Math.max(0, (state.i || 0) * 0.9)
    retard = Math.min(maxBrk, brakeGain * -err)
    if (vAlong < 0.3 && vTarget < 0.05) retard = 0
  }
  if (vTarget < 0.05 && Math.abs(e.speed) >= 0.3) {
    // demand zero but still rolling: brake against the current direction of travel
    var oppose = e.speed > 0 ? 1 : -1
    var b = Math.min(maxBrk, brakeGain * Math.abs(e.speed))
    if (oppose > 0) brk = b
    else thr = b
  } else if (dir > 0) {
    thr = drive
    brk = retard
  } else {
    brk = drive
    thr = retard
  }
  input.actions.throttle = thr
  input.actions.brake = brk
  av.cmd = { throttle: thr, brake: brk }
  api.watch('av.throttle', thr.toFixed(2) + ' brake ' + brk.toFixed(2) + ' dbS ' + state.dbS.toFixed(2) + ' vd ' + vDes.toFixed(1))
  return {}
}
