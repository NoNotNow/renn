/* @params
[
  {"key": "id", "label": "Follow target", "type": "entityId", "default": "", "description": "Entity id to follow. When set, its live world position is the target of the U-turn manoeuvre logic; empty = use input.target."}
]
*/
function blockedPulseState(state) {
  if (!state._umlBlockedPulse) {
    state._umlBlockedPulse = { nextAt: 0 }
  }
  return state._umlBlockedPulse
}

function v3x(v) {
  return Array.isArray(v) ? v[0] : v.x
}
function v3z(v) {
  return Array.isArray(v) ? v[2] : v.z
}

function isParkourCylinderL(entityId) {
  if (!entityId) return false
  return String(entityId).indexOf('parkour_cylinder_l') >= 0
}

/** Parkour cylinder wedge at z≈−36: close contact, not approach at z≈−31. */
function tightCylinderUmlSite(input, blockHit, speed) {
  if (!blockHit.hit) return false
  var carZ = v3z(input.position)
  if (carZ >= -34.8 || carZ <= -38.2) return false
  if (blockHit.distance >= 2.8) return false
  if (!isParkourCylinderL(blockHit.entityId)) return false
  if (speed > 1.35) return false
  return true
}

var maneuver = {
  isOn: function () { return this.expires > Date.now(); },
  trigger: function (vector, timeMs) {
    this.expires = Date.now() + timeMs
    this.vector = vector
  },
  reset: function () {
    this.expires = 0
    this.vector = undefined
  },
  expires: 0,
  vector: undefined,
}

function obstacleUrgency(closest) {
  var CRITICAL = 6
  var CALM = 12
  if (closest >= CALM) return 0
  if (closest <= CRITICAL) return 1
  return 1 - (closest - CRITICAL) / (CALM - CRITICAL)
}

function maneuverLockMs(deviation, urgency) {
  var base = 400 - Math.min(340, deviation * 300)
  return Math.max(120, Math.floor(base + urgency * 70))
}

function sanitizeObstacleHit(input, hit) {
  if (!hit || !hit.hit) return hit
  if (hit.entityId && hit.entityId === input.entityId) {
    return { hit: false, distance: 0, entityId: '' }
  }
  if (hit.distance < 0.35) {
    return { hit: false, distance: 0, entityId: '' }
  }
  return hit
}

