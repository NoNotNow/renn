import Ajv from 'ajv/dist/2020'
import worldSchema from '../../world-schema.json'
import type { EntityAvatarConfig } from '@/types/world'

type AjvError = {
  instancePath?: string
  message: string
}

const ajv = new Ajv({ strict: true, allErrors: true })

// Compile the avatar definition *from the full schema* so `$ref` targets (Vec3/Rotation/etc.) resolve.
ajv.addSchema(worldSchema as object, 'world')
const validateAvatar = ajv.compile({
  $ref: 'world#/$defs/EntityAvatarConfig',
} as object) as (value: unknown) => boolean
const getErrors = (): AjvError[] => (validateAvatar.errors ?? []) as unknown as AjvError[]

export function validateEntityAvatarConfig(value: unknown): { valid: boolean; errors: string[] } {
  const valid = validateAvatar(value)
  if (valid) return { valid: true, errors: [] }
  const errors = getErrors()
    .map((e) => {
      const path = e.instancePath ?? ''
      return `${path || '/'}: ${e.message}`
    })
    .slice(0, 5)
  return { valid: false, errors }
}

export function normalizeAvatarDraft(
  parsed: unknown,
): { avatar: EntityAvatarConfig | undefined; error: string | null } {
  // We accept `null` as "remove avatar config".
  if (parsed === null) return { avatar: undefined, error: null }

  if (typeof parsed !== 'object' || parsed === undefined) {
    return { avatar: undefined, error: 'Avatar config must be an object (or null).' }
  }

  const v = validateEntityAvatarConfig(parsed)
  if (!v.valid) return { avatar: undefined, error: v.errors.join('\n') }

  return { avatar: parsed as EntityAvatarConfig, error: null }
}

