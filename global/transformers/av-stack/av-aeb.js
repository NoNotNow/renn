/* @params
[
  {"key": "aebDecel", "type": "number", "default": 7, "label": "AEB braking deceleration", "group": "Safety", "unit": "m/s²", "min": 0, "description": "Deceleration the AEB brakes with."},
  {"key": "aebMargin", "type": "number", "default": 1.0, "label": "AEB extra stopping margin", "group": "Safety", "unit": "m", "min": 0, "description": "Extra stopping distance kept by the AEB."},
  {"key": "aebHalfWidth", "type": "number", "label": "AEB look-ahead half width", "group": "Safety", "unit": "m", "description": "Half width of the AEB look-ahead strip (default derives from the vehicle width).", "advanced": true},
  {"key": "debugDraw", "type": "boolean", "default": true, "label": "Draw debug vectors", "group": "Debug", "description": "Draw debug vectors (visible in the Builder visualize mode).", "advanced": true},
  {"key": "style", "type": "enum", "options": [{"value": "comfort"}, {"value": "escape"}], "default": "comfort", "group": "Safety", "description": "'escape' = manoeuvres / reversing as fast as the plan can be stopped; 'comfort' = gentle.", "advanced": true},
  {"key": "vehicleLength", "type": "number", "default": 4, "label": "Vehicle length", "group": "Vehicle", "unit": "m", "min": 0, "description": "Body length used for clearance; the box collider can only enlarge it.", "advanced": true},
  {"key": "vehicleWidth", "type": "number", "default": 2, "label": "Vehicle width", "group": "Vehicle", "unit": "m", "min": 0, "description": "Body width used for clearance; the box collider can only enlarge it.", "advanced": true},
  {"key": "aebMinSpeed", "type": "number", "default": 0.8, "label": "AEB arming speed", "group": "Safety", "unit": "m/s", "min": 0, "description": "Speed below which the AEB does not act (unless manual override).", "advanced": true},
  {"key": "aebManeuverMargin", "type": "number", "default": 0.2, "label": "AEB manoeuvre margin", "group": "Safety", "unit": "m", "min": 0, "description": "Braking margin while the manoeuvre planner is driving.", "advanced": true}
]
*/
// AV stack · SAFETY / autonomous emergency braking (independent monitor, own sensing).
// Runs after control and may only reduce throttle / add brake. Uses a smaller margin while the manoeuvre planner is driving (it already keeps swept clearance).
// Brakes with a deceleration (aebDecel), turned into a command with the actuator model the longitudinal stage identified
// (av.actuator {G, D}): a raw brake value means 360 m/s² on a light, powerful car and flips its speed within a frame.
// Footprint from av.vehicle (look-ahead starts at the nose, spread covers the body width).
// debug draw: dark gold = AEB look-ahead, red = AEB triggered.
// Manual keyboard override (av.manual, av-ego): the AEB deliberately does NOT yield; it also brakes against the user's throttle (only ever lowers throttle / adds brake, never steers).
// params: aebDecel, aebMargin, aebHalfWidth
function transform(input, dt, params, state, api) {
  var av = input.av
  // av-ego's preset table (params.preset) under this stage's own params (binding / scope / stage params win); cached while both are the same objects
  if (av && (av.preset || av.profile)) params = state.pmP === params && state.pmB === av.preset && state.pmO === av.profile ? state.pm : ((state.pmP = params), (state.pmB = av.preset), (state.pmO = av.profile), (state.pm = Object.assign({}, av.preset, params, av.profile)))
  if (!av || !av.ego) return {}
  var e = av.ego
  // neural reverse (av-neural, dir 'rev'): the net drives backwards -> probe from the REAR along -fwd with the backward speed; the pedal command is a signed force (u = throttle - brake), so stopping a backward-moving car needs u > 0
  var rev = !!(av.neural && av.neural.on && av.neural.dir === 'rev')
  var spd = rev ? -e.speed : e.speed
  // (manual override: a standing car must not be pushed into an obstacle by a held throttle either, so the low-speed exemption does not apply)
  if (spd < (params.aebMinSpeed != null ? params.aebMinSpeed : 0.8) && !av.manual) {
    av.aeb = false
    return {}
  }
  var a = params.aebDecel || 7
  var margin = params.aebMargin != null ? params.aebMargin : 1.0
  if (av.mode === 'maneuver') margin = params.aebManeuverMargin != null ? params.aebManeuverMargin : 0.2
  var len = (av.vehicle && av.vehicle.length) || params.vehicleLength || 4
  var wid = (av.vehicle && av.vehicle.width) || params.vehicleWidth || 2
  var hw = params.aebHalfWidth != null ? params.aebHalfWidth : Math.max(0.9, wid / 2 - 0.1)
  var need = (spd * spd) / (2 * a) + margin
  var origin = api.vec.offsetAlong(input.position, e.fwd, rev ? -(len / 2 + 0.3) : len / 2 + 0.3)
  var dirA = rev ? [-e.fwd[0], -e.fwd[1], -e.fwd[2]] : e.fwd
  // style 'escape' while manoeuvring: the plan curves, a straight ray into the wall the arc turns away from would brake a collision-free manoeuvre (nose 1.5 m from a cylinder, turning away at 5 m/s):
  // look along the chord of the commanded arc instead
  if (!rev && params.style === 'escape' && av.mode === 'maneuver' && av.plan && av.plan.kappa) {
    var ang = (av.plan.kappa * (need + len / 2)) / 2
    var ca = Math.cos(ang)
    var sa = Math.sin(ang)
    dirA = [e.fwd[0] * ca + e.left[0] * sa, e.fwd[1] * ca + e.left[1] * sa, e.fwd[2] * ca + e.left[2] * sa]
  }
  var hit = api.raycastSpread(origin, dirA, need + 1, hw, 5, { visualize: false })
  av.aeb = false
  var drawOn = params.debugDraw !== false
  if (drawOn) api.visualizeLine(origin, api.vec.offsetAlong(origin, dirA, need), '#b8860b')
  if (hit.hit && hit.distance < need) {
    if (drawOn) api.visualizeLine(origin, api.vec.offsetAlong(origin, dirA, hit.distance), '#ff0000')
    av.aeb = true
    // deceleration needed to stop before the hit (at least aebDecel), never more than stops the car within this frame
    var room = Math.max(0.1, hit.distance - 0.2 * margin)
    var dec = Math.max(a, (spd * spd) / (2 * room))
    dec = Math.min(dec, spd / Math.max(dt, 1e-3))
    var act = av.actuator
    var u
    if (rev) {
      // reversing: friction opposes the (backward) motion, so the stopping command is positive (throttle), u = (dec - D) / G
      if (act && act.G > 0) u = Math.max(0, Math.min(1, (dec - act.D) / act.G))
      else u = Math.min(1, 0.3 + (need - hit.distance) / need)
    } else if (act && act.G > 0) u = (-dec + act.D) / act.G
    else u = -Math.min(1, 0.3 + (need - hit.distance) / need)
    var cur = (input.actions.throttle || 0) - (input.actions.brake || 0)
    if (rev ? u > cur : u < cur) {
      input.actions.throttle = u > 0 ? u : 0
      input.actions.brake = u < 0 ? Math.min(1, -u) : 0
      // tell the longitudinal controller what was really applied (its actuator identification)
      if (act) act.u = input.actions.throttle - input.actions.brake
    }
    api.watch('av.aeb', Math.round(hit.distance * 10) / 10 + ' m dec ' + dec.toFixed(1))
  }
  return {}
}
