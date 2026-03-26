import Ajv, { type ValidateFunction } from 'ajv/dist/2020'
import type { RennWorld } from '@/types/world'
import worldSchema from '../../world-schema.json'

const ajvStrict = new Ajv({ strict: true, allErrors: true })
const ajvTolerant = new Ajv({ strict: true, allErrors: true, removeAdditional: true })

let validateWorldStrict: ValidateFunction<RennWorld> | null = null
let validateWorldTolerant: ValidateFunction<RennWorld> | null = null

export interface ValidateWorldOptions {
  /**
   * If validation fails *only* due to `additionalProperties`, strip unknown keys and re-validate.
   * Useful for forward/backward compatibility between schema versions.
   */
  tolerateAdditionalProperties?: boolean
  /**
   * When tolerant mode strips keys, log warnings with the offending payload.
   * Defaults to true when `tolerateAdditionalProperties` is enabled.
   */
  logAdditionalProperties?: boolean
  /** Max characters of the extracted offending value to embed in the error message. */
  maxOffendingValueChars?: number
  /** Max errors to embed in thrown error message (keeps logs readable). */
  maxErrorsInMessage?: number
}

function getValidatorStrict(): ValidateFunction<RennWorld> {
  if (!validateWorldStrict) {
    validateWorldStrict = ajvStrict.compile(worldSchema as object) as ValidateFunction<RennWorld>
  }
  return validateWorldStrict
}

function getValidatorTolerant(): ValidateFunction<RennWorld> {
  if (!validateWorldTolerant) {
    validateWorldTolerant = ajvTolerant.compile(worldSchema as object) as ValidateFunction<RennWorld>
  }
  return validateWorldTolerant
}

function unescapeJsonPointerSegment(segment: string): string {
  // JSON Pointer: https://datatracker.ietf.org/doc/html/rfc6901#section-3
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function getValueAtJsonPointer(data: unknown, instancePath: string): unknown {
  if (!instancePath || instancePath === '/') return data
  if (!instancePath.startsWith('/')) return undefined
  const segments = instancePath.split('/').slice(1).map(unescapeJsonPointerSegment)
  let cur: any = data
  for (const seg of segments) {
    if (cur == null) return undefined
    if (Array.isArray(cur) && /^\d+$/.test(seg)) {
      cur = cur[Number(seg)]
    } else {
      cur = (cur as Record<string, unknown>)[seg]
    }
  }
  return cur
}

function stringifyLimited(value: unknown, maxChars: number): string {
  try {
    const json = JSON.stringify(value, null, 2)
    if (json.length <= maxChars) return json
    return json.slice(0, maxChars) + `\n... (truncated, ${json.length} chars total)`
  } catch {
    const fallback = String(value)
    if (fallback.length <= maxChars) return fallback
    return fallback.slice(0, maxChars) + `\n... (truncated, ${fallback.length} chars total)`
  }
}

type AjvError = { instancePath: string; message: string; keyword?: string; params?: Record<string, unknown> }

function describeValidationErrors(data: unknown, errors: AjvError[], opts: ValidateWorldOptions): string {
  const maxOffendingValueChars = opts.maxOffendingValueChars ?? 2000
  const maxErrorsInMessage = opts.maxErrorsInMessage ?? 5
  const limited = errors.slice(0, maxErrorsInMessage)
  const suffix = errors.length > maxErrorsInMessage ? ` (+${errors.length - maxErrorsInMessage} more)` : ''

  return (
    limited
      .map((e) => {
        const value = getValueAtJsonPointer(data, e.instancePath)
        const valueStr = stringifyLimited(value, maxOffendingValueChars)
        const additionalProperty = e.params?.additionalProperty
        const addPropSuffix = typeof additionalProperty === 'string' ? ` (additionalProperty: ${additionalProperty})` : ''
        const entityMatch = e.instancePath.match(/^\/entities\/(\d+)(?:\/|$)/)
        const entityIndex = entityMatch ? Number(entityMatch[1]) : null
        const entityId =
          entityIndex != null && typeof data === 'object' && (data as any)?.entities?.[entityIndex]?.id
            ? String((data as any).entities[entityIndex].id)
            : null
        const entitySuffix = entityId ? `; entityId: ${entityId}` : entityIndex != null ? `; entityIndex: ${entityIndex}` : ''

        return `${e.instancePath || '/'}: ${e.message}${addPropSuffix}${entitySuffix}; value: ${valueStr}`
      })
      .join('; ') + suffix
  )
}

/**
 * Validates a world document against the JSON schema.
 * Returns the world if valid; throws with errors if invalid.
 */
export function validateWorldDocument(data: unknown, options: ValidateWorldOptions = {}): asserts data is RennWorld {
  const validateStrict = getValidatorStrict()
  const validStrict = validateStrict(data)
  if (validStrict) return

  const errors = (validateStrict.errors ?? []) as unknown as AjvError[]
  if (errors.length === 0) throw new Error('Invalid world: validation failed without errors')

  const tolerateAdditionalProperties = options.tolerateAdditionalProperties ?? false
  const logAdditionalProperties = options.logAdditionalProperties ?? tolerateAdditionalProperties

  const allAdditionalProperties = errors.every((e) => {
    if (e.keyword === 'additionalProperties') return true
    // Ajv typically uses keyword='additionalProperties', but we fall back to message/params
    // to keep tolerance working across Ajv versions/configs.
    if (e.message.includes('additional properties')) return true
    if (typeof e.params?.additionalProperty === 'string' || typeof e.params?.additionalProperty === 'number') return true
    return false
  })

  if (tolerateAdditionalProperties && allAdditionalProperties) {
    if (logAdditionalProperties) {
      const detail = describeValidationErrors(data, errors, options)
      console.warn('[validateWorldDocument] Stripping additional properties and re-validating. Details:', detail)
    }
    const validateTolerant = getValidatorTolerant()
    const validTolerant = validateTolerant(data)
    if (validTolerant) return
  }

  const msg = describeValidationErrors(data, errors, options)
  throw new Error(`Invalid world: ${msg}`)
}

/**
 * Returns validation errors without throwing.
 */
export function getValidationErrors(data: unknown): string[] {
  const validate = getValidatorStrict()
  validate(data)
  return (validate.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`)
}
