/**
 * Register Builder authoring actions for MCP browser attach (dev-only).
 */

import type { PersistenceAPI } from '@/persistence/types'
import type { RennWorld } from '@/types/world'
import {
  entityMaterialColorFromWorld,
  registerAgentBuilderAuthoring,
  type AgentBuilderAuthoringActions,
} from '@/agent/agentBuilderAuthoringRegistry'
import type { Rgba01 } from '@/agent/agentMaterialColorParse'
import {
  applyLogicVerificationWorldPatch,
  type LogicVerificationWorldPatch,
} from '@/agent/applyLogicVerificationWorldPatch'
import { loadExampleWorldFromPublicBase } from '@/utils/loadExampleWorldFromPublicBase'
import { agentDevExampleWorldImportApiPath } from '@/agent/agentDevBootstrapParams'
import { resolveBrowserDevToken } from '@/agent/logicVerificationBrowserAttachClient'

const BASE_URL = import.meta.env.BASE_URL || '/'

export type InstallAgentBuilderAuthoringDeps = {
  persistence: PersistenceAPI
  loadExampleWorld: (world: RennWorld, name: string, assets?: Map<string, Blob>) => void
  loadProject: (id: string) => Promise<boolean>
  saveProject: () => Promise<boolean>
  saveProjectAs: (name: string) => Promise<boolean>
  updateWorld: (updater: (prev: RennWorld) => RennWorld) => void
  getCurrentProjectName: () => string
  getCurrentWorld: () => RennWorld
}

export function installAgentBuilderAuthoring(deps: InstallAgentBuilderAuthoringDeps): void {
  if (!import.meta.env.DEV) return

  const actions: AgentBuilderAuthoringActions = {
    async loadExampleWorldById(exampleWorldId: string) {
      const trimmed = exampleWorldId.trim()
      if (!trimmed) throw new Error('exampleWorldId is required')
      const { world, assets } = await loadExampleWorldFromPublicBase(BASE_URL, trimmed)
      deps.loadExampleWorld(world, trimmed, assets)
      return { loaded: true, exampleWorldId: trimmed }
    },
    async loadSavedProjectByName(projectName: string) {
      const trimmed = projectName.trim()
      if (!trimmed) throw new Error('projectName is required')
      const projects = await deps.persistence.listProjects()
      const meta = projects.find((p) => p.name === trimmed)
      if (!meta) throw new Error(`Project not found: ${trimmed}`)
      const ok = await deps.loadProject(meta.id)
      if (!ok) throw new Error(`Failed to load project: ${trimmed}`)
      return { loaded: true, projectId: meta.id, projectName: trimmed }
    },
    async saveProjectAs(projectName: string) {
      const trimmed = projectName.trim()
      if (!trimmed) throw new Error('projectName is required')
      const ok = await deps.saveProjectAs(trimmed)
      if (!ok) throw new Error('Save As failed')
      const projects = await deps.persistence.listProjects()
      const meta = projects.find((p) => p.name === trimmed)
      if (!meta) throw new Error('Saved project metadata missing')
      return { saved: true, projectId: meta.id, projectName: trimmed }
    },
    async saveProject() {
      const name = deps.getCurrentProjectName()
      const ok = await deps.saveProject()
      if (!ok) throw new Error('Save failed')
      const projects = await deps.persistence.listProjects()
      const meta = projects.find((p) => p.name === name)
      return { saved: true, projectId: meta?.id ?? null, projectName: name }
    },
    async patchEntityMaterialColor(entityId: string, color: Rgba01) {
      const trimmed = entityId.trim()
      if (!trimmed) throw new Error('entityId is required')
      deps.updateWorld((prev) => {
        let found = false
        const entities = prev.entities.map((entity) => {
          if (entity.id !== trimmed) return entity
          found = true
          return {
            ...entity,
            material: {
              ...entity.material,
              color: [color[0], color[1], color[2], color[3]] as [
                number,
                number,
                number,
                number,
              ],
            },
          }
        })
        if (!found) throw new Error(`Entity not found: ${trimmed}`)
        return { ...prev, entities }
      })
      return { patched: true, entityId: trimmed, color }
    },
    async getSavedEntityMaterialColor(projectName: string, entityId: string) {
      const name = projectName.trim()
      const eid = entityId.trim()
      if (!name || !eid) throw new Error('projectName and entityId are required')
      const projects = await deps.persistence.listProjects()
      const meta = projects.find((p) => p.name === name)
      if (!meta) return { color: null }
      const loaded = await deps.persistence.loadProject(meta.id)
      return { color: entityMaterialColorFromWorld(loaded.world, eid) }
    },
    async getSavedProjectWorld(projectName: string) {
      const trimmed = projectName.trim()
      if (!trimmed) throw new Error('projectName is required')
      const projects = await deps.persistence.listProjects()
      const meta = projects.find((p) => p.name === trimmed)
      if (!meta) throw new Error(`Project not found: ${trimmed}`)
      const loaded = await deps.persistence.loadProject(meta.id)
      return loaded.world
    },
    async exportSavedProjectToExampleWorld(input) {
      const projectName = input.projectName.trim()
      const exampleWorldId = input.exampleWorldId.trim()
      if (!projectName || !exampleWorldId) {
        throw new Error('projectName and exampleWorldId are required')
      }
      const projects = await deps.persistence.listProjects()
      const meta = projects.find((p) => p.name === projectName)
      if (!meta) throw new Error(`Project not found: ${projectName}`)
      const zipBlob = await deps.persistence.exportProject(meta.id)
      const zipBytes = new Uint8Array(await zipBlob.arrayBuffer())
      const devToken = resolveBrowserDevToken(undefined)
      const importPath = agentDevExampleWorldImportApiPath(exampleWorldId)
      const res = await fetch(importPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          'X-Renn-Mcp-Dev-Token': devToken,
        },
        body: zipBytes,
      })
      const body = (await res.json()) as {
        error?: string
        exampleWorldId?: string
        folderPath?: string
        assetFileCount?: number
      }
      if (!res.ok) {
        throw new Error(body.error ?? `Example world import failed (${res.status})`)
      }
      return {
        exported: true as const,
        projectName,
        exampleWorldId: body.exampleWorldId ?? exampleWorldId,
        assetFileCount: body.assetFileCount ?? 0,
        folderPath: body.folderPath ?? '',
      }
    },
    getCurrentWorld: () => deps.getCurrentWorld(),
    applyLogicVerificationWorldPatchToDocument(patch: LogicVerificationWorldPatch) {
      const prev = deps.getCurrentWorld()
      const result = applyLogicVerificationWorldPatch(prev, patch)
      if (!result.ok) return result
      deps.updateWorld(() => result.nextWorld)
      return {
        ok: true as const,
        affectedEntityIds: result.affectedEntityIds,
        prevWorld: prev,
        nextWorld: result.nextWorld,
      }
    },
  }

  registerAgentBuilderAuthoring(actions)
}

export function uninstallAgentBuilderAuthoring(): void {
  if (!import.meta.env.DEV) return
  registerAgentBuilderAuthoring(null)
}
