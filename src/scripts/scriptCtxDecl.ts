/**
 * Monaco extraLib declaration strings for script ctx intellisense.
 * Kept in sync with scriptCtx.ts types.
 */
import type { ScriptEvent } from '@/types/world'

const BASE = `
interface Entity {
  id: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  bodyType?: 'static' | 'dynamic' | 'kinematic';
  getPosition(): [number, number, number] | null;
  getRotation(): [number, number, number] | null;
}
interface ScriptCtxBase {
  readonly time: number;
  readonly entity: Entity;
  readonly entities: Entity[];
  getEntity(id: string): Entity | undefined;
  getPosition(id?: string): [number, number, number] | null;
  setPosition(id: string | undefined, x: number, y: number, z: number): void;
  getRotation(id?: string): [number, number, number] | null;
  setRotation(id: string | undefined, x: number, y: number, z: number): void;
  applyForce(id: string, x: number, y: number, z: number): void;
  applyImpulse(id: string, x: number, y: number, z: number): void;
  setTransformerEnabled(entityId: string, transformerType: string, enabled: boolean): void;
  setTransformerParam(entityId: string, transformerType: string, paramName: string, value: unknown): void;
  log(...args: unknown[]): void;
}
`

export function ctxDeclFor(event: ScriptEvent): string {
  const decl =
    event === 'onSpawn'
      ? 'interface OnSpawnCtx extends ScriptCtxBase { readonly event: \'onSpawn\'; }\ndeclare const ctx: OnSpawnCtx;'
      : event === 'onUpdate'
        ? 'interface OnUpdateCtx extends ScriptCtxBase { readonly event: \'onUpdate\'; dt: number; }\ndeclare const ctx: OnUpdateCtx;'
        : event === 'onCollision'
          ? 'interface OnCollisionCtx extends ScriptCtxBase { readonly event: \'onCollision\'; other: Entity; }\ndeclare const ctx: OnCollisionCtx;'
          : 'interface OnTimerCtx extends ScriptCtxBase { readonly event: \'onTimer\'; readonly interval: number; }\ndeclare const ctx: OnTimerCtx;'
  return BASE + decl
}

export const CTX_EXTRA_LIB_URI = 'ts:script-ctx.d.ts'
