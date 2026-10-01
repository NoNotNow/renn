function transform(input, dt, params, state, api) {
  if (params && params.id) return {}
  if (input.actions && input.actions._obstacle_escape) return {}
  if (input.actions && input.actions._uml_maneuver) return {}
  if (input.target && input.target.distance && input.target.distance < 10) return {}
  var forward = api.getForwardVector(input.rotation)
  var backward = api.vec.scale(forward, -1)
  var speed = api.vec.getForwardSpeed(input.velocity, forward)
  var frontPosition = api.vec.offsetAlong(input.position, forward, 5)
  var backdPosition = api.vec.offsetAlong(input.position, backward, 5)
  if (speed > 0) {
    var castResult = api.raycastSpread(frontPosition, forward, speed * speed / 300, 2, 8, { visualize: false })
    if (castResult.hit === true && speed > 0.1) {
      var breakSpeed = 1 / (castResult.distance + 1) * ((speed * speed) / 200)
      if (breakSpeed > 1) breakSpeed = 1
      input.actions.brake = breakSpeed
      input.actions.throttle = 0
    }
  } else {
    var castResult = api.raycastSpread(backdPosition, backward, speed * speed / 300, 2, 8, { visualize: false })
    if (castResult.hit === true && speed < -0.1) {
      var breakSpeed = 1 / (castResult.distance + 1) * ((speed * speed) / 200)
      if (breakSpeed > 1) breakSpeed = 1
      input.actions.brake = 0
      input.actions.throttle = breakSpeed
    }
  }
  return {}
}
