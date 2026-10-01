// AV stack · CONTROL / longitudinal (speed PI with deadband feed-forward).
// The actuator has a static-friction deadband, so the controller adds `deadband` as feed-forward
// and PI-trims on top. Negative demand maps to the car's `brake` input (reverse thrust at standstill).
// params: kp, ki, deadband, maxThrottle, maxBrake, brakeGain
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
  var err = vTarget - vAlong
  var thr = 0
  var brk = 0
  var drive = 0 // magnitude along the demanded direction
  var retard = 0 // magnitude opposing motion in the demanded direction
  if (vTarget < 0.05 && Math.abs(e.speed) < 0.3) {
    state.i = 0
  } else if (err > 0) {
    state.i = Math.min(0.1, (state.i || 0) + ki * err * dt)
    drive = Math.min(maxThr, db + kp * err + state.i)
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
  return {}
}
