// AV stack · SAFETY / autonomous emergency braking (independent monitor, own sensing).
// Runs after control and may only reduce throttle / add brake. Uses a smaller margin while the manoeuvre planner is driving (it already keeps swept clearance).
// Brakes with a deceleration (aebDecel), turned into a command with the actuator model the longitudinal stage identified
// (av.actuator {G, D}): a raw brake value means 360 m/s² on a light, powerful car and flips its speed within a frame.
// Footprint from av.vehicle (look-ahead starts at the nose, spread covers the body width).
// debug draw: dark gold = AEB look-ahead, red = AEB triggered.
// params: aebDecel, aebMargin, aebHalfWidth
function transform(input, dt, params, state, api) {
  var av = input.av
  if (av && av.cfg) params = av.cfg // preset-expanded params published by av-ego
  if (!av || !av.ego) return {}
  var e = av.ego
  if (e.speed < 0.8) {
    av.aeb = false
    return {}
  }
  var a = params.aebDecel || 7
  var margin = params.aebMargin != null ? params.aebMargin : 1.0
  if (av.mode === 'maneuver') margin = 0.2
  var len = (av.vehicle && av.vehicle.length) || params.vehicleLength || 4
  var wid = (av.vehicle && av.vehicle.width) || params.vehicleWidth || 2
  var hw = params.aebHalfWidth != null ? params.aebHalfWidth : Math.max(0.9, wid / 2 - 0.1)
  var need = (e.speed * e.speed) / (2 * a) + margin
  var origin = api.vec.offsetAlong(input.position, e.fwd, len / 2 + 0.3)
  var dirA = e.fwd
  // style 'escape' while manoeuvring: the plan curves, a straight ray into the wall the arc turns away from would brake a collision-free manoeuvre (nose 1.5 m from a cylinder, turning away at 5 m/s):
  // look along the chord of the commanded arc instead
  if (params.style === 'escape' && av.mode === 'maneuver' && av.plan && av.plan.kappa) {
    var ang = (av.plan.kappa * (need + len / 2)) / 2
    var ca = Math.cos(ang)
    var sa = Math.sin(ang)
    dirA = [e.fwd[0] * ca + e.left[0] * sa, e.fwd[1] * ca + e.left[1] * sa, e.fwd[2] * ca + e.left[2] * sa]
  }
  var hit = api.raycastSpread(origin, dirA, need + 1, hw, 5, { visualize: false })
  av.aeb = false
  var drawOn = params.debugDraw !== false
  if (drawOn) api.visualizeLine(origin, api.vec.offsetAlong(origin, e.fwd, need), '#b8860b')
  if (hit.hit && hit.distance < need) {
    if (drawOn) api.visualizeLine(origin, api.vec.offsetAlong(origin, e.fwd, hit.distance), '#ff0000')
    av.aeb = true
    // deceleration needed to stop before the hit (at least aebDecel), never more than stops the car within this frame
    var room = Math.max(0.1, hit.distance - 0.2 * margin)
    var dec = Math.max(a, (e.speed * e.speed) / (2 * room))
    dec = Math.min(dec, e.speed / Math.max(dt, 1e-3))
    var act = av.actuator
    var u
    if (act && act.G > 0) u = (-dec + act.D) / act.G
    else u = -Math.min(1, 0.3 + (need - hit.distance) / need)
    var cur = (input.actions.throttle || 0) - (input.actions.brake || 0)
    if (u < cur) {
      input.actions.throttle = u > 0 ? u : 0
      input.actions.brake = u < 0 ? Math.min(1, -u) : 0
      // tell the longitudinal controller what was really applied (its actuator identification)
      if (act) act.u = input.actions.throttle - input.actions.brake
    }
    api.watch('av.aeb', Math.round(hit.distance * 10) / 10 + ' m dec ' + dec.toFixed(1))
  }
  return {}
}
