/* @params
[
  {"key": "acceptRadius", "type": "number", "default": 9, "group": "Goal", "unit": "m", "min": 0, "description": "A waypoint / goal counts as reached inside this radius."},
  {"key": "mode", "type": "enum", "options": [{"value": "stop"}, {"value": "loop"}], "default": "stop", "group": "Goal", "description": "'stop' halts at the last waypoint, 'loop' restarts the route."},
  {"key": "speed", "type": "number", "default": 10, "group": "Goal", "unit": "m/s", "min": 0, "description": "Target speed hint published with the goal."},
  {"key": "waypoints", "type": "json", "group": "Goal", "description": "Waypoint list [[x, z], ...] in world metres."}
]
*/
// AV stack · MISSION: position-only waypoint sequencer.
// Publishes `input.target` (current waypoint) and `av.mission` {index, waypoints, isFinal} for the whole stack.
// Position-only on purpose: a pass-through waypoint must never demand a heading (the stock targetPoseInput does).
// Edit `waypoints` as [[x, z], ...] (world metres, floor plane). The last waypoint is the stop point (mode 'stop')
// or the loop restarts (mode 'loop').
// params: waypoints, acceptRadius (default 9), mode ('stop' | 'loop'), speed (target speed hint)
function transform(input, dt, params, state, api) {
  var av = input.av
  var wps = params.waypoints
  if (!av || !wps || !wps.length) return {}
  if (state.i === undefined) state.i = 0
  var radius = params.acceptRadius != null ? params.acceptRadius : 9
  var loop = params.mode === 'loop'
  var pos = input.position
  var last = wps.length - 1
  var cur = wps[state.i]
  var d = Math.sqrt((pos[0] - cur[0]) * (pos[0] - cur[0]) + (pos[2] - cur[1]) * (pos[2] - cur[1]))
  if (d < radius) {
    if (state.i < last) state.i += 1
    else if (loop) state.i = 0
    cur = wps[state.i]
  }
  input.target = {
    pose: { position: [cur[0], 0, cur[1]], rotation: [0, 0, 0] },
    speed: params.speed != null ? params.speed : 10,
  }
  av.mission = { index: state.i, waypoints: wps, isFinal: !loop && state.i === last }
  return {}
}
