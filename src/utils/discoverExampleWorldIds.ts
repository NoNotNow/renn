/**
 * Example world ids under public/exampleWorlds/ (build-time discovery).
 */

const exampleWorldJsonGlob = import.meta.glob('../../public/exampleWorlds/*/world.json')

export function discoverExampleWorldIdsFromBuild(): string[] {
  const ids = Object.keys(exampleWorldJsonGlob)
    .map((key) => {
      const match = key.match(/exampleWorlds\/([^/]+)\/world\.json$/)
      return match?.[1] ?? null
    })
    .filter((id): id is string => Boolean(id))
  return [...new Set(ids)].sort()
}
