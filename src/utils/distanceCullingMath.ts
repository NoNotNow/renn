/**
 * Squared-distance culling test (no sqrt). Shared by the frame loop and unit tests.
 *
 * Hard max distance: objects beyond `maxDistance` are culled **unless** their
 * characteristic `worldSize` is greater than camera distance (so large objects
 * near or surrounding the camera are not dropped by the hard cap alone).
 *
 * Size ratio: culled when `worldSize / distance < minSizeDistanceRatio` (squared form).
 */
export function distanceCullingShouldCull(
  distSq: number,
  worldSize: number,
  maxDistance: number,
  minSizeDistanceRatio: number
): boolean {
  const maxDistanceSq = maxDistance * maxDistance
  const minRatioSq = minSizeDistanceRatio * minSizeDistanceRatio
  const worldSizeSq = worldSize * worldSize
  const sizeBeyondDistance = worldSizeSq > distSq
  const tooFar = distSq > maxDistanceSq && !sizeBeyondDistance
  const ratioTooSmall = distSq > 0 && worldSizeSq < minRatioSq * distSq
  return tooFar || ratioTooSmall
}
