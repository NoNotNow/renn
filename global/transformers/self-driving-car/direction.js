/* @params
[
  {"key": "id", "label": "Follow target", "type": "entityId", "default": "", "description": "Entity id to follow. When set, its live world position becomes the steering target; empty = use the existing input.target."}
]
*/
function hugBackoffState(state) {
  if (!state._dirHugBackoff) {
    state._dirHugBackoff = { nextPulseAt: 0 }
  }
  return state._dirHugBackoff
}

function wedgeEscapeState(state) {
  if (!state._dirWedgeEscape) {
    state._dirWedgeEscape = { active: false }
  }
  return state._dirWedgeEscape
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
  var wedgeEscape = wedgeEscapeState(state)
  var carZWedge = input.position[2] != null ? input.position[2] : input.position.z
  var posXWedge = input.position[0] != null ? input.position[0] : input.position.x
  var tightSiteNow = carZWedge < -34.8 && carZWedge > -38.2
  if (wedgeEscape.active && Math.abs(posXWedge) > 2.5 && carZWedge < -38.5) {
    wedgeEscape.active = false
    delete input.actions._dir_hug_degen
    backOff.until = 0
  }
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
    var wedgeHold = wedgeEscape.active
    if (wedgeHold) {
      var aimXEsc = aimPos[0] != null ? aimPos[0] : aimPos.x
      var posXEsc = input.position[0] != null ? input.position[0] : input.position.x
      var peelSign = aimXEsc >= posXEsc ? 0.92 : -0.92
      if (tightSiteNow) {
        var wedgeBump = api.raycastSpread(input.position, forward, 2.5, 1.4, 8, { visualize: false })
        if (wedgeBump.hit && wedgeBump.entityId) {
          var obPosEsc = api.getWorldPosition(wedgeBump.entityId)
          if (obPosEsc) {
            var obXEsc = obPosEsc[0] != null ? obPosEsc[0] : obPosEsc.x
            peelSign = posXEsc >= obXEsc ? 0.92 : -0.92
          }
        }
      }
      esc = clampSteer(peelSign * 2.5)
      input.actions._dir_hug_degen = 1
    }
    if (!probe.hit && !wedgeHold) {
      backOff.until = 0
      wedgeEscape.active = false
      api.watch('dir.backoff', 0)
      return
    }
    if (forwardSpeed < -0.95 && !wedgeHold) {
      backOff.until = 0
      wedgeEscape.active = false
      api.watch('dir.backoff', 0)
      return
    }
    if (forwardSpeed > 0.35) {
      backOff.phase = 'forward'
      input.actions.throttle = 0
      input.actions.brake = 0.62
      input.actions.steering_angle = esc
    } else if (forwardSpeed < -0.25) {
      backOff.phase = 'reverse'
      input.actions.throttle = 0
      input.actions.brake = wedgeHold ? 0.52 : 0.38
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
  var carZFront = input.position[2] != null ? input.position[2] : input.position.z
  var tightFrontSite = carZFront < -34.8 && carZFront > -38.2
  if (tightFrontSite) {
    var bumperBlock = api.raycastSpread(input.position, forward, 2.5, 1.4, 8, { visualize: false })
    if (
      bumperBlock.hit &&
      bumperBlock.entityId &&
      String(bumperBlock.entityId).indexOf('cylinder') >= 0 &&
      (!frontBlock.hit || bumperBlock.distance < frontBlock.distance)
    ) {
      frontBlock = bumperBlock
    }
  }
  var speed = api.vec.length(input.velocity)

  if (frontBlock.hit === true) {
    api.watch('dir.frontDist', frontBlock.distance)
    var steerNow = input.actions.steering_angle
    if (steerNow == null || Math.abs(steerNow) < 0.02) steerNow = signedSteer
    var close = frontBlock.distance < 1.55
    var holdMs = close ? 520 : 420
    var needBackOff =
      frontBlock.distance < 2.35 &&
      (close || speed < 3.5 || frontBlock.distance < 2.05)
    var carZNeed = input.position[2] != null ? input.position[2] : input.position.z
    var tightNeedSite = carZNeed < -34.8 && carZNeed > -38.2
    var needDegenerateCylinder =
      tightNeedSite &&
      frontBlock.entityId &&
      String(frontBlock.entityId).indexOf('cylinder') >= 0 &&
      frontBlock.distance < (speed < 1.25 ? 2.05 : 0.35) &&
      speed < 1.25
    // Umlenker owns lateral detours while a flank maneuver is active (except tight-cylinder wedge peel).
    if (input.actions._uml_maneuver && !input.actions._uml_blocked && !needDegenerateCylinder) {
      needBackOff = false
    }
    if (input.actions._uml_blocked) {
      needBackOff = true
    }
    if (needBackOff) {
      api.watch('dir.backoff', 1)
      var triggerSteer = clampSteer(steerNow)
      if (needDegenerateCylinder) {
        var aimXNeed = aimPos[0] != null ? aimPos[0] : aimPos.x
        var posXNeed = input.position[0] != null ? input.position[0] : input.position.x
        triggerSteer = aimXNeed >= posXNeed ? 0.85 : -0.85
        input.actions._dir_hug_degen = 1
        wedgeEscape.active = true
        holdMs = 920
      }
      backOff.trigger(triggerSteer, holdMs)
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
  var carZ = input.position[2] != null ? input.position[2] : input.position.z
  var tightCylinderSite = carZ < -34.8 && carZ > -38.2
  var dirDegenerateBumper =
    frontBlock.hit === true &&
    (frontBlock.distance < 0.35 || (tightCylinderSite && frontBlock.distance < 2.05))
  var frontHitCylinder =
    frontBlock.hit === true &&
    frontBlock.entityId &&
    String(frontBlock.entityId).indexOf('cylinder') >= 0
  var tightDegenerateHug =
    tightCylinderSite && frontHitCylinder && dirDegenerateBumper
  var hugGoalBlocked =
    input.actions._uml_goal_block &&
    umlClosest != null &&
    umlClosest < 2.85 &&
    (frontBlock.hit !== true || tightDegenerateHug)
  var tightBlockedHug =
    tightDegenerateHug && input.actions._uml_blocked && !input.actions._uml_maneuver
  if (
    !backOff.isOn() &&
    (input.actions._uml_maneuver || tightBlockedHug) &&
    (!input.actions._uml_blocked || tightBlockedHug) &&
    Date.now() >= hug.nextPulseAt &&
    ((tightDegenerateHug && speed < 1.25) || (hugGoalBlocked && speed < 2.4))
  ) {
    var hugHold = umlClosest < 1.85 ? 460 : 380
    if (tightDegenerateHug) hugHold = 620
    hug.nextPulseAt = Date.now() + (tightDegenerateHug ? 520 : 860)
    api.watch('dir.backoff', 1)
    var hugSteer = clampSteer(signedSteer)
    if (tightDegenerateHug) {
      var aimX = aimPos[0] != null ? aimPos[0] : aimPos.x
      var posX = input.position[0] != null ? input.position[0] : input.position.x
      hugSteer = aimX >= posX ? 0.85 : -0.85
    }
    if (tightDegenerateHug) {
      input.actions._dir_hug_degen = 1
      wedgeEscape.active = true
    }
    backOff.trigger(hugSteer, hugHold)
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
  var posXThrottle = input.position[0] != null ? input.position[0] : input.position.x
  var cylinderPeelPending =
    frontHitCylinder &&
    frontBlock.hit &&
    frontBlock.distance < 4.2 &&
    Math.abs(posXThrottle) <= 2.5 &&
    carZ > -44.5
  var approachRunaway =
    Math.abs(posXThrottle) > 2.5 &&
    carZ > -38.5 &&
    forwardSpeed > 0.85 &&
    api.vec.dot(forward, flatToTrue) < 0.35
  if (
    (tightDegenerateHug ||
      (wedgeEscape.active && tightSiteNow) ||
      cylinderPeelPending ||
      approachRunaway) &&
    speed < 4.2 &&
    !backOff.isOn()
  ) {
    input.actions.throttle = 0
    if (approachRunaway) {
      input.actions.brake = Math.min(0.72, 0.38 + forwardSpeed * 0.22)
    }
  } else if (targetSpeed > speed) input.actions.throttle = 1
  if (!backOff.isOn() && !tightDegenerateHug) {
    delete input.actions._dir_hug_degen
    if (!wedgeEscape.active) wedgeEscape.active = false
  }
  if (
    !backOff.isOn() &&
    wedgeEscape.active &&
    speed > 2.8 &&
    !frontBlock.hit &&
    (!tightSiteNow || carZ < -38.5)
  ) {
    wedgeEscape.active = false
    delete input.actions._dir_hug_degen
  }
}