function raycastObstacle(api, input, origin, direction, distance, options) {
  var hit = api.raycastSpread(origin, direction, distance, 2, 10, options || { visualize: false })
  return sanitizeObstacleHit(input, hit)
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

  if (!input.target || !input.target.pose || !input.target.pose.position) return {}

  // Upstream (e.g. wanderer) owns input.target.pose; use it for path scoring only.
  var goalPos = input.target.pose.position
  var truePos = goalPos
  if (typeof params.id === 'string' && params.id.length > 0) {
    var liveFollow = api.getWorldPosition(params.id)
    if (liveFollow) truePos = liveFollow
  }
  // Never snap input.target to a follow entity here — that pins the red debug line (and direction) on "car".
  var toTrue = api.vec.subtract(truePos, input.position)
  var distTrue = api.vec.length(toTrue)
  input.target.distance = distTrue

  if (distTrue < 5) {
    maneuver.reset()
    delete input.actions._uml_maneuver
    return
  }

  var up = api.getUpVector(input.rotation)
  var forward = api.getForwardVector(input.rotation)
  forward = api.vec.normalize(api.vec.projectOntoPlane(forward, up))
  var flatToTrue = api.vec.normalize(api.vec.projectOntoPlane(toTrue, up))
  var speedNow = api.vec.length(input.velocity)
  var frontOffset = distTrue < 28 ? 2.2 : 4.5
  var frontPosition = api.vec.offsetAlong(input.position, forward, frontOffset)
  var goalRayDist = Math.min(distTrue, 24)
  var goalHitEarly = raycastObstacle(api, input, input.position, flatToTrue, goalRayDist, {
    visualize: false,
  })
  var earlyGoalBlocked = goalHitEarly.hit && goalHitEarly.distance < distTrue - 0.8
  var pathGoal = truePos
  if (goalHitEarly.hit && goalHitEarly.distance < distTrue - 0.5) {
    // Past the blocker (thick obstacles need more than hit.distance + small slack).
    var pastBlock = goalHitEarly.distance + 10
    if (pastBlock > distTrue - 2) pastBlock = distTrue - 2
    pathGoal = api.vec.add(input.position, api.vec.scale(flatToTrue, pastBlock))
  }

  if (maneuver.isOn() && maneuver.vector) {
    if (api.vec.length(api.vec.subtract(maneuver.vector, input.position)) < 4) {
      maneuver.reset()
    } else if (api.vec.length(api.vec.subtract(truePos, maneuver.vector)) > distTrue + 10) {
      maneuver.reset()
    }
  }

  if (maneuver.isOn() && maneuver.vector) {
    var checkDist = Math.min(16, Math.max(8, distTrue))
    var frontClear = raycastObstacle(api, input, frontPosition, forward, checkDist, { visualize: false })
    var bumperHit = raycastObstacle(api, input, input.position, forward, 4, { visualize: false })
    var closeObDist = 999
    if (bumperHit.hit) closeObDist = bumperHit.distance
    if (goalHitEarly.hit && goalHitEarly.distance < closeObDist) closeObDist = goalHitEarly.distance
    if (frontClear.hit && frontClear.distance < closeObDist) closeObDist = frontClear.distance
    if (
      tightCylinderUmlSite(input, bumperHit, speedNow) &&
      Math.abs(v3x(maneuver.vector) - v3x(input.position)) > 4
    ) {
      maneuver.reset()
    } else if (!frontClear.hit && api.vec.angleBetween(forward, flatToTrue) < 0.45) {
      maneuver.reset()
    } else if (
      pathClear(api, input, input.position, maneuver.vector, up) &&
      (earlyGoalBlocked || pathClear(api, input, maneuver.vector, pathGoal, up))
    ) {
      var toLocked = api.vec.projectOntoPlane(api.vec.subtract(maneuver.vector, input.position), up)
      var stallSpeed = api.vec.length(input.velocity)
      if (
        earlyGoalBlocked &&
        closeObDist < 2.05 &&
        stallSpeed < 2.5 &&
        api.vec.dot(toLocked, forward) < 1.15
      ) {
        maneuver.reset()
      } else {
        input.target.pose.position = maneuver.vector
        input.actions._uml_maneuver = 1
        if (earlyGoalBlocked && closeObDist < 2.05) {
          input.actions._uml_goal_block = 1
          input.actions._uml_closest = closeObDist
        } else {
          delete input.actions._uml_goal_block
          delete input.actions._uml_closest
        }
        api.watch('uml.aimX', v3x(maneuver.vector))
        api.watch('uml.aimZ', v3z(maneuver.vector))
        return
      }
    }
    maneuver.reset()
  }

  var lookahead = distTrue - 6
  if (lookahead < 10) lookahead = 10
  if (lookahead > 22) lookahead = 22

  var frontHit = raycastObstacle(api, input, frontPosition, forward, lookahead, {
    visualize: true,
    hitColor: 'orange',
    missColor: 'cyan',
  })
  var goalHit = goalHitEarly
  var goalBlocked = goalHit.hit && goalHit.distance < distTrue - 0.8
  var blockHit = frontHit
  if (goalBlocked && (!frontHit.hit || goalHit.distance < frontHit.distance + 3)) {
    blockHit = goalHit
    api.watch('uml.goalBlock', 1)
  } else {
    api.watch('uml.goalBlock', 0)
    goalBlocked = false
  }
  api.watch('uml.lookahead', lookahead)
  api.watch('uml.frontHit', blockHit.hit ? 1 : 0)
  api.watch('uml.frontDist', blockHit.hit ? blockHit.distance : -1)
  api.watch('uml.frontEnt', blockHit.hit ? blockHit.entityId : '')
  if (!blockHit.hit) {
    api.watch('uml.maneuver', 0)
    delete input.actions._uml_maneuver
    delete input.actions._uml_blocked
    delete input.actions._uml_goal_block
    delete input.actions._uml_closest
    return {}
  }

  var bumperClose = raycastObstacle(api, input, input.position, forward, 4, { visualize: false })
  var pickCloseDist = blockHit.distance
  if (bumperClose.hit && bumperClose.distance < pickCloseDist) pickCloseDist = bumperClose.distance
  if (goalBlocked && pickCloseDist < 2.05) {
    input.actions._uml_goal_block = 1
    input.actions._uml_closest = pickCloseDist
  } else {
    delete input.actions._uml_goal_block
    delete input.actions._uml_closest
  }

  // Goal-blocked rays are straight at the obstacle; lateral fan needs the bumper forward axis.
  var scanFromGoalRay = blockHit === goalHit && !frontHit.hit
  var scanOrigin = scanFromGoalRay ? input.position : frontPosition
  var scanForward = scanFromGoalRay ? flatToTrue : forward
  var scanDist = scanFromGoalRay ? Math.min(goalHit.distance + 2, 18) : lookahead
  var blockForTight = blockHit
  if (bumperClose.hit && isParkourCylinderL(bumperClose.entityId)) {
    if (!blockForTight.hit || bumperClose.distance < blockForTight.distance) {
      blockForTight = bumperClose
    }
  }
  var tightUmlSite = tightCylinderUmlSite(input, blockForTight, speedNow)
  var picked = undefined
  if (tightUmlSite) {
    picked = tightCylinderFlankFallback(
      api,
      input,
      input.position,
      scanForward,
      up,
      truePos,
      distTrue,
      pathGoal,
    )
  } else if (goalBlocked) {
    picked = flankFallback(
      api,
      input,
      input.position,
      scanForward,
      up,
      truePos,
      distTrue,
      blockHit.distance,
      pathGoal,
      goalBlocked,
    )
  }
  if (!picked && !tightUmlSite) {
    picked = findCorrectionVector(
      api,
      input,
      input.position,
      scanOrigin,
      scanForward,
      scanDist,
      input.rotation,
      truePos,
      distTrue,
      flatToTrue,
      blockHit.distance,
      pathGoal,
      goalBlocked,
    )
  }
  if (!picked && tightUmlSite) {
    picked = tightCylinderForcedFlank(api, input, input.position, scanForward, up, distTrue)
  }
  if (!picked && goalBlocked && !tightUmlSite) {
    picked = flankFallback(
      api,
      input,
      input.position,
      scanForward,
      up,
      truePos,
      distTrue,
      blockHit.distance,
      pathGoal,
      goalBlocked,
    )
  }
  if (!picked) {
    api.watch('uml.maneuver', 0)
    delete input.actions._uml_maneuver
    var bp = blockedPulseState(state)
    var now = Date.now()
    if (blockHit.distance < 2.05 && now < bp.nextAt) {
      delete input.actions._uml_blocked
    } else {
      input.actions._uml_blocked = 1
      if (blockHit.distance < 2.05) bp.nextAt = now + 880
    }
    if (tightUmlSite) return
    return {}
  }

  input.target.pose.position = picked.candidate
  api.watch('uml.maneuver', 1)
  api.watch('uml.aimX', v3x(picked.candidate))
  api.watch('uml.aimZ', v3z(picked.candidate))
  input.actions._uml_maneuver = 1
  delete input.actions._uml_blocked
  maneuver.trigger(picked.candidate, maneuverLockMs(picked.deviation, obstacleUrgency(blockHit.distance)))
  return {}
}

