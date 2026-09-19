/**
 * Single migration + validation policy before logic verification host create.
 * Used by bundle loader, inline MCP loads, and headless host (see CONTEXT.md glossary).
 */

import { validateWorldDocument } from '@/schema/validate'
import {
  migrateCustomTransformerNames,
  migrateEntityTransformersToRegistry,
  migrateTransformerPipeDefaultParams,
  migrateTransformerPipeToStack,
  migrateWorldRingShapesToCylinder,
  migrateWorldScripts,
  migrateWorldSimplificationFields,
} from '@/scripts/migrateWorld'
import type { RennWorld } from '@/types/world'

export type PrepareWorldForLogicVerificationOptions = {
  /** When true, mutates `worldJson` in place; otherwise callers should pass a clone. */
  inPlace?: boolean
}

/**
 * Applies repo import migrations and schema validation for verification loads.
 * Returns a `RennWorld` document ready for `createLogicVerificationHost`.
 */
export function prepareWorldForLogicVerification(
  worldJson: unknown,
  options: PrepareWorldForLogicVerificationOptions = {},
): RennWorld {
  const doc = options.inPlace ? worldJson : structuredClone(worldJson)
  migrateWorldScripts(doc)
  migrateCustomTransformerNames(doc)
  migrateEntityTransformersToRegistry(doc)
  migrateTransformerPipeToStack(doc)
  migrateTransformerPipeDefaultParams(doc)
  migrateWorldSimplificationFields(doc)
  migrateWorldRingShapesToCylinder(doc)
  validateWorldDocument(doc, {
    tolerateAdditionalProperties: true,
    logAdditionalProperties: true,
  })
  return doc as RennWorld
}
