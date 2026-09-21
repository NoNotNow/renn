/**
 * Dev-only: Builder project actions for MCP browser attach (registered from ProjectContext).
 */

import type { RennWorld } from '@/types/world'
import type { Rgba01 } from '@/agent/agentMaterialColorParse'
import type { ApplyLogicVerificationWorldPatchHostResult } from '@/agent/applyLogicVerificationWorldPatch'
import type { LogicVerificationWorldPatch } from '@/agent/applyLogicVerificationWorldPatch'

export type ApplyLogicVerificationWorldPatchToDocumentResult =
  | (ApplyLogicVerificationWorldPatchHostResult & {
      prevWorld?: RennWorld
      nextWorld?: RennWorld
    })
  | { ok: false; message: string; requiresSceneRebuild?: boolean }

export type AgentBuilderAuthoringActions = {
  loadExampleWorldById: (exampleWorldId: string) => Promise<{ loaded: true; exampleWorldId: string }>
  loadSavedProjectByName: (
    projectName: string,
  ) => Promise<{ loaded: true; projectId: string; projectName: string }>
  saveProjectAs: (projectName: string) => Promise<{ saved: true; projectId: string; projectName: string }>
  saveProject: () => Promise<{ saved: true; projectId: string | null; projectName: string }>
  patchEntityMaterialColor: (
    entityId: string,
    color: Rgba01,
  ) => Promise<{ patched: true; entityId: string; color: Rgba01 }>
  getSavedEntityMaterialColor: (
    projectName: string,
    entityId: string,
  ) => Promise<{ color: Rgba01 | null }>
  getSavedProjectWorld: (projectName: string) => Promise<RennWorld>
  exportSavedProjectToExampleWorld: (input: {
    projectName: string
    exampleWorldId: string
  }) => Promise<{
    exported: true
    projectName: string
    exampleWorldId: string
    assetFileCount: number
    folderPath: string
  }>
  getCurrentWorld: () => RennWorld
  applyLogicVerificationWorldPatchToDocument: (
    patch: LogicVerificationWorldPatch,
  ) => ApplyLogicVerificationWorldPatchToDocumentResult
}

let activeActions: AgentBuilderAuthoringActions | null = null

export function registerAgentBuilderAuthoring(actions: AgentBuilderAuthoringActions | null): void {
  activeActions = actions
}

export function requireAgentBuilderAuthoring(): AgentBuilderAuthoringActions {
  if (!activeActions) {
    throw new Error('Builder authoring bridge not ready — open Builder (dev) and wait for project load')
  }
  return activeActions
}

export function entityMaterialColorFromWorld(world: RennWorld, entityId: string): Rgba01 | null {
  const entity = world.entities.find((e) => e.id === entityId)
  const color = entity?.material?.color
  if (!color || color.length < 3) return null
  const a = color.length >= 4 ? (color[3] ?? 1) : 1
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, a]
}
