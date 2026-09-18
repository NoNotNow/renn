/**
 * Explorer-style shift-click range selection over a visible entity id list.
 */
export function sliceEntityIdsInRange(
  order: readonly string[],
  anchorId: string,
  targetId: string,
): string[] {
  const bi = order.indexOf(targetId)
  if (bi < 0) return [targetId]
  let ai = order.indexOf(anchorId)
  if (ai < 0) ai = bi
  const lo = Math.min(ai, bi)
  const hi = Math.max(ai, bi)
  return order.slice(lo, hi + 1) as string[]
}
