/**
 * Monaco extraLib declaration strings for script ctx intellisense.
 * Built from ENTITY_VIEW_METHODS in scriptCtx.ts (single source of truth).
 */
import type { ScriptEvent } from '@/types/world'
import { ENTITY_VIEW_METHODS } from './scriptCtx'

function buildEntityInterface(): string {
  const methodLines = ENTITY_VIEW_METHODS.map((m) => `  ${m.entityDecl};`).join('\n')
  return `interface Entity {
  id: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  bodyType?: 'static' | 'dynamic' | 'kinematic';
${methodLines}
  readonly detect: BoundDetectHelpers;
  readonly touching: EntityTouching;
}`
}

function buildEntityTouchingInterface(): string {
  return `/** Narrow-phase contact neighbors (same semantics as physics touching). */
interface EntityTouching {
  readonly list: Entity[];
  readonly empty: boolean;
}`
}

function buildBoundDetectInterface(): string {
  return `/** Orientation detection bound to one entity (no id param). */
interface BoundDetectHelpers {
  isUpsideDown(): boolean;
  isUpright(): boolean;
  isLyingOnSide(): boolean;
  isLyingOnBack(): boolean;
  isLyingOnFront(): boolean;
  isTilted(): boolean;
}`
}

function buildDetectHelpersInterface(): string {
  return `/** Orientation detection (threshold 0.5; optional id = current entity). */
interface DetectHelpers {
  isUpsideDown(id?: string): boolean;
  isUpright(id?: string): boolean;
  isLyingOnSide(id?: string): boolean;
  isLyingOnBack(id?: string): boolean;
  isLyingOnFront(id?: string): boolean;
  isTilted(id?: string): boolean;
}`
}

function buildScriptCtxBaseInterface(): string {
  const methodLines = ENTITY_VIEW_METHODS.map((m) => `  ${m.ctxDecl};`).join('\n')
  return `interface ScriptCtxBase {
  readonly time: number;
  readonly entity: Entity;
  readonly entities: Entity[];
  readonly detect: DetectHelpers;
  getEntity(id: string): Entity | undefined;
${methodLines}
  setTransformerEnabled(entityId: string, transformerType: string, enabled: boolean): void;
  setTransformerParam(entityId: string, transformerType: string, paramName: string, value: unknown): void;
  log(...args: unknown[]): void;
  snackbar(message: string, durationSeconds?: number): void;
  setScore(value: number): void;
  getScore(): number;
  setDamage(value: number): void;
  getDamage(): number;
}`
}

const BASE = `
${buildEntityTouchingInterface()}
${buildEntityInterface()}
${buildBoundDetectInterface()}
${buildDetectHelpersInterface()}
${buildScriptCtxBaseInterface()}
`

export function ctxDeclFor(event: ScriptEvent): string {
  const decl =
    event === 'onSpawn'
      ? 'interface OnSpawnCtx extends ScriptCtxBase { readonly event: \'onSpawn\'; }\ndeclare const ctx: OnSpawnCtx;'
      : event === 'onUpdate'
        ? 'interface OnUpdateCtx extends ScriptCtxBase { readonly event: \'onUpdate\'; dt: number; }\ndeclare const ctx: OnUpdateCtx;'
        : event === 'onCollision'
          ? 'interface CollisionImpact { totalForce: [number, number, number]; totalForceMagnitude: number; maxForceMagnitude: number; maxForceDirection: [number, number, number]; }\ninterface OnCollisionCtx extends ScriptCtxBase { readonly event: \'onCollision\'; other: Entity; impact: CollisionImpact; }\ndeclare const ctx: OnCollisionCtx;'
          : 'interface OnTimerCtx extends ScriptCtxBase { readonly event: \'onTimer\'; readonly interval: number; }\ndeclare const ctx: OnTimerCtx;'
  return BASE + decl
}

export const CTX_EXTRA_LIB_URI = 'ts:script-ctx.d.ts'
