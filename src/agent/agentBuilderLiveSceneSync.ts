import type { RennWorld } from '@/types/world'

export type AgentBuilderLiveSceneSyncFn = (
  prevWorld: RennWorld,
  nextWorld: RennWorld,
  affectedEntityIds: string[],
) => Promise<void>

let liveSceneSync: AgentBuilderLiveSceneSyncFn | null = null

export function registerAgentBuilderLiveSceneSync(fn: AgentBuilderLiveSceneSyncFn | null): void {
  liveSceneSync = fn
}

export async function runAgentBuilderLiveSceneSync(
  prevWorld: RennWorld,
  nextWorld: RennWorld,
  affectedEntityIds: string[],
): Promise<void> {
  if (!liveSceneSync) return
  await liveSceneSync(prevWorld, nextWorld, affectedEntityIds)
}
