// AV stack · SAFETY / autonomous emergency braking (independent monitor, own sensing).
// Runs after control and may only reduce throttle / add brake. Uses a smaller margin while the manoeuvre planner is driving (it already keeps swept clearance).
// debug draw: dark gold = AEB look-ahead, red = AEB triggered.
// params: aebDecel, aebMargin, aebHalfWidth
function transform(input, dt, params, state, api) {
  var av = input.av
  if (!av || !av.ego) return {}
  var e = av.ego
  if (e.speed < 0.8) {
    av.aeb = false
    return {}
  }
  var a = params.aebDecel || 7
  var margin = params.aebMargin != null ? params.aebMargin : 1.0
  if (av.mode === 'maneuver') margin = 0.2
  var hw = params.aebHalfWidth != null ? params.aebHalfWidth : 0.9
  var need = (e.speed * e.speed) / (2 * a) + margin
  var origin = api.vec.offsetAlong(input.position, e.fwd, 2.3)
  var hit = api.raycastSpread(origin, e.fwd, need + 1, hw, 5, { visualize: false })
  av.aeb = false
  var drawOn = params.debugDraw !== false
  if (drawOn) api.visualizeLine(origin, api.vec.offsetAlong(origin, e.fwd, need), '#b8860b')
  if (hit.hit && hit.distance < need) {
    if (drawOn) api.visualizeLine(origin, api.vec.offsetAlong(origin, e.fwd, hit.distance), '#ff0000')
    av.aeb = true
    input.actions.throttle = 0
    var b = Math.min(1, 0.3 + (need - hit.distance) / need)
    if (b > (input.actions.brake || 0)) input.actions.brake = b
    api.watch('av.aeb', hit.distance)
  }
  return {}
}
