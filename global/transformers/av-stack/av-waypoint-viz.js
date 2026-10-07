// AV stack · SENSE / mission overlay (debug only, no effect on driving).
// Draws the whole mission route: mint polyline + poles at every waypoint; the active target pole is yellow.
// Reads av.mission.waypoints (av-mission stage) or params.waypoints [[x, z], ...].
// params: waypoints, debugDraw
function transform(input, dt, params, state, api) {
  if (params.debugDraw === false) return {}
  var av = input.av
  var wps = (av && av.mission && av.mission.waypoints) || params.waypoints
  if (!wps || !wps.length) return {}
  var y = input.position[1]
  var cur = input.target && input.target.pose && input.target.pose.position
  for (var i = 0; i < wps.length; i++) {
    var w = wps[i]
    var active = cur && Math.abs(cur[0] - w[0]) < 0.05 && Math.abs(cur[2] - w[1]) < 0.05
    api.visualizeLine([w[0], y - 0.5, w[1]], [w[0], y + 5, w[1]], active ? '#ffcc00' : '#00ffcc')
    if (i > 0) api.visualizeLine([wps[i - 1][0], y - 0.4, wps[i - 1][1]], [w[0], y - 0.4, w[1]], '#7dffb0')
  }
  return {}
}
