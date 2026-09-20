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

const BASE_URL = import.meta.env.BASE_URL || '/'

export type InstallAgentBuilderAuthoringDeps = {
  persistence: PersistenceAPI
  loadExampleWorld: (world: RennWorld, name: string) => void
  saveProject: () => Promise<boolean>
  saveProjectAs: (name: string) => Promise<boolean>
  updateWorld: (updater: (prev: RennWorld) => RennWorld) => void
  getCurrentProjectName: () => string
}

export function installAgentBuilderAuthoring(deps: InstallAgentBuilderAuthoringDeps): void {
  if (!import.meta.env.DEV) return

  const actions: AgentBuilderAuthoringActions = {
    async loadExampleWorldById(exampleWorldId: string) {
      const trimmed = exampleWorldId.trim()
      if (!trimmed) throw new Error('exampleWorldId is required')
      const res = await fetch(`${BASE_URL}exampleWorlds/${encodeURIComponent(trimmed)}/world.json`)
      if (!res.ok) {
        throw new Error(`Example world not found: ${trimmed}`)
      }
      const world = (await res.json()) as RennWorld
      deps.loadExampleWorld(world, trimmed)
      return { loaded: true, exampleWorldId: trimmed }
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
  }

  registerAgentBuilderAuthoring(actions)
}

export function uninstallAgentBuilderAuthoring(): void {
  if (!import.meta.env.DEV) return
  registerAgentBuilderAuthoring(null)
}
