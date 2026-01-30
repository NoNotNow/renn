import type * as THREE from 'three'
import type { RennWorld, Entity } from '@/types/world'
import type { GameAPI } from './gameApi'
import type { LoadedEntity } from '@/loader/loadWorld'

type HookFn = (dt: number, entity: Entity, other?: Entity) => void

export class ScriptRunner {
  private world: RennWorld
  private game: GameAPI
  private getMeshById: (id: string) => THREE.Mesh | null
  private hooks: Map<string, HookFn> = new Map()
  private entityIdToScripts: Map<string, { onUpdate?: string; onCollision?: string; onSpawn?: string }> = new Map()

  constructor(
    world: RennWorld,
    game: GameAPI,
    getMeshById: (id: string) => THREE.Mesh | null,
    private entities: LoadedEntity[]
  ) {
    this.world = world
    this.game = game
    this.getMeshById = getMeshById
    this.registerScripts()
  }

  private registerScripts(): void {
    const scripts = this.world.scripts ?? {}
    for (const [id, source] of Object.entries(scripts)) {
      try {
        const fn = this.compileHook(id, source)
        this.hooks.set(id, fn)
      } catch (e) {
        console.warn(`[ScriptRunner] Failed to compile script "${id}":`, e)
      }
    }
    for (const { entity } of this.entities) {
      const s = entity.scripts
      if (s) this.entityIdToScripts.set(entity.id, s)
    }
  }

  private compileHook(scriptId: string, source: string): HookFn {
    const game = this.game
    const run = new Function('game', 'dt', 'entity', 'other', `"use strict";\n${source}`)
    return (dt: number, entity: Entity, other?: Entity) => {
      try {
        run(game, dt, entity, other)
      } catch (e) {
        console.warn(`[ScriptRunner] script "${scriptId}" error:`, e)
      }
    }
  }

  runOnSpawn(entityId: string): void {
    const scripts = this.entityIdToScripts.get(entityId)
    const scriptId = scripts?.onSpawn
    if (!scriptId) return
    const fn = this.hooks.get(scriptId)
    const entity = this.world.entities.find((e) => e.id === entityId)
    if (fn && entity) fn(0, entity)
  }

  runOnUpdate(dt: number): void {
    for (const { entity } of this.entities) {
      const scriptId = this.entityIdToScripts.get(entity.id)?.onUpdate
      if (scriptId) {
        const fn = this.hooks.get(scriptId)
        if (fn) fn(dt, entity)
      }
    }
  }

  runOnCollision(entityId: string, otherId: string): void {
    const scripts = this.entityIdToScripts.get(entityId)
    const scriptId = scripts?.onCollision
    if (!scriptId) return
    const fn = this.hooks.get(scriptId)
    const entity = this.world.entities.find((e) => e.id === entityId)
    const other = this.world.entities.find((e) => e.id === otherId)
    if (fn && entity && other) fn(0, entity, other)
  }
}
