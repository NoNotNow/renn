// AV stack · SENSE / state estimation ("localization" layer).
// Publishes the ego state on the shared blackboard `input.av.ego` for all later stages.
// Also publishes av.vehicle {width, length} = max(params, own box collider) used by all planners.
// debug draw (params.debugDraw, default true): cyan = velocity vector.
// Owns the simulated clock (state.t) so no downstream stage needs a wall clock.
function transform(input, dt, params, state, api) {
  // fresh blackboard every frame (the input object is reused by the runtime)
  var av = (input.av = {})
  // a goal source running in front of this stage hands its mission over via input.goalSource (see av-wander.js)
  if (input.goalSource) {
    av.mission = input.goalSource
    input.goalSource = undefined
  }
  // Goal contract: a source that declares `input.target.isFinal === false` (preset wanderer, ...) makes the stack cruise
  // through its goals instead of braking at each one. (Sources without that flag are single, final goals.)
  if (!av.mission && input.target && input.target.pose && input.target.isFinal === false) {
    var tp = input.target.pose.position
    av.mission = { index: 0, waypoints: [[tp[0], tp[2]]], isFinal: false }
  }
  if (state.t === undefined) {
    state.t = 0
    state.speedF = 0
    state.prevSpeed = 0
    state.accelF = 0
  }
  state.t += dt
  // Vehicle footprint: never plan with a hull smaller than the entity's own box collider (a 4 x 8 m body driven with the
  // 2 x 4 defaults touches every neighbour). params.vehicleWidth / vehicleLength can only enlarge it. Cached (getEntity copies).
  if (state.vehT === undefined || state.t - state.vehT > 2) {
    state.vehT = state.t
    var ent = api.getEntity(input.entityId)
    var sh = ent && ent.shape
    var sc = (ent && ent.scale) || [1, 1, 1]
    state.vehW = sh && sh.type === 'box' ? Math.abs(sh.width * (sc[0] || 1)) : 0
    state.vehL = sh && sh.type === 'box' ? Math.abs(sh.depth * (sc[2] || 1)) : 0
  }
  av.vehicle = {
    width: Math.max(params.vehicleWidth || 2, state.vehW || 0),
    length: Math.max(params.vehicleLength || 4, state.vehL || 0),
  }
  var up = api.getUpVector(input.rotation)
  var fwd = api.vec.normalize(api.vec.projectOntoPlane(api.getForwardVector(input.rotation), up))
  var left = api.vec.normalize(api.vec.cross(up, fwd))
  var speed = api.vec.getForwardSpeed(input.velocity, fwd)
  var yawRate = api.vec.dot(input.angularVelocity, up)
  var a = dt > 1e-6 ? (speed - state.prevSpeed) / dt : 0
  state.prevSpeed = speed
  state.accelF += (a - state.accelF) * Math.min(1, dt * 8)
  state.speedF += (speed - state.speedF) * Math.min(1, dt * 20)
  av.ego = {
    t: state.t,
    dt: dt,
    pos: input.position,
    fwd: fwd,
    left: left,
    up: up,
    speed: speed,
    speedF: state.speedF,
    accel: state.accelF,
    yawRate: yawRate,
    kappa: Math.abs(speed) > 1.5 ? yawRate / speed : 0,
  }
  api.watch('av.speed', Math.round(speed * 10) / 10)
  if (params.debugDraw !== false) {
    // cyan: velocity vector
    api.visualizeLine(input.position, api.vec.add(input.position, api.vec.scale(input.velocity, 0.6)), '#00e5ff')
  }
  return {}
}
