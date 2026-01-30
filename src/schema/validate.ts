import Ajv, { type ValidateFunction } from 'ajv/dist/2020'
import type { RennWorld } from '@/types/world'
import worldSchema from '../../world-schema.json'

const ajv = new Ajv({ strict: true, allErrors: true })
let validateWorld: ValidateFunction<RennWorld> | null = null

function getValidator(): ValidateFunction<RennWorld> {
  if (!validateWorld) {
    validateWorld = ajv.compile(worldSchema as object) as ValidateFunction<RennWorld>
  }
  return validateWorld
}

/**
 * Validates a world document against the JSON schema.
 * Returns the world if valid; throws with errors if invalid.
 */
export function validateWorldDocument(data: unknown): asserts data is RennWorld {
  const validate = getValidator()
  const valid = validate(data)
  if (!valid && validate.errors) {
    const msg = validate.errors.map((e) => `${e.instancePath}: ${e.message}`).join('; ')
    throw new Error(`Invalid world: ${msg}`)
  }
}

/**
 * Returns validation errors without throwing.
 */
export function getValidationErrors(data: unknown): string[] {
  const validate = getValidator()
  validate(data)
  return (validate.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`)
}
