function transform(input, dt, params, state, api) {
  if (!input.target || !input.target.pose || !input.target.pose.position) return {}
  api.visualizeLine(input.position, input.target.pose.position, '#ffcc00')
  return {}
}
