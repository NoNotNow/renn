import Ajv, { type ValidateFunction } from 'ajv/dist/2020'
import type { RennWorld } from '@/types/world'
import worldSchema from '../../world-schema.json'

const ajvStrict = new Ajv({ strict: true, allErrors: true })

let validateWorldStrict: ValidateFunction<RennWorld> | null = null

export interface ValidateWorldOptions {
  /**
   * If strict validation fails only due to `additionalProperties`, remove those keys (iteratively, using
   * Ajv error locations) and re-validate. Uses a deep clone as fallback when in-place deletes fail (e.g. frozen
   * objects). Does not use global `removeAdditional`, which would break `oneOf` shapes in the schema.
   */
  tolerateAdditionalProperties?: boolean
  /**
   * When stripping was applied, append human-readable messages (e.g. for a UI snackbar).
   */
  warningsOut?: string[]
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

function cloneWorldDocumentForStripping(data: unknown): unknown {
  try {
    return structuredClone(data)
  } catch {
    return JSON.parse(JSON.stringify(data)) as unknown
  }
}

/**
 * Writes stripped top-level world fields onto the original object (same root reference),
 * so callers holding the root keep a stable reference while nested data matches the schema.
 */
function applyStrippedWorldOntoOriginal(original: unknown, stripped: unknown): void {
  if (typeof original !== 'object' || original === null || typeof stripped !== 'object' || stripped === null) {
    return
  }
  const o = original as Record<string, unknown>
  const s = stripped as Record<string, unknown>
  o.version = s.version
  o.world = s.world
  o.entities = s.entities
  if ('assets' in s) o.assets = s.assets
  else delete o.assets
  if ('scripts' in s) o.scripts = s.scripts
  else delete o.scripts
  for (const key of Object.keys(o)) {
    if (!(key in s)) delete o[key]
  }
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

function isAdditionalPropertyError(e: AjvError): boolean {
  if (e.keyword === 'additionalProperties') return true
  if (e.message.includes('additional properties')) return true
  if (typeof e.params?.additionalProperty === 'string' || typeof e.params?.additionalProperty === 'number')
    return true
  return false
}

const MAX_STRIP_ROUNDS = 100

/**
 * Removes keys reported by strict `additionalProperties` errors until the document validates or progress stops.
 */
function stripAdditionalPropertiesIteratively(mutate: unknown): boolean {
  const validateStrict = getValidatorStrict()
  for (let round = 0; round < MAX_STRIP_ROUNDS; round++) {
    if (validateStrict(mutate)) return true
    const errors = (validateStrict.errors ?? []) as unknown as AjvError[]
    if (errors.length === 0) return false
    if (!errors.every(isAdditionalPropertyError)) return false

    let removedAny = false
    for (const e of errors) {
      const prop = e.params?.additionalProperty
      const key =
        typeof prop === 'string' ? prop : typeof prop === 'number' ? String(prop) : null
      if (key == null) continue
      const parent = getValueAtJsonPointer(mutate, e.instancePath)
      if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
        if (Object.prototype.hasOwnProperty.call(parent, key)) {
          const deleted = Reflect.deleteProperty(parent as Record<string, unknown>, key)
          if (deleted) removedAny = true
        }
      }
    }
    if (!removedAny) return false
  }
  return false
}

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
  const warningsOut = options.warningsOut

  if (tolerateAdditionalProperties) {
    const detail = describeValidationErrors(data, errors, options)

    if (stripAdditionalPropertiesIteratively(data)) {
      const summary =
        'Unknown or deprecated fields were removed so the world could load. Details: ' + detail
      warningsOut?.push(summary)
      if (logAdditionalProperties) {
        console.warn('[validateWorldDocument] ' + summary)
      }
      return
    }

    const stripped = cloneWorldDocumentForStripping(data)
    if (stripAdditionalPropertiesIteratively(stripped)) {
      applyStrippedWorldOntoOriginal(data, stripped)
      if (validateStrict(data)) {
        const summary =
          'Unknown or deprecated fields were removed so the world could load. Details: ' + detail
        warningsOut?.push(summary)
        if (logAdditionalProperties) {
          console.warn('[validateWorldDocument] ' + summary)
        }
        return
      }
    }
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