function pathClear(api, input, from, to, up) {
  return pathClearSlack(api, input, from, to, up, 1.2)
}

function pathClearSlack(api, input, from, to, up, slack) {
  var delta = api.vec.subtract(to, from)
  var len = api.vec.length(delta)
  if (len < 0.5) return true
  var dir = api.vec.normalize(api.vec.projectOntoPlane(delta, up))
  var hit = raycastObstacle(api, input, from, dir, len, { visualize: false })
  return !hit.hit || hit.distance > len - slack
}

function tightCylinderFlankFallback(api, input, carPos, forward, up, truePos, distTrue, pathGoal) {
  var lateral = api.vec.normalize(api.vec.cross(up, forward))
  var offsets = [3.2, -3.2, 4, -4, 5, -5]
  var i
  for (i = 0; i < offsets.length; i++) {
    var candidate = api.vec.add(carPos, api.vec.scale(lateral, offsets[i]))
    if (!pathClearSlack(api, input, carPos, candidate, up, 0.55)) continue
    if (!pathClearSlack(api, input, candidate, pathGoal, up, 0.85)) continue
    var toTrue = api.vec.length(api.vec.subtract(truePos, candidate))
    if (toTrue > distTrue + 14) continue
    return { candidate: candidate, deviation: 0.65, candidateDist: toTrue }
  }
  return undefined
}

