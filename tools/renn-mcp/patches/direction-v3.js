var backOff = {
  isOn: function () { return this.until > Date.now(); },
  trigger: function (steerForward) {
    this.until = Date.now() + 1200
    this.steerForward = steerForward
    this.phase = 'forward'
  },
  until: 0,
  steerForward: 0,
  phase: 'forward',
}

function clampSteer(v) {
  if (v > 1) return 1
  if (v < -1) return -1
  return v
}

function resolveTrueFollowPosition(input, params, api) {
  if (typeof params.id === 'string' && params.id.length > 0) {
    var live = api.getWorldPosition(params.id)
    if (live) return live
  }
  if (input.target && input.target.pose && input.target.pose.position) {
    return input.target.pose.position
  }
  return null
}

function transform(input, dt, params, state, api) {
  if (
    api.getAction(input, 'steer_left') ||
    api.getAction(input, 'steer_right') ||
    api.getAction(input, 'throttle') ||
    api.getAction(input, 'brake')
  ) {
    return
  }

  delete input.actions._obstacle_escape

  var truePos = resolveTrueFollowPosition(input, params, api)
  if (!truePos) return {}

  var toTrue = api.vec.subtract(truePos, input.position)
  var distTrue = api.vec.length(toTrue)

  var up = api.getUpVector(input.rotation)
  var forward = api.getForwardVector(input.rotation)
  forward = api.vec.normalize(api.vec.projectOntoPlane(forward, up))
  var flatToTrue = api.vec.normalize(api.vec.projectOntoPlane(toTrue, up))

  var aimPos = input.target.pose.position
  var toAim = api.vec.subtract(aimPos, input.position)
  toAim = api.vec.normalize(api.vec.projectOntoPlane(toAim, up))

  var signedSteer = api.vec.signedAngleAroundAxis(forward, toAim, up)
  var forwardSpeed = api.vec.getForwardSpeed(input.velocity, forward)
  var aimAwayFromTrue = api.vec.angleBetween(toAim, flatToTrue)

  if (forwardSpeed < -0.2) signedSteer = -signedSteer
  var steerGain = 1 + Math.min(2.2, aimAwayFromTrue * 1.8)
  if (Math.abs(signedSteer) >= 0.001) {
    input.actions.steering_angle = clampSteer(signedSteer * steerGain)
  }

  if (backOff.isOn()) {
    input.actions._obstacle_escape = 1
    var esc = clampSteer(backOff.steerForward * 2.5)
    if (forwardSpeed > 0.35) {
      backOff.phase = 'forward'
      input.actions.throttle = 0
      input.actions.brake = 0.85
      input.actions.steering_angle = esc
    } else if (forwardSpeed < -0.35) {
      backOff.phase = 'reverse'
      input.actions.brake = 0
      input.actions.throttle = 0.7
      input.actions.steering_angle = -esc
    } else if (backOff.phase === 'forward') {
      input.actions.throttle = 0
      input.actions.brake = 0.9
      input.actions.steering_angle = esc
      if (forwardSpeed < 0.08) backOff.phase = 'reverse'
    } else {
      input.actions.brake = 0
      input.actions.throttle = 0.75
      input.actions.steering_angle = -esc
    }
    return
  }

  var front = api.vec.offsetAlong(input.position, forward, 5)
  if (api.raycastSpread(front, forward, 1.2, 2, 10).hit === true) {
    var steerNow = input.actions.steering_angle
    if (steerNow == null || Math.abs(steerNow) < 0.02) steerNow = signedSteer
    if (distTrue > 8) {
      backOff.trigger(clampSteer(steerNow))
      return
    }
  }

  var speed = api.vec.length(input.velocity)
  var targetSpeed = distTrue < 30 ? 10 : 55
  if (aimAwayFromTrue > 0.45) targetSpeed = Math.min(targetSpeed, 18 + 12 * (1 - aimAwayFromTrue))
  if (targetSpeed > speed) input.actions.throttle = 1
}
