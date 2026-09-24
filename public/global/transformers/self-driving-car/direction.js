function hugBackoffState(state) {
  if (!state._dirHugBackoff) {
    state._dirHugBackoff = { nextPulseAt: 0 }
  }
  return state._dirHugBackoff
}

function backOffState(state) {
  if (!state._dirBackOff) {
    state._dirBackOff = { until: 0, steerForward: 0, phase: 'forward' }
  }
  var b = state._dirBackOff
  if (!b.isOn) {
    b.isOn = function () { return this.until > Date.now() }
    b.trigger = function (steerForward, holdMs) {
      this.until = Date.now() + (holdMs || 480)
      this.steerForward = steerForward
      this.phase = 'forward'
    }
  }
  return b
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

  if (!input.target || !input.target.pose || !input.target.pose.position) {
    input.target = { pose: { position: truePos }, id: params.id }
  }

  var backOff = backOffState(state)

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
  if (input.actions._uml_maneuver) steerGain += 1.8
  if (Math.abs(signedSteer) >= 0.001) {
    input.actions.steering_angle = clampSteer(signedSteer * steerGain)
  }

  if (backOff.isOn()) {
    api.watch('dir.backoff', 1)
    input.actions._obstacle_escape = 1
    var esc = clampSteer(backOff.steerForward * 2.5)
    var probeOrigin = api.vec.offsetAlong(input.position, forward, 2.5)
    var probe = api.raycastSpread(probeOrigin, forward, 2.2, 1.4, 8, { visualize: false })
    if (!probe.hit) {
      backOff.until = 0
      api.watch('dir.backoff', 0)
      return
    }
    if (forwardSpeed < -0.95) {
      backOff.until = 0
      api.watch('dir.backoff', 0)
      return
    }
    // car2: gas = throttle - brake (positive brake drives backward)
    if (forwardSpeed > 0.35) {
      backOff.phase = 'forward'
      input.actions.throttle = 0
      input.actions.brake = 0.62
      input.actions.steering_angle = esc
    } else if (forwardSpeed < -0.25) {
      backOff.phase = 'reverse'
      input.actions.throttle = 0
      input.actions.brake = 0.38
      input.actions.steering_angle = -esc
    } else if (backOff.phase === 'forward') {
      input.actions.throttle = 0
      input.actions.brake = 0.58
      input.actions.steering_angle = esc
      if (forwardSpeed < 0.06) backOff.phase = 'reverse'
    } else {
      input.actions.throttle = 0
      input.actions.brake = 0.36
      input.actions.steering_angle = -esc
    }
    return
  }

  var front = api.vec.offsetAlong(input.position, forward, 3)
  var frontBlock = api.raycastSpread(front, forward, 2.5, 1.6, 10, { visualize: false })
  var speed = api.vec.length(input.velocity)

  if (frontBlock.hit === true) {
    api.watch('dir.frontDist', frontBlock.distance)
    var steerNow = input.actions.steering_angle
    if (steerNow == null || Math.abs(steerNow) < 0.02) steerNow = signedSteer
    var close = frontBlock.distance < 1.55
    var holdMs = close ? 520 : 420
    // Short back-off when blocked close ahead — not from far-range hits (removed distTrue gate).
    var needBackOff =
      frontBlock.distance < 2.35 &&
      (close || speed < 3.5 || frontBlock.distance < 2.05)
    // Umlenker owns lateral detours; direction's short front ray often hits earlier than uml lookahead.
    if (input.actions._uml_maneuver && !input.actions._uml_blocked) {
      needBackOff = false
    }
    if (input.actions._uml_blocked) {
      needBackOff = true
    }
    if (needBackOff) {
      api.watch('dir.backoff', 1)
      backOff.trigger(clampSteer(steerNow), holdMs)
      return
    }
    api.watch('dir.backoff', 0)
    if (!input.actions._uml_maneuver) {
      input.actions.throttle = 0
    }
  } else {
    api.watch('dir.backoff', 0)
  }

  var hug = hugBackoffState(state)
  var umlClosest = input.actions._uml_closest
  if (
    !backOff.isOn() &&
    input.actions._uml_maneuver &&
    input.actions._uml_goal_block &&
    umlClosest != null &&
    umlClosest < 2.05 &&
    !input.actions._uml_blocked &&
    frontBlock.hit !== true &&
    speed < 2.4 &&
    Date.now() >= hug.nextPulseAt
  ) {
    var hugHold = umlClosest < 1.85 ? 460 : 380
    hug.nextPulseAt = Date.now() + 860
    api.watch('dir.backoff', 1)
    backOff.trigger(clampSteer(signedSteer), hugHold)
    return
  }

  var targetSpeed = distTrue < 30 ? 9 : 42
  if (aimAwayFromTrue > 0.45) targetSpeed = Math.min(targetSpeed, 18 + 12 * (1 - aimAwayFromTrue))
  if (frontBlock.hit && frontBlock.distance < 4 && !input.actions._uml_maneuver) {
    targetSpeed = Math.min(targetSpeed, 6)
  }
  if (input.actions._uml_maneuver && frontBlock.hit && frontBlock.distance < 3.5) {
    targetSpeed = Math.min(targetSpeed, 9)
  }
  if (targetSpeed > speed) input.actions.throttle = 1
}