function tightCylinderForcedFlank(api, input, carPos, forward, up, distTrue) {
  var lateral = api.vec.normalize(api.vec.cross(up, forward))
  var carX = v3x(carPos)
  var prefer = carX >= 0 ? 1 : -1
  var offsets = [3.4 * prefer, -3.4 * prefer, 4.2 * prefer, -4.2 * prefer]
  var i
  for (i = 0; i < offsets.length; i++) {
    var candidate = api.vec.add(carPos, api.vec.scale(lateral, offsets[i]))
    if (!pathClearSlack(api, input, carPos, candidate, up, 0.42)) continue
    if (Math.abs(v3x(candidate) - carX) < 2.2) continue
    return { candidate: candidate, deviation: 0.72, candidateDist: distTrue }
  }
  return undefined
}

function flankFallback(api, input, carPos, forward, up, truePos, distTrue, closestObstacle, pathGoal, goalBlocked) {
  var urgency = obstacleUrgency(closestObstacle)
  var lateral = api.vec.normalize(api.vec.cross(up, forward))
  var offset = goalBlocked ? 14 + urgency * 10 : 8 + urgency * 10
  if (goalBlocked && closestObstacle < 2.8) offset += 4
  var options = [
    api.vec.add(carPos, api.vec.scale(lateral, offset)),
    api.vec.add(carPos, api.vec.scale(lateral, -offset)),
  ]
  if (goalBlocked) {
    var ahead = closestObstacle < 3 ? 10 + urgency * 6 : 7 + urgency * 5
    var midLat = 5.5 + urgency * 2
    var midAhead = 5 + urgency * 3
    options = [
      api.vec.add(carPos, api.vec.add(api.vec.scale(lateral, midLat), api.vec.scale(forward, midAhead))),
      api.vec.add(carPos, api.vec.add(api.vec.scale(lateral, -midLat), api.vec.scale(forward, midAhead))),
      api.vec.add(carPos, api.vec.add(api.vec.scale(lateral, offset), api.vec.scale(forward, ahead))),
      api.vec.add(carPos, api.vec.add(api.vec.scale(lateral, -offset), api.vec.scale(forward, ahead))),
      api.vec.add(carPos, api.vec.scale(lateral, offset)),
      api.vec.add(carPos, api.vec.scale(lateral, -offset)),
    ]
  }
  var i
  for (i = 0; i < options.length; i++) {
    var candidate = options[i]
    if (!pathClear(api, input, carPos, candidate, up)) continue
    if (!goalBlocked && !pathClear(api, input, candidate, pathGoal, up)) continue
    if (goalBlocked && Math.abs(v3x(candidate) - v3x(carPos)) < 4) continue
    if (goalBlocked && closestObstacle < 2.05) {
      var toCandClose = api.vec.projectOntoPlane(api.vec.subtract(candidate, carPos), up)
      if (api.vec.dot(toCandClose, forward) < 1.15) continue
    } else if (goalBlocked && closestObstacle < 4) {
      var toCand = api.vec.projectOntoPlane(api.vec.subtract(candidate, carPos), up)
      var ahead = api.vec.dot(toCand, forward)
      if (ahead < 2.5 && Math.abs(v3x(toCand)) > 6) continue
    }
    var toTrue = api.vec.length(api.vec.subtract(truePos, candidate))
    if (toTrue > distTrue + 14) continue
    return { candidate: candidate, deviation: 0.8, candidateDist: toTrue }
  }
  return undefined
}

