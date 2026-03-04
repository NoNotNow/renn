import type * as THREE from 'three'
import type { RennWorld, Entity, ScriptDef } from '@/types/world'
import type { GameAPI } from './gameApi'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { ScriptCtx, OnSpawnCtx, OnUpdateCtx, OnCollisionCtx, OnTimerCtx } from './scriptCtx'
import {
  allocOnSpawnCtx,
  allocOnUpdateCtx,
  allocOnCollisionCtx,
  allocOnTimerCtx,
} from './scriptCtx'

type HookFn = (ctx: ScriptCtx) => void

interface OnUpdateEntry {
  fn: HookFn
  ctx: OnUpdateCtx
}

interface OnTimerEntry {
  fn: HookFn
  ctx: OnTimerCtx
  interval: number
  elapsed: number
}

export class ScriptRunner {
  private game: GameAPI
  private getMeshById: (id: string) => THREE.Mesh | null
  private hooks: Map<string, HookFn> = new Map()
  private entityMap: Map<string, Entity> = new Map()
  private onUpdateEntries: OnUpdateEntry[] = []
  private onTimerEntries: OnTimerEntry[] = []
  private onCollisionHooks: Map<string, Array<{ fn: HookFn; ctx: OnCollisionCtx }>> = new Map()
  private onSpawnHooks: Map<string, Array<{ fn: HookFn; ctx: OnSpawnCtx }>> = new Map()

  constructor(
    world: RennWorld,
    game: GameAPI,
    getMeshById: (id: string) => THREE.Mesh | null,
    private entities: LoadedEntity[]
  ) {
    this.game = game
    this.getMeshById = getMeshById
    for (const { entity } of this.entities) {
      this.entityMap.set(entity.id, entity)
    }
    this.registerScripts(world)
  }

  private registerScripts(world: RennWorld): void {
    const scripts = world.scripts ?? {}
    for (const [id, def] of Object.entries(scripts)) {
      const source = typeof def === 'string' ? def : def.source
      try {
        const fn = this.compileHook(id, source)
        this.hooks.set(id, fn)
      } catch (e) {
        console.warn(`[ScriptRunner] Failed to compile script "${id}":`, e)
      }
    }
    for (const { entity } of this.entities) {
      const scriptIds = entity.scripts
      if (!scriptIds || !Array.isArray(scriptIds)) continue
      for (const scriptId of scriptIds) {
        const def = scripts[scriptId]
        if (!def || typeof def === 'string') continue
        const fn = this.hooks.get(scriptId)
        if (!fn) continue
        switch (def.event) {
          case 'onSpawn': {
            const list = this.onSpawnHooks.get(entity.id) ?? []
            list.push({ fn, ctx: allocOnSpawnCtx(this.game, entity) })
            this.onSpawnHooks.set(entity.id, list)
            break
          }
          case 'onUpdate': {
            this.onUpdateEntries.push({
              fn,
              ctx: allocOnUpdateCtx(this.game, entity),
            })
            break
          }
          case 'onCollision': {
            const list = this.onCollisionHooks.get(entity.id) ?? []
            list.push({ fn, ctx: allocOnCollisionCtx(this.game, entity) })
            this.onCollisionHooks.set(entity.id, list)
            break
          }
          case 'onTimer': {
            this.onTimerEntries.push({
              fn,
              ctx: allocOnTimerCtx(this.game, entity, def.interval),
              interval: def.interval,
              elapsed: 0,
            })
            break
          }
        }
      }
    }
  }

  private compileHook(scriptId: string, source: string): HookFn {
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /import\s*\(/,
      /require\s*\(/,
      /__proto__/,
      /constructor\s*\[/,
    ]
    for (const pattern of dangerousPatterns) {
      if (pattern.test(source)) {
        throw new Error(`Script "${scriptId}" contains potentially dangerous pattern: ${pattern}`)
      }
    }
    const wrappedSource = `
      "use strict";
      return (function(ctx) {
        ${source}
      });
    `
    try {
      const factory = new Function(wrappedSource)
      const run = factory() as (ctx: ScriptCtx) => void
      return (ctx: ScriptCtx) => {
        try {
          run(ctx)
        } catch (e) {
          console.warn(`[ScriptRunner] Runtime error in script "${scriptId}":`, e)
        }
      }
    } catch (e) {
      throw new Error(`Failed to compile script "${scriptId}": ${e}`)
    }
  }

  runOnSpawn(entityId: string): void {
    const list = this.onSpawnHooks.get(entityId)
    if (!list) return
    for (const { fn, ctx } of list) {
      fn(ctx)
    }
  }

  runOnUpdate(dt: number): void {
    for (const { fn, ctx } of this.onUpdateEntries) {
      ctx.dt = dt
      fn(ctx)
    }
    for (const entry of this.onTimerEntries) {
      entry.elapsed += dt
      if (entry.elapsed >= entry.interval) {
        entry.elapsed -= entry.interval
        entry.fn(entry.ctx)
      }
    }
  }

  runOnCollision(entityId: string, otherId: string): void {
    const list = this.onCollisionHooks.get(entityId)
    if (!list) return
    const other = this.entityMap.get(otherId)
    if (!other) return
    for (const { fn, ctx } of list) {
      ctx.other = other
      fn(ctx)
    }
  }
}
