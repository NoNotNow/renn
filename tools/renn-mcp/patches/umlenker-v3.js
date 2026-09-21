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

function resolveTrueFollow(input, params, api) {
  if (typeof params.id === 'string' && params.id.length > 0) {
    var live = api.getWorldPosition(params.id)
    if (live) return { position: live, id: params.id }
  }
  if (input.target && input.target.pose && input.target.pose.position) {
    var tid =
      typeof input.target.id === 'string' && input.target.id.length > 0 ? input.target.id : null
    return { position: input.target.pose.position, id: tid }
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

  var follow = resolveTrueFollow(input, params, api)
  if (!follow) return {}

  var truePos = follow.position
  var toTrue = api.vec.subtract(truePos, input.position)
  var distTrue = api.vec.length(toTrue)
  input.target.distance = distTrue
  input.target.pose.position = truePos
  if (follow.id) input.target.id = follow.id

  if (distTrue < 5) {
    maneuver.reset()
    return
  }

  var up = api.getUpVector(input.rotation)
  var forward = api.getForwardVector(input.rotation)
  forward = api.vec.normalize(api.vec.projectOntoPlane(forward, up))
  var flatToTrue = api.vec.normalize(api.vec.projectOntoPlane(toTrue, up))
  var frontPosition = api.vec.offsetAlong(input.position, forward, 5)

  if (maneuver.isOn() && maneuver.vector) {
    if (api.vec.length(api.vec.subtract(maneuver.vector, input.position)) < 4) {
      maneuver.reset()
    } else if (api.vec.length(api.vec.subtract(truePos, maneuver.vector)) > distTrue + 10) {
      maneuver.reset()
    }
  }

  if (maneuver.isOn() && maneuver.vector) {
    var checkDist = Math.min(16, Math.max(8, distTrue))
    var frontClear = api.raycastSpread(frontPosition, forward, checkDist, 2, 8, { visualize: false })
    if (!frontClear.hit && api.vec.angleBetween(forward, flatToTrue) < 0.45) {
      maneuver.reset()
    } else {
      input.target.pose.position = maneuver.vector
      return
    }
  }

  var lookahead = distTrue - 6
  if (lookahead < 10) lookahead = 10
  if (lookahead > 22) lookahead = 22

  var frontHit = api.raycastSpread(frontPosition, forward, lookahead, 2, 10, { visualize: false })
  if (!frontHit.hit) return {}

  var picked = findCorrectionVector(
    api,
    frontPosition,
    forward,
    lookahead,
    input.rotation,
    truePos,
    distTrue,
    flatToTrue,
    frontHit.distance,
  )
  if (!picked) return {}

  input.target.pose.position = picked.candidate
  maneuver.trigger(picked.candidate, maneuverLockMs(picked.deviation, obstacleUrgency(frontHit.distance)))
  return {}
}

function findCorrectionVector(api, origin, forward, distance, entityRotation, truePos, distTrue, flatToTrue, closestObstacle) {
  var up = api.getUpVector(entityRotation)
  var urgency = obstacleUrgency(closestObstacle)
  var spread = 0.75 + urgency * 0.95
  var steps = 40
  var results = []
  var i

  var ALIGN_WEIGHT = 3.6 - urgency * 0.85
  var DEVIATION_SQ_WEIGHT = 3.4 + (1 - urgency) * 2.6
  var CLEAR_WEIGHT = 0.18 + urgency * 0.52

  for (i = 0; i <= steps; i++) {
    var angle = -spread + (2 * spread * i) / steps
    var result = evaluateVector(api, origin, forward, up, distance, angle)
    var flatDir = api.vec.normalize(api.vec.projectOntoPlane(result.rotation, up))
    var deviation = api.vec.angleBetween(flatDir, flatToTrue)
    var alignment = 1 - deviation / Math.PI
    var clearance = result.raycast.hit ? result.raycast.distance / distance : 1.25

    if (clearance < 0.28 && urgency < 0.92) continue

    var pushDist = distance * (0.5 + 0.35 * (1 - urgency)) + urgency * 4
    var candidate = api.vec.add(origin, api.vec.scale(api.vec.normalize(result.rotation), pushDist))
    var candidateDist = api.vec.length(api.vec.subtract(truePos, candidate))

    var score =
      alignment * ALIGN_WEIGHT +
      clearance * CLEAR_WEIGHT -
      deviation * deviation * DEVIATION_SQ_WEIGHT

    if (!result.raycast.hit) score += 0.15
    if (candidateDist > distTrue + 4) score -= 1.5
    if (candidateDist < distTrue) score += 0.2

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

function evaluateVector(api, origin, forward, up, distance, angle) {
  var direction = api.vec.rotateAroundAxis(forward, up, angle)
  return {
    rotation: direction,
    raycast: api.raycastSpread(origin, direction, distance, 2, 10, { visualize: false }),
  }
}