function findCorrectionVector(
  api,
  input,
  carPos,
  origin,
  forward,
  distance,
  entityRotation,
  truePos,
  distTrue,
  flatToTrue,
  closestObstacle,
  pathGoal,
  goalBlocked,
) {
  var up = api.getUpVector(entityRotation)
  var urgency = obstacleUrgency(closestObstacle)
  var spread = 0.95 + urgency * 1.35
  var steps = 44
  var results = []
  var i

  var ALIGN_WEIGHT = 3.2 - urgency * 1.1
  var DEVIATION_SQ_WEIGHT = 3.4 + (1 - urgency) * 1.8
  var CLEAR_WEIGHT = 0.22 + urgency * 0.62

  for (i = 0; i <= steps; i++) {
    var angle = -spread + (2 * spread * i) / steps
    var result = evaluateVector(api, input, origin, forward, up, distance, angle)
    var flatDir = api.vec.normalize(api.vec.projectOntoPlane(result.rotation, up))
    var deviation = api.vec.angleBetween(flatDir, flatToTrue)
    var alignment = 1 - deviation / Math.PI
    var clearance = result.raycast.hit ? result.raycast.distance / distance : 1.25

    if (clearance < 0.32 && urgency < 0.95) continue

    var pushDist = distance * (0.42 + 0.28 * (1 - urgency)) + urgency * 6
    if (deviation > 0.35) pushDist += deviation * 4
    var candidate = api.vec.add(origin, api.vec.scale(api.vec.normalize(result.rotation), pushDist))
    if (!pathClear(api, input, carPos, candidate, up)) continue
    if (goalBlocked && Math.abs(v3x(candidate) - v3x(carPos)) < 4.5) continue
    if (!goalBlocked && !pathClear(api, input, candidate, pathGoal, up)) continue
    var candidateDist = api.vec.length(api.vec.subtract(truePos, candidate))

    var score =
      alignment * ALIGN_WEIGHT +
      clearance * CLEAR_WEIGHT -
      deviation * deviation * DEVIATION_SQ_WEIGHT

    if (!result.raycast.hit) score += 0.2
    if (deviation > 0.25 && urgency > 0.4) score += deviation * 0.35
    if (candidateDist > distTrue + 4) score -= 1.2
    if (candidateDist < distTrue) score += 0.25

    results.push({ score: score, candidate: candidate, deviation: deviation, candidateDist: candidateDist })
  }

  if (results.length === 0) return undefined

  results.sort(function (a, b) {
    if (Math.abs(a.score - b.score) > 0.03) return b.score - a.score
    if (Math.abs(a.deviation - b.deviation) > 0.02) return a.deviation - b.deviation
    return a.candidateDist - b.candidateDist
  })

  return results[0]
}

function evaluateVector(api, input, origin, forward, up, distance, angle) {
  var direction = api.vec.rotateAroundAxis(forward, up, angle)
  return {
    rotation: direction,
    raycast: raycastObstacle(api, input, origin, direction, distance, { visualize: false }),
  }
}
